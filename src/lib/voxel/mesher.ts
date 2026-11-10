/**
 * Voxel meshing shared by the browser terrain worker and the build pipeline.
 *
 * Geometry is emitted as "quads": one record per merged rectangle of block faces.
 *   origin (x, y, z)  — min corner of the rectangle, in blocks
 *   du, dv            — extent along the face's two tangent axes
 *   dir               — 0:+X 1:−X 2:+Y 3:−Y 4:+Z 5:−Z
 *   mat               — palette id
 * Tangent axes: X faces → (Z, Y); Y faces → (X, Z); Z faces → (X, Y).
 * The renderer draws each record as one GPU instance of a unit quad.
 */
import { SUB_DEPTH, isBuiltSurface, sideProfile } from './palette'

export const DIR = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 } as const

export class QuadSink {
  origin: Uint16Array
  quad: Uint8Array
  feature: Uint16Array | null
  count = 0
  constructor(capacity = 4096, withFeature = false) {
    this.origin = new Uint16Array(capacity * 3)
    this.quad = new Uint8Array(capacity * 4)
    this.feature = withFeature ? new Uint16Array(capacity) : null
  }
  private grow() {
    const cap = (this.origin.length / 3) * 2
    const o = new Uint16Array(cap * 3)
    o.set(this.origin)
    this.origin = o
    const q = new Uint8Array(cap * 4)
    q.set(this.quad)
    this.quad = q
    if (this.feature) {
      const f = new Uint16Array(cap)
      f.set(this.feature)
      this.feature = f
    }
  }
  push(x: number, y: number, z: number, du: number, dv: number, dir: number, mat: number, feature = 0): number {
    if (this.count * 3 >= this.origin.length) this.grow()
    const n = this.count++
    this.origin[n * 3] = x
    this.origin[n * 3 + 1] = y
    this.origin[n * 3 + 2] = z
    this.quad[n * 4] = du
    this.quad[n * 4 + 1] = dv
    this.quad[n * 4 + 2] = dir
    this.quad[n * 4 + 3] = mat
    if (this.feature) this.feature[n] = feature
    return n
  }
  trimmed() {
    return {
      origin: this.origin.slice(0, this.count * 3),
      quad: this.quad.slice(0, this.count * 4),
      feature: this.feature ? this.feature.slice(0, this.count) : null,
      count: this.count,
    }
  }
}

/**
 * Greedy rectangle merge over a w×h mask (0 = empty). The mask is consumed.
 * `maxSpan` caps rectangle edges so sizes fit in a byte.
 */
export function greedy2D(mask: Uint16Array | Uint8Array | Int32Array, w: number, h: number, emit: (u: number, v: number, du: number, dv: number, value: number) => void, maxSpan = 255): void {
  for (let v = 0; v < h; v++) {
    const row = v * w
    for (let u = 0; u < w;) {
      const val = mask[row + u]
      if (val === 0) {
        u++
        continue
      }
      let du = 1
      while (u + du < w && du < maxSpan && mask[row + u + du] === val) du++
      let dv = 1
      outer: while (v + dv < h && dv < maxSpan) {
        const r2 = (v + dv) * w + u
        for (let k = 0; k < du; k++) if (mask[r2 + k] !== val) break outer
        dv++
      }
      for (let b = 0; b < dv; b++) {
        const r2 = (v + b) * w + u
        for (let a = 0; a < du; a++) mask[r2 + a] = 0
      }
      emit(u, v, du, dv, val)
      u += du
    }
  }
}

export interface ColumnGrid {
  w: number
  d: number
  /** Solid blocks above the slab floor per column (top face sits at this Y, biased). */
  height: Uint16Array
  /** Palette id of the top block per column. */
  surface: Uint8Array
}

/**
 * Meshes one terrain chunk from the column grid. X/Z in the output are chunk-local,
 * Y is the biased absolute block height.
 */
