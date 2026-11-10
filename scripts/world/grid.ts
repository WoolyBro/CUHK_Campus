/** Grid + rasterisation helpers for the world builder. Grid cell (i, j) covers block column
 *  x ∈ [minX+i, minX+i+1), z ∈ [minZ+j, minZ+j+1); "grid coordinates" are floats in that frame. */
import type { MultiPolygon, Polygon, Position } from 'geojson'
import { WORLD } from '../../src/lib/geo/constants'
import { lonLatToWorld } from '../../src/lib/geo/projection'

export const W = WORLD.sizeX
export const D = WORLD.sizeZ
export const N = W * D
/** Flat [x0, z0, x1, z1, …] polyline / ring in grid coordinates. */
export type Ring = Float64Array

export const cellIndex = (i: number, j: number) => j * W + i
export const inGrid = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < D

export function toGrid(lon: number, lat: number): [number, number] {
  const { x, z } = lonLatToWorld(lon, lat)
  return [x - WORLD.minX, z - WORLD.minZ]
}

export function projectLine(coords: Position[]): Ring {
  const out = new Float64Array(coords.length * 2)
  for (let k = 0; k < coords.length; k++) {
    const [gx, gz] = toGrid(coords[k][0], coords[k][1])
    out[k * 2] = gx
    out[k * 2 + 1] = gz
  }
  return out
}

/** All rings (outer + holes of every polygon) of an area geometry. Even-odd fill handles holes. */
export function ringsOf(geom: Polygon | MultiPolygon): Ring[] {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  const rings: Ring[] = []
  for (const poly of polys) for (const ring of poly) if (ring.length >= 4) rings.push(projectLine(ring))
  return rings
}

export function ringsBBox(rings: Ring[]): [number, number, number, number] {
  let a = Infinity,
    b = Infinity,
    c = -Infinity,
    d = -Infinity
  for (const r of rings)
    for (let k = 0; k < r.length; k += 2) {
      a = Math.min(a, r[k])
      c = Math.max(c, r[k])
      b = Math.min(b, r[k + 1])
      d = Math.max(d, r[k + 1])
    }
  return [a, b, c, d]
}

export function ringArea(r: Ring): number {
  let s = 0
  for (let k = 0; k + 3 < r.length; k += 2) s += r[k] * r[k + 3] - r[k + 2] * r[k + 1]
  return Math.abs(s) / 2
}

/** Scanline even-odd polygon fill on cell centres. Returns the covered cell indices. */
export function rasterPolygon(rings: Ring[]): Int32Array {
  const [, minZ, , maxZ] = ringsBBox(rings)
  const out: number[] = []
  const j0 = Math.max(0, Math.ceil(minZ - 0.5))
  const j1 = Math.min(D - 1, Math.floor(maxZ - 0.5))
  const xs: number[] = []
  for (let j = j0; j <= j1; j++) {
    const zc = j + 0.5
    xs.length = 0
    for (const r of rings) {
      for (let k = 0; k + 3 < r.length; k += 2) {
        const z1 = r[k + 1],
          z2 = r[k + 3]
        if ((z1 <= zc && z2 > zc) || (z2 <= zc && z1 > zc)) xs.push(r[k] + ((zc - z1) / (z2 - z1)) * (r[k + 2] - r[k]))
      }
    }
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] - 0.5))
      const i1 = Math.min(W - 1, Math.ceil(xs[k + 1] - 0.5) - 1)
      for (let i = i0; i <= i1; i++) out.push(j * W + i)
    }
  }
  return Int32Array.from(out)
}

export function lineLength(pts: Ring): number {
  let s = 0
  for (let k = 0; k + 3 < pts.length; k += 2) s += Math.hypot(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1])
  return s
}

/** Point at distance `s` along a polyline, plus the unit tangent. */
export function pointAlong(pts: Ring, s: number): [number, number, number, number] {
  let acc = 0
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const dx = pts[k + 2] - pts[k],
      dz = pts[k + 3] - pts[k + 1]
    const len = Math.hypot(dx, dz)
    if (len > 0 && (acc + len >= s || k + 5 >= pts.length)) {
      const t = Math.min(1, Math.max(0, (s - acc) / len))
      return [pts[k] + dx * t, pts[k + 1] + dz * t, dx / len, dz / len]
    }
    acc += len
  }
  return [pts[0], pts[1], 1, 0]
}

