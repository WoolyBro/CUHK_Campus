/**
 * Terrain shaping driven by real features: sea from the OSM coastline, level sports grounds and
 * ponds, roads/paths graded along their real centre-lines, bridge decks, blended shoulders.
 */
import type { Feature, Geometry, LineString, MultiPolygon, Polygon } from 'geojson'
import { M } from '../../src/lib/voxel/palette'
import { D, N, W, distanceTo, hash2, lineLength, percentile, pointAlong, projectLine, rasterPolygon, ringsOf, stampLine, strSeed, type Ring } from './grid'
import type { State } from './types'

type Tags = Record<string, string>
export type F = Feature<Geometry, { id: string; kind: string; group: string; tags: Tags; inCampus: boolean; flags: string[]; areaM2?: number }>

export interface WaySpec {
  half: number
  win: number
  kerb: number
  surf: number
  prio: 1 | 3
  line?: boolean
  steps?: boolean
  rail?: boolean
}
export interface DeckCell {
  c: number
  y: number
  mat: number
  edge: boolean
  foot: boolean
}
export interface WayRec {
  id: string
  pts: Ring
  len: number
  spec: WaySpec
  tags: Tags
  kind: string
  inCampus: boolean
}

const isArea = (g: Geometry): g is Polygon | MultiPolygon => g.type === 'Polygon' || g.type === 'MultiPolygon'

export function waySpec(tags: Tags, forBridge = false): WaySpec | null {
  if (!forBridge && tags.tunnel && tags.tunnel !== 'no') return null
  if (tags.indoor === 'yes' || tags.highway === 'corridor' || tags.highway === 'elevator') return null
  if (tags.location === 'underground') return null
  if (tags.railway === 'rail') return { half: 2.6, win: 110, kerb: 0, surf: M.RAIL_BALLAST, prio: 3, rail: true }
  let s: WaySpec
  switch (tags.highway) {
    case 'motorway':
    case 'trunk':
      s = { half: 5.5, win: 90, kerb: 0, surf: M.ASPHALT, prio: 3 }
      break
    case 'motorway_link':
    case 'trunk_link':
      s = { half: 3.4, win: 60, kerb: 0, surf: M.ASPHALT, prio: 3 }
      break
    case 'primary':
    case 'secondary':
      s = { half: 4, win: 30, kerb: 1.2, surf: M.ASPHALT, prio: 3, line: true }
      break
    case 'primary_link':
    case 'secondary_link':
    case 'tertiary_link':
      s = { half: 3, win: 24, kerb: 1, surf: M.ASPHALT, prio: 3 }
      break
    case 'tertiary':
      s = { half: 3.5, win: 28, kerb: 1.2, surf: M.ASPHALT, prio: 3, line: true }
      break
    case 'unclassified':
      s = { half: 3.2, win: 24, kerb: 1, surf: M.ASPHALT, prio: 3, line: true }
      break
    case 'residential':
    case 'living_street':
      s = { half: 2.9, win: 22, kerb: 1, surf: M.ASPHALT, prio: 3 }
      break
    case 'service':
      s = { half: tags.service === 'driveway' ? 1.7 : 2.2, win: 14, kerb: 0, surf: M.ASPHALT, prio: 3 }
      break
    case 'track':
      s = { half: 1.5, win: 10, kerb: 0, surf: M.GRAVEL, prio: 1 }
      break
    case 'construction':
      s = { half: 2.4, win: 14, kerb: 0, surf: M.SOIL, prio: 1 }
      break
    case 'pedestrian':
      s = { half: 2.2, win: 10, kerb: 0, surf: M.PAVERS, prio: 1 }
      break
    case 'cycleway':
      s = { half: 1.5, win: 12, kerb: 0, surf: M.PAVEMENT, prio: 1 }
      break
    case 'footway':
    case 'bridleway':
      if (tags.footway === 'crossing') return null
      s = { half: tags.footway === 'sidewalk' ? 0.9 : 1.1, win: 8, kerb: 0, surf: M.PAVEMENT, prio: 1 }
      break
    case 'path':
      s = { half: 0.9, win: 6, kerb: 0, surf: M.GRAVEL, prio: 1 }
      break
    case 'steps':
      s = { half: 1.1, win: 3, kerb: 0, surf: M.STAIRS, prio: 1, steps: true }
      break
    default:
      return null
  }
  const width = parseFloat(tags.width ?? '')
  if (width > 0.6 && width < 40) s.half = Math.max(0.6, width / 2)
  const lanes = Number(tags.lanes)
  if (s.prio === 3 && lanes >= 1 && lanes <= 8) s.half = Math.max(s.half, lanes * 1.75)
  if (!s.steps) {
    switch (tags.surface) {
      case 'sett':
      case 'paving_stones':
      case 'cobblestone':
        s.surf = M.PAVERS
        break
      case 'bricks':
        s.surf = M.PLAZA_BRICK
        break
      case 'concrete':
        if (s.prio === 1) s.surf = M.PAVEMENT
        break
      case 'unpaved':
      case 'gravel':
      case 'ground':
      case 'dirt':
      case 'earth':
      case 'fine_gravel':
        s.surf = M.GRAVEL
        break
      case 'grass':
        s.surf = M.LAWN
        break
    }
  }
  return s
}