export function meshTerrainChunk(grid: ColumnGrid, cx: number, cz: number, chunk: number): QuadSink {
  const { w, d, height, surface } = grid
  const x0 = cx * chunk
  const z0 = cz * chunk
  const sx = Math.min(chunk, w - x0)
  const sz = Math.min(chunk, d - z0)
  const sink = new QuadSink(sx * sz > 4096 ? 8192 : 2048)

  // --- top faces: greedy over (height, surface) ---
  const mask = new Int32Array(sx * sz)
  for (let j = 0; j < sz; j++) {
    const gi = (z0 + j) * w + x0
    for (let i = 0; i < sx; i++) mask[j * sx + i] = (height[gi + i] << 8) | surface[gi + i] | (1 << 30)
  }
  greedy2D(
    mask,
    sx,
    sz,
    (u, v, du, dv, val) => {
      sink.push(u, (val >> 8) & 0xffff, v, du, dv, DIR.PY, val & 0xff)
    },
    chunk,
  )

  // --- side faces: up to three material bands per exposed column edge, merged along the edge ---
  const runY0 = new Int32Array(3)
  const runY1 = new Int32Array(3)
  const runMat = new Int32Array(3)
  const runIdx = new Int32Array(3)
  const bandY0 = new Int32Array(3)
  const bandY1 = new Int32Array(3)
  const bandMat = new Int32Array(3)

  const side = (dir: number, alongX: boolean) => {
    const outer = alongX ? sz : sx
    const inner = alongX ? sx : sz
    const dx = dir === DIR.PX ? 1 : dir === DIR.NX ? -1 : 0
    const dz = dir === DIR.PZ ? 1 : dir === DIR.NZ ? -1 : 0
    for (let o = 0; o < outer; o++) {
      runIdx[0] = runIdx[1] = runIdx[2] = -1
      for (let n = 0; n < inner; n++) {
        const i = alongX ? n : o
        const j = alongX ? o : n
        const gx = x0 + i
        const gz = z0 + j
        const gi = gz * w + gx
        const h = height[gi]
        const nx = gx + dx
        const nz = gz + dz
        const outside = nx < 0 || nz < 0 || nx >= w || nz >= d
        const hn = outside ? 0 : height[nz * w + nx]
        let nb = 0
        if (hn < h) {
          const s = surface[gi]
          const prof = sideProfile(s)
          const ns = outside ? 0 : surface[nz * w + nx]
          const m0 = prof[0]
          let m1 = prof[1]
          let m2 = prof[2]
          // cut slopes above paved ground read as retaining walls
          if (!outside && h - hn >= 3 && isBuiltSurface(ns) && !isBuiltSurface(s)) {
            m1 = 17
            m2 = 17
          }
          const a = Math.max(hn, h - 1)
          const b = Math.max(hn, h - 1 - SUB_DEPTH)
          if (h > a) {
            bandY0[nb] = a
            bandY1[nb] = h
            bandMat[nb] = m0
            nb++
          }
          if (a > b) {
            bandY0[nb] = b
            bandY1[nb] = a
            bandMat[nb] = m1
            nb++
          }
          if (b > hn) {
            // split very tall walls so dv fits in a byte
            let y = hn
            while (b - y > 255) {
              sink.push(alongX ? i : i + (dx > 0 ? 1 : 0), y, alongX ? j + (dz > 0 ? 1 : 0) : j, 1, 255, dir, m2)
              y += 255
            }
            bandY0[nb] = y
            bandY1[nb] = b
            bandMat[nb] = m2
            nb++
          }
        }
        for (let k = 0; k < 3; k++) {
          if (k < nb) {
            if (runIdx[k] >= 0 && runY0[k] === bandY0[k] && runY1[k] === bandY1[k] && runMat[k] === bandMat[k] && sink.quad[runIdx[k] * 4] < 255) {
              sink.quad[runIdx[k] * 4]++
            } else {
              const ox = alongX ? i : i + (dx > 0 ? 1 : 0)
              const oz = alongX ? j + (dz > 0 ? 1 : 0) : j
              runIdx[k] = sink.push(ox, bandY0[k], oz, 1, bandY1[k] - bandY0[k], dir, bandMat[k])
              runY0[k] = bandY0[k]
              runY1[k] = bandY1[k]
              runMat[k] = bandMat[k]
            }
          } else runIdx[k] = -1
        }
      }
    }
  }
  side(DIR.PZ, true)
  side(DIR.NZ, true)
  side(DIR.PX, false)
  side(DIR.NX, false)
  return sink
}

