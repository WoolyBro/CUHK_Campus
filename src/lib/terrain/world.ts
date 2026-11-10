/**
 * In-memory world model on the main thread: column data for picking, camera collision and
 * terrain following, plus the feature catalogue. Geometry itself lives on the GPU.
 */
import type { FeatureRecord, WorldMeta } from '../voxel/world-format'

export interface PickHit {
  x: number
  y: number
  z: number
  /** Feature index (0 = terrain / unselectable structure). */
  feature: number
  kind: 'terrain' | 'structure'
  distance: number
}

export class World {
  readonly W: number
  readonly D: number
  readonly minX: number
  readonly minZ: number
  readonly bias: number
  height: Uint16Array | null = null
  surface: Uint8Array | null = null
  sBot: Uint16Array | null = null
  sTop: Uint16Array | null = null
  sFeat: Uint16Array | null = null
  zone: Uint8Array | null = null
  features: FeatureRecord[] = []
  byKey = new Map<string, FeatureRecord>()
  maxY = 320

  constructor(readonly meta: WorldMeta) {
    this.W = meta.world.sizeX
    this.D = meta.world.sizeZ
    this.minX = meta.world.minX
    this.minZ = meta.world.minZ
    this.bias = meta.yBias
  }

  setFeatures(list: FeatureRecord[]) {
    this.features = list
    this.byKey = new Map(list.map((f) => [f.key, f]))
  }
  feature(i: number | null | undefined): FeatureRecord | undefined {
    return i ? this.features[i - 1] : undefined
  }
  get ready() {
    return this.height !== null
  }
  get maxX() {
    return this.minX + this.W
  }
  get maxZ() {
    return this.minZ + this.D
  }

  private col(x: number, z: number): number {
    const i = Math.min(this.W - 1, Math.max(0, Math.floor(x - this.minX)))
    const j = Math.min(this.D - 1, Math.max(0, Math.floor(z - this.minZ)))
    return j * this.W + i
  }

  /** Terrain surface height (world Y) at a point. */
  groundAt(x: number, z: number): number {
    if (!this.height) return 0
    return this.height[this.col(x, z)] - this.bias
  }

  /** Bilinearly smoothed terrain height — used for jitter-free camera following. */
  groundSmooth(x: number, z: number): number {
    if (!this.height) return 0
    const fx = x - 0.5,
      fz = z - 0.5
    const x0 = Math.floor(fx),
      z0 = Math.floor(fz)
    const tx = fx - x0,
      tz = fz - z0
    const a = this.groundAt(x0 + 0.5, z0 + 0.5),
      b = this.groundAt(x0 + 1.5, z0 + 0.5)
    const c = this.groundAt(x0 + 0.5, z0 + 1.5),
      d = this.groundAt(x0 + 1.5, z0 + 1.5)
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
  }

  /** Highest solid surface (terrain or structure roof) at a point. */
  topAt(x: number, z: number): number {
    if (!this.height || !this.sTop) return 0
    const c = this.col(x, z)
    return Math.max(this.height[c], this.sTop[c]) - this.bias
  }

  /** Structure span [bottom, top) in world Y at a point, or null. */
  structureAt(x: number, z: number): [number, number] | null {
    if (!this.sTop || !this.sBot) return null
    const c = this.col(x, z)
    return this.sTop[c] ? [this.sBot[c] - this.bias, this.sTop[c] - this.bias] : null
  }

  /** Surface a walker with feet at `feetY` would stand on here (bridges and roofs when above them). */
  standAt(x: number, z: number, feetY: number): number {
    const g = this.groundSmooth(x, z)
    const s = this.structureAt(x, z)
    if (s && feetY >= s[1] - 1.3 && s[1] > g) return s[1]
    return g
  }

  /** True when a body from feetY to headY would intersect a structure at this column. */
  blocked(x: number, z: number, feetY: number, headY: number): boolean {
    if (x < this.minX + 1 || z < this.minZ + 1 || x > this.maxX - 1 || z > this.maxZ - 1) return true
    const s = this.structureAt(x, z)
    if (!s) return false
    return s[0] < headY && s[1] > feetY + 1.3
  }