export function lineRecs(features: F[], forBridge = false): WayRec[] {
  const out: WayRec[] = []
  for (const f of features) {
    if (f.geometry.type !== 'LineString') continue
    const spec = waySpec(f.properties.tags, forBridge)
    if (!spec) continue
    const pts = projectLine((f.geometry as LineString).coordinates)
    const len = lineLength(pts)
    if (len < 1) continue
    out.push({ id: f.properties.id, pts, len, spec, tags: f.properties.tags, kind: f.properties.kind, inCampus: f.properties.inCampus })
  }
  return out
}

export function makeSea(S: State, coast: F[]): void {
  const barrier = new Uint8Array(N)
  for (const f of coast) {
    if (f.geometry.type !== 'LineString') continue
    stampLine(projectLine((f.geometry as LineString).coordinates), 0.9, (c) => {
      barrier[c] = 1
    })
  }
  const queue: number[] = []
  for (let c = 0; c < N; c++)
    if (S.elev0[c] <= 0.05 && !barrier[c]) {
      S.sea[c] = 1
      queue.push(c)
    }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q],
      i = c % W,
      j = (c / W) | 0
    for (const n of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, j > 0 ? c - W : -1, j < D - 1 ? c + W : -1]) {
      if (n >= 0 && !S.sea[n] && !barrier[n] && S.elev0[n] < 2.2) {
        S.sea[n] = 1
        queue.push(n)
      }
    }
  }
  // remove specks of "sea" that are not connected to open water at the map edge
  const open = new Uint8Array(N)
  const q2: number[] = []
  for (let i = 0; i < W; i++)
    for (const c of [i, (D - 1) * W + i])
      if (S.sea[c] && !open[c]) {
        open[c] = 1
        q2.push(c)
      }
  for (let j = 0; j < D; j++)
    for (const c of [j * W, j * W + W - 1])
      if (S.sea[c] && !open[c]) {
        open[c] = 1
        q2.push(c)
      }
  for (let q = 0; q < q2.length; q++) {
    const c = q2[q],
      i = c % W,
      j = (c / W) | 0
    for (const n of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, j > 0 ? c - W : -1, j < D - 1 ? c + W : -1])
      if (n >= 0 && S.sea[n] && !open[n]) {
        open[n] = 1
        q2.push(n)
      }
  }
  for (let c = 0; c < N; c++) {
    if (S.sea[c] && !open[c]) S.sea[c] = 0
    if (S.sea[c]) S.elev[c] = 0
    else if (S.elev[c] < 1.6) S.elev[c] = 1.6
  }
}

/** Diffusion fill of terrain under bridges so decks span real gaps instead of sitting on DSM ridges. */
export function inpaint(S: State, mask: Uint8Array): void {
  const known = new Uint8Array(N)
  for (let c = 0; c < N; c++) known[c] = mask[c] ? 0 : 1
  let frontier: number[] = []
  for (let c = 0; c < N; c++) if (mask[c]) frontier.push(c)
  for (let guard = 0; frontier.length && guard < 200; guard++) {
    const next: number[] = [],
      fill: [number, number][] = []
    for (const c of frontier) {
      const i = c % W,
        j = (c / W) | 0
      let s = 0,
        n = 0
      if (i > 0 && known[c - 1]) {
        s += S.elev[c - 1]
        n++
      }
      if (i < W - 1 && known[c + 1]) {
        s += S.elev[c + 1]
        n++
      }
      if (j > 0 && known[c - W]) {
        s += S.elev[c - W]
        n++
      }
      if (j < D - 1 && known[c + W]) {
        s += S.elev[c + W]
        n++
      }
      if (n) fill.push([c, s / n])
      else next.push(c)
    }
    for (const [c, v] of fill) {
      S.elev[c] = Math.min(S.elev[c], v)
      known[c] = 1
    }
    if (!fill.length) break
    frontier = next
  }
}