/**
 * Dense voxel volume used by the build pipeline for structures (buildings, bridges…).
 * Coordinates are absolute grid columns (i, j) and biased block heights (y).
 */
export class Volume {
  readonly data: Uint8Array
  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
  ) {
    this.data = new Uint8Array(sx * sy * sz)
  }
  inside(i: number, y: number, j: number) {
    return i >= this.ox && j >= this.oz && y >= this.oy && i < this.ox + this.sx && j < this.oz + this.sz && y < this.oy + this.sy
  }
  get(i: number, y: number, j: number): number {
    if (!this.inside(i, y, j)) return 0
    return this.data[((y - this.oy) * this.sz + (j - this.oz)) * this.sx + (i - this.ox)]
  }
  set(i: number, y: number, j: number, m: number) {
    if (!this.inside(i, y, j)) return
    this.data[((y - this.oy) * this.sz + (j - this.oz)) * this.sx + (i - this.ox)] = m
  }
  /** Fill only where currently empty. */
  add(i: number, y: number, j: number, m: number) {
    if (this.inside(i, y, j) && this.get(i, y, j) === 0) this.set(i, y, j, m)
  }
  fill(i0: number, y0: number, j0: number, i1: number, y1: number, j1: number, m: number) {
    for (let y = y0; y <= y1; y++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.set(i, y, j, m)
  }
}

/**
 * Greedy-meshes a volume into quads. `terrainTop(i, j)` returns the biased terrain
 * height of a column so faces buried in the ground are skipped.
 */
export function meshVolume(vol: Volume, sink: QuadSink, feature: number, terrainTop: (i: number, j: number) => number): void {
  const { ox, oy, oz, sx, sy, sz, data } = vol
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : data[(y * sz + z) * sx + x])
  // ±X : mask over (z, y)
  let mask = new Uint8Array(sz * sy)
  for (const dir of [DIR.PX, DIR.NX]) {
    const s = dir === DIR.PX ? 1 : -1
    for (let x = 0; x < sx; x++) {
      let any = false
      for (let y = 0; y < sy; y++)
        for (let z = 0; z < sz; z++) {
          const m = at(x, y, z)
          let v = 0
          if (m && !at(x + s, y, z) && oy + y >= terrainTop(ox + x + s, oz + z)) v = m
          mask[y * sz + z] = v
          if (v) any = true
        }
      if (any) greedy2D(mask, sz, sy, (u, v, du, dv, val) => sink.push(ox + x + (s > 0 ? 1 : 0), oy + v, oz + u, du, dv, dir, val, feature))
    }
  }
  // ±Y : mask over (x, z)
  mask = new Uint8Array(sx * sz)
  for (const dir of [DIR.PY, DIR.NY]) {
    const s = dir === DIR.PY ? 1 : -1
    for (let y = 0; y < sy; y++) {
      let any = false
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) {
          const m = at(x, y, z)
          let v = 0
          if (m && !at(x, y + s, z)) {
            const t = terrainTop(ox + x, oz + z)
            if (s > 0 ? oy + y + 1 > t : oy + y > t) v = m
          }
          mask[z * sx + x] = v
          if (v) any = true
        }
      if (any) greedy2D(mask, sx, sz, (u, v, du, dv, val) => sink.push(ox + u, oy + y + (s > 0 ? 1 : 0), oz + v, du, dv, dir, val, feature))
    }
  }
  // ±Z : mask over (x, y)
  mask = new Uint8Array(sx * sy)
  for (const dir of [DIR.PZ, DIR.NZ]) {
    const s = dir === DIR.PZ ? 1 : -1
    for (let z = 0; z < sz; z++) {
      let any = false
      for (let y = 0; y < sy; y++)
        for (let x = 0; x < sx; x++) {
          const m = at(x, y, z)
          let v = 0
          if (m && !at(x, y, z + s) && oy + y >= terrainTop(ox + x, oz + z + s)) v = m
          mask[y * sx + x] = v
          if (v) any = true
        }
      if (any) greedy2D(mask, sx, sy, (u, v, du, dv, val) => sink.push(ox + u, oy + v, oz + z + (s > 0 ? 1 : 0), du, dv, dir, val, feature))
    }
  }
}