const bestDist = new Float32Array(N).fill(Infinity)
const bestS = new Float32Array(N)
const bestSide = new Int8Array(N)

/**
 * Stamps a polyline with half-width `halfW` (blocks). Calls back once per covered cell with the
 * distance `s` along the line of the nearest point, the perpendicular distance, and which side
 * (+1 / −1) of the line the cell lies on.
 */
export function stampLine(pts: Ring, halfW: number, cb: (cell: number, s: number, dist: number, side: number) => void): void {
  const touched: number[] = []
  let acc = 0
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k],
      az = pts[k + 1],
      bx = pts[k + 2],
      bz = pts[k + 3]
    const dx = bx - ax,
      dz = bz - az
    const len2 = dx * dx + dz * dz
    const len = Math.sqrt(len2)
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - halfW - 0.5)),
      i1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + halfW - 0.5))
    const j0 = Math.max(0, Math.floor(Math.min(az, bz) - halfW - 0.5)),
      j1 = Math.min(D - 1, Math.ceil(Math.max(az, bz) + halfW - 0.5))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5 - ax,
          pz = j + 0.5 - az
        const t = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + pz * dz) / len2)) : 0
        const ex = px - dx * t,
          ez = pz - dz * t
        const dist = Math.hypot(ex, ez)
        if (dist <= halfW) {
          const c = j * W + i
          if (bestDist[c] === Infinity) touched.push(c)
          if (dist < bestDist[c]) {
            bestDist[c] = dist
            bestS[c] = acc + t * len
            bestSide[c] = dx * pz - dz * px >= 0 ? 1 : -1
          }
        }
      }
    acc += len
  }
  for (const c of touched) {
    cb(c, bestS[c], bestDist[c], bestSide[c])
    bestDist[c] = Infinity
  }
}

/** Deterministic integer hash → [0, 1). */
export function hash2(x: number, z: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise in [0, 1). */
export function valueNoise(x: number, z: number, scale: number, seed = 0): number {
  const fx = x / scale,
    fz = z / scale
  const x0 = Math.floor(fx),
    z0 = Math.floor(fz)
  let tx = fx - x0,
    tz = fz - z0
  tx = tx * tx * (3 - 2 * tx)
  tz = tz * tz * (3 - 2 * tz)
  const a = hash2(x0, z0, seed),
    b = hash2(x0 + 1, z0, seed),
    c = hash2(x0, z0 + 1, seed),
    d = hash2(x0 + 1, z0 + 1, seed)
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function strSeed(s: string): number {
  let h = 2166136261
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619)
  return h >>> 0
}

/**
 * Chamfer distance (in blocks, capped at `maxD`) from every cell to the nearest cell where
 * `mask` is non-zero.
 */
export function distanceTo(mask: Uint8Array, maxD: number): Uint8Array {
  const INF = 255
  const cap = Math.min(maxD, 254)
  const d = new Uint8Array(N).fill(INF)
  let frontier: number[] = []
  for (let c = 0; c < N; c++)
    if (mask[c]) {
      d[c] = 0
      frontier.push(c)
    }
  for (let step = 1; step <= cap && frontier.length; step++) {
    const next: number[] = []
    for (const c of frontier) {
      const i = c % W,
        j = (c / W) | 0
      if (i > 0 && d[c - 1] === INF) {
        d[c - 1] = step
        next.push(c - 1)
      }
      if (i < W - 1 && d[c + 1] === INF) {
        d[c + 1] = step
        next.push(c + 1)
      }
      if (j > 0 && d[c - W] === INF) {
        d[c - W] = step
        next.push(c - W)
      }
      if (j < D - 1 && d[c + W] === INF) {
        d[c + W] = step
        next.push(c + W)
      }
    }
    frontier = next
  }
  return d
}

export function percentile(values: number[] | Float32Array, p: number): number {
  const a = Array.from(values).sort((x, y) => x - y)
  if (!a.length) return 0
  return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]
}