function harmonic(S: State, cells: Int32Array, iters: number): void {
  for (let it = 0; it < iters; it++)
    for (const c of cells) {
      const i = c % W,
        j = (c / W) | 0
      if (i === 0 || j === 0 || i === W - 1 || j === D - 1) continue
      S.elev[c] = (S.elev[c - 1] + S.elev[c + 1] + S.elev[c - W] + S.elev[c + W]) / 4
    }
}

export function applyAreas(S: State, facilities: F[], water: F[]): void {
  const order = ['construction', 'parking', 'road-area', 'plaza', 'playground', 'track', 'pitch', 'platform', 'pier', 'swimming_pool', 'fountain']
  const list = facilities.filter((f) => order.includes(f.properties.kind) && isArea(f.geometry)).sort((a, b) => order.indexOf(a.properties.kind) - order.indexOf(b.properties.kind))
  for (const f of list) {
    const { kind, tags, id } = f.properties
    if (tags.location === 'underground' || tags.indoor === 'yes' || tags.parking === 'underground' || tags.parking === 'multi-storey' || Number(tags.layer) < 0) continue
    const all = rasterPolygon(ringsOf(f.geometry as Polygon))
    const cells = all.filter((c) => !S.bld[c] && (kind === 'pier' || !S.sea[c]) && S.lock[c] !== 5)
    if (cells.length < 3) continue
    const elevs = Array.from(cells, (c) => S.elev[c])
    const p10 = percentile(elevs, 0.1),
      p50 = percentile(elevs, 0.5),
      p90 = percentile(elevs, 0.9)
    let surf: number = M.PAVEMENT
    let level: number | null = null
    let lock = 2
    switch (kind) {
      case 'construction':
        surf = M.SOIL
        break
      case 'parking':
        surf = M.PARKING
        level = p90 - p10 <= 2.5 ? p50 : null
        break
      case 'road-area':
        surf = M.ASPHALT
        break
      case 'plaza':
        surf = tags.surface === 'bricks' ? M.PLAZA_BRICK : tags.surface === 'asphalt' ? M.PAVEMENT : hash2(strSeed(id), 7, 1) < 0.45 ? M.PLAZA_BRICK : M.PAVERS
        level = p90 - p10 <= 2.5 ? p50 : null
        break
      case 'playground':
        surf = M.PAVERS
        level = p50
        break
      case 'track':
        surf = M.TRACK_RED
        level = p50
        break
      case 'pitch':
        surf = /tennis|multi/.test(tags.sport ?? '')
          ? M.COURT_GREEN
          : /basketball|volleyball|netball/.test(tags.sport ?? '')
            ? M.COURT_BLUE
            : tags.surface && tags.surface !== 'grass' && tags.surface !== 'artificial_turf'
              ? M.COURT_GREEN
              : M.PITCH_GRASS
        level = p50
        break
      case 'platform':
        surf = tags.railway === 'platform' || tags.train === 'yes' ? M.PLATFORM : M.PAVEMENT
        level = tags.railway === 'platform' || tags.train === 'yes' ? p50 + 1 : null
        break
      case 'pier':
        surf = M.PAVEMENT
        level = 2.4
        break
      case 'swimming_pool':
        surf = M.POOL
        level = p50 - 0.6
        lock = 5
        break
      case 'fountain':
        surf = M.WATER
        level = p50 - 0.4
        lock = 5
        break
    }
    for (const c of cells) {
      if (level !== null) S.elev[c] = level
      S.surf[c] = surf
      S.lock[c] = lock
      if (kind === 'pier') S.sea[c] = 0
    }
    if (level === null) harmonic(S, cells, 24)
  }
  for (const f of water) {
    if (!isArea(f.geometry)) continue
    const cells = rasterPolygon(ringsOf(f.geometry)).filter((c) => !S.bld[c] && !S.sea[c])
    if (cells.length < 2) continue
    const level =
      percentile(
        Array.from(cells, (c) => S.elev[c]),
        0.1,
      ) - 0.8
    for (const c of cells) {
      S.elev[c] = level
      S.surf[c] = M.WATER
      S.lock[c] = 5
    }
  }
}

export function applyStreams(S: State, water: F[]): void {
  for (const f of water) {
    const { kind, tags } = f.properties
    if (f.geometry.type !== 'LineString' || (kind !== 'stream' && kind !== 'drain') || tags.tunnel) continue
    stampLine(projectLine((f.geometry as LineString).coordinates), 0.8, (c) => {
      if (S.lock[c] !== 0 || S.bld[c] || S.sea[c]) return
      S.elev[c] -= 0.7
      S.surf[c] = M.WATER
      S.lock[c] = 5
    })
  }
}