  zoneAt(x: number, z: number): number {
    if (!this.zone) return 0
    const { scale, w, d } = this.meta.zoneGrid
    const i = Math.min(w - 1, Math.max(0, Math.floor((x - this.minX) / scale)))
    const j = Math.min(d - 1, Math.max(0, Math.floor((z - this.minZ) / scale)))
    return this.zone[j * w + i]
  }

  /**
   * Casts a ray through the column grid (2-D DDA). Works for both camera projections and needs
   * no triangle data, so it is cheap enough to run on every pointer move.
   */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist = 9000): PickHit | null {
    const { height, sBot, sTop, sFeat } = this
    if (!height || !sBot || !sTop || !sFeat) return null
    const W = this.W,
      D = this.D
    // to grid space
    let px = ox - this.minX,
      py = oy + this.bias,
      pz = oz - this.minZ
    // clip to the world box
    let t0 = 0,
      t1 = maxDist
    const clip = (p: number, d: number, lo: number, hi: number): boolean => {
      if (Math.abs(d) < 1e-9) return p >= lo && p <= hi
      let a = (lo - p) / d,
        b = (hi - p) / d
      if (a > b) [a, b] = [b, a]
      t0 = Math.max(t0, a)
      t1 = Math.min(t1, b)
      return t0 <= t1
    }
    if (!clip(px, dx, 0, W) || !clip(pz, dz, 0, D) || !clip(py, dy, 0, this.maxY + this.bias + 60)) return null
    t0 += 1e-4
    px += dx * t0
    py += dy * t0
    pz += dz * t0
    let i = Math.min(W - 1, Math.max(0, Math.floor(px))),
      j = Math.min(D - 1, Math.max(0, Math.floor(pz)))
    const stepI = dx > 0 ? 1 : -1,
      stepJ = dz > 0 ? 1 : -1
    const tDeltaX = Math.abs(dx) < 1e-9 ? Infinity : Math.abs(1 / dx),
      tDeltaZ = Math.abs(dz) < 1e-9 ? Infinity : Math.abs(1 / dz)
    let tMaxX = Math.abs(dx) < 1e-9 ? Infinity : ((dx > 0 ? i + 1 : i) - px) / dx
    let tMaxZ = Math.abs(dz) < 1e-9 ? Infinity : ((dz > 0 ? j + 1 : j) - pz) / dz
    let t = 0
    const tEnd = t1 - t0
    for (let guard = 0; guard < 8000 && t <= tEnd; guard++) {
      if (i < 0 || j < 0 || i >= W || j >= D) break
      const tExit = Math.min(tMaxX, tMaxZ, tEnd)
      const c = j * W + i
      const yIn = py + dy * t,
        yOut = py + dy * tExit
      let best = Infinity,
        kind: PickHit['kind'] = 'terrain',
        feat = 0
      const h = height[c]
      if (yIn < h) best = t
      else if (yOut < h && dy < 0) best = t + (h - yIn) / dy
      const st = sTop[c]
      if (st) {
        const sb = sBot[c]
        let ts = Infinity
        if (yIn >= sb && yIn < st) ts = t
        else if (yIn >= st && yOut < st && dy < 0) ts = t + (st - yIn) / dy
        else if (yIn < sb && yOut >= sb && dy > 0) ts = t + (sb - yIn) / dy
        if (ts < best) {
          best = ts
          kind = 'structure'
          feat = sFeat[c]
        }
      }
      if (best !== Infinity) {
        const tt = best + t0
        return { x: ox + dx * tt, y: oy + dy * tt, z: oz + dz * tt, feature: feat, kind, distance: tt }
      }
      if (tMaxX < tMaxZ) {
        t = tMaxX
        tMaxX += tDeltaX
        i += stepI
      } else {
        t = tMaxZ
        tMaxZ += tDeltaZ
        j += stepJ
      }
    }
    return null
  }
}