function sampleElev(S: State, x: number, z: number): number {
  const i = Math.min(W - 1, Math.max(0, Math.floor(x))),
    j = Math.min(D - 1, Math.max(0, Math.floor(z)))
  return S.elev[j * W + i]
}

function profile(S: State, w: WayRec): Float32Array {
  const n = Math.max(2, Math.ceil(w.len) + 1)
  const raw = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const [x, z] = pointAlong(w.pts, (k * w.len) / (n - 1))
    raw[k] = sampleElev(S, x, z)
  }
  const r = Math.floor(Math.min(w.spec.win, w.len) / 2)
  if (r < 1) return raw
  const pre = new Float64Array(n + 1)
  for (let k = 0; k < n; k++) pre[k + 1] = pre[k] + raw[k]
  const out = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const rr = Math.min(r, k, n - 1 - k) // shrink the window at the ends so junction heights are kept
    out[k] = (pre[k + rr + 1] - pre[k - rr]) / (rr * 2 + 1)
  }
  return out
}

function relax(S: State, cells: number[], iters: number, ok: (lock: number) => boolean): void {
  for (let it = 0; it < iters; it++)
    for (const c of cells) {
      const i = c % W,
        j = (c / W) | 0
      let s = S.elev[c] * 2,
        n = 2
      if (i > 0 && ok(S.lock[c - 1])) {
        s += S.elev[c - 1]
        n++
      }
      if (i < W - 1 && ok(S.lock[c + 1])) {
        s += S.elev[c + 1]
        n++
      }
      if (j > 0 && ok(S.lock[c - W])) {
        s += S.elev[c - W]
        n++
      }
      if (j < D - 1 && ok(S.lock[c + W])) {
        s += S.elev[c + W]
        n++
      }
      S.elev[c] = s / n
    }
}

export function applyRoads(S: State, roads: WayRec[]): void {
  const tSum = new Float32Array(N),
    tCnt = new Uint16Array(N),
    core = new Uint8Array(N)
  const lines: number[] = []
  for (const w of roads) {
    const prof = profile(S, w)
    const n = prof.length - 1
    stampLine(w.pts, w.spec.half + w.spec.kerb, (c, s, dist) => {
      if (S.bld[c] || S.sea[c] || S.lock[c] > 3) return
      tSum[c] += prof[Math.min(n, Math.round((s / w.len) * n))]
      tCnt[c]++
      if (dist <= w.spec.half) {
        core[c] = 1
        S.surf[c] = w.spec.rail ? (dist < 1.1 ? M.RAIL_TRACK : M.RAIL_BALLAST) : w.spec.surf
      } else if (!core[c]) S.surf[c] = M.PAVEMENT
      S.lock[c] = 3
    })
    if (w.spec.line)
      stampLine(w.pts, 0.55, (c, s) => {
        if (Math.floor(s / 3) % 2 === 0) lines.push(c)
      })
  }
  const cells: number[] = []
  for (let c = 0; c < N; c++)
    if (tCnt[c]) {
      S.elev[c] = tSum[c] / tCnt[c]
      cells.push(c)
    }
  relax(S, cells, 26, (l) => l === 3)
  for (const c of lines) if (S.surf[c] === M.ASPHALT) S.surf[c] = M.ASPHALT_LINE
}

export function applyPaths(S: State, paths: WayRec[]): void {
  const tSum = new Float32Array(N),
    tCnt = new Uint16Array(N)
  for (const w of paths) {
    const prof = profile(S, w)
    const n = prof.length - 1
    stampLine(w.pts, w.spec.half, (c, s) => {
      if (S.bld[c] || S.sea[c] || S.lock[c] > 1) return
      tSum[c] += prof[Math.min(n, Math.round((s / w.len) * n))]
      tCnt[c]++
      if (w.spec.steps || S.surf[c] === 0 || S.lock[c] === 0) S.surf[c] = w.spec.surf
      S.lock[c] = 1
    })
  }
  const cells: number[] = []
  for (let c = 0; c < N; c++)
    if (tCnt[c]) {
      S.elev[c] = tSum[c] / tCnt[c]
      if (S.surf[c] !== M.STAIRS) cells.push(c)
    }
  relax(S, cells, 8, (l) => l >= 1 && l <= 3)
}

/**
 * Bridges: deck heights are interpolated between the ground at both ends (level if only one end
 * touches ground). Returns deck cells that clear the terrain — those become structures.
 */
export function applyBridges(S: State, bridges: WayRec[], groundWays: WayRec[]): { decks: DeckCell[]; piers: { x: number; z: number; y: number }[] } {
  const key = (x: number, z: number) => `${Math.round(x * 4)},${Math.round(z * 4)}`
  const ground = new Set<string>()
  for (const w of groundWays) for (let k = 0; k < w.pts.length; k += 2) ground.add(key(w.pts[k], w.pts[k + 1]))
  interface Node {
    h: number
    fixed: boolean
    nb: [string, number][]
  }
  const nodes = new Map<string, Node>()
  const node = (x: number, z: number) => {
    const k = key(x, z)
    if (!nodes.has(k)) nodes.set(k, { h: sampleElev(S, x, z), fixed: ground.has(k), nb: [] })
    return k
  }
  const ends: [string, string][] = []
  for (const w of bridges) {
    const a = node(w.pts[0], w.pts[1]),
      b = node(w.pts[w.pts.length - 2], w.pts[w.pts.length - 1])
    nodes.get(a)!.nb.push([b, w.len])
    nodes.get(b)!.nb.push([a, w.len])
    ends.push([a, b])
  }
  for (let it = 0; it < 400; it++)
    for (const nd of nodes.values()) {
      if (nd.fixed) continue
      let s = 0,
        wsum = 0
      for (const [k, len] of nd.nb) {
        const wgt = 1 / Math.max(1, len)
        s += nodes.get(k)!.h * wgt
        wsum += wgt
      }
      if (wsum) nd.h = s / wsum
    }
  const decks: DeckCell[] = []
  const piers: { x: number; z: number; y: number }[] = []
  const seen = new Map<number, number>()
  bridges.forEach((w, wi) => {
    const hA = nodes.get(ends[wi][0])!.h,
      hB = nodes.get(ends[wi][1])!.h
    const half = w.spec.half + (w.spec.prio === 3 ? w.spec.kerb * 0.5 : 0.4)
    stampLine(w.pts, half, (c, s, dist) => {
      if (S.bld[c]) return
      const hd = hA + (hB - hA) * (s / w.len)
      const y = Math.round(hd)
      const g = S.sea[c] ? 0 : Math.round(S.elev[c])
      if (y - g <= 1) {
        if (!S.sea[c] && S.lock[c] <= 1) {
          S.elev[c] = Math.max(S.elev[c], hd)
          S.surf[c] = w.spec.surf
          S.lock[c] = w.spec.prio === 3 ? 3 : 1
        }
        return
      }
      const prev = seen.get(c)
      const mat = w.spec.rail ? (dist < 1.1 ? M.RAIL_TRACK : M.RAIL_BALLAST) : w.spec.surf
      if (prev !== undefined) {
        // overlapping bridge segments: keep the core surface, drop the railing
        if (dist <= half - 1) {
          decks[prev].edge = false
          decks[prev].mat = mat
        }
        return
      }
      seen.set(c, decks.length)
      decks.push({ c, y, mat, edge: dist > half - 1, foot: w.spec.prio === 1 })
    })
    const step = w.spec.prio === 3 ? 16 : 12
    for (let s = step / 2; s < w.len - 2; s += step) {
      const [x, z] = pointAlong(w.pts, s)
      piers.push({ x, z, y: Math.round(hA + (hB - hA) * (s / w.len)) })
    }
  })
  return { decks, piers }
}

/** Blend the first few natural cells beside roads/paths toward the graded surface. */
export function blendShoulders(S: State): void {
  const carried = new Float32Array(N)
  const ring = new Uint8Array(N)
  let frontier: number[] = []
  for (let c = 0; c < N; c++)
    if (S.lock[c] === 1 || S.lock[c] === 3) {
      carried[c] = S.elev[c]
      frontier.push(c)
    }
  for (let d = 1; d <= 3; d++) {
    const next: number[] = []
    for (const c of frontier) {
      const i = c % W,
        j = (c / W) | 0
      for (const n of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, j > 0 ? c - W : -1, j < D - 1 ? c + W : -1]) {
        if (n < 0 || ring[n] || S.lock[n] !== 0 || S.bld[n] || S.sea[n]) continue
        ring[n] = d
        carried[n] = carried[c]
        next.push(n)
      }
    }
    frontier = next
  }
  for (let c = 0; c < N; c++) {
    if (!ring[c]) continue
    const diff = carried[c] - S.elev[c]
    if (Math.abs(diff) < 9) S.elev[c] += diff * (1 - ring[c] / 4)
  }
}

export { distanceTo }
