/**
 * Procedural block architecture. Every building starts from its real rasterised footprint and
 * is turned into intentionally block-built form: floor bands, window bays that follow the real
 * wall directions, plinths on sloping ground, parapets, roof plant, entrances and canopies.
 *
 *  Tier A → bespoke models in landmarks.ts (which reuse the helpers here)
 *  Tier B → generic(): style chosen from zone + category, seeded per building id
 *  Tier C → approx(): plain massing, no invented detail
 */
import { M } from '../../src/lib/voxel/palette'
import { Volume } from '../../src/lib/voxel/mesher'
import { D, W, cellIndex, mulberry32, ringArea, strSeed, type Ring } from './grid'
import type { Bld, State } from './types'

export type Pattern = 'strip' | 'punched' | 'curtain' | 'fins' | 'balcony' | 'blank'
export interface Style {
  wall: number
  band: number
  plinth: number
  window: number
  glass: number
  roof: number
  accent: number
  pattern: Pattern
  ground: 'solid' | 'arcade' | 'glass'
  bay: number
  parapet: boolean
  roofType: 'flat' | 'hip'
  roofTile: number
  equipment: boolean
}

export interface Prep {
  pad: number
  ox: number
  oz: number
  sx: number
  sz: number
  inside: Uint8Array
  /** 0 = outside, 1 = boundary cell, 2+ = deeper inside (4-neighbour steps). */
  dist: Uint8Array
  edgeT: Float32Array
  edgeL: Float32Array
  edgeI: Int16Array
  nx: Float32Array
  nz: Float32Array
  /** Lowest ground level (biased) directly outside each boundary cell. */
  gOut: Uint16Array
  minGround: number
  longestEdge: number
  /** Oriented bounding box: unit axis along the long side, centre and half extents (grid units). */
  ux: number
  uz: number
  cx: number
  cz: number
  halfLen: number
  halfWid: number
}

export const PAD = 4

export function orientedBox(rings: Ring[]) {
  let main = rings[0]
  for (const r of rings) if (ringArea(r) > ringArea(main)) main = r
  let best = { area: Infinity, ux: 1, uz: 0, cx: 0, cz: 0, halfLen: 1, halfWid: 1 }
  for (let k = 0; k + 3 < main.length; k += 2) {
    const dx = main[k + 2] - main[k],
      dz = main[k + 3] - main[k + 1]
    const len = Math.hypot(dx, dz)
    if (len < 1.5) continue
    const ux = dx / len,
      uz = dz / len
    let a0 = Infinity,
      a1 = -Infinity,
      b0 = Infinity,
      b1 = -Infinity
    for (let q = 0; q < main.length; q += 2) {
      const a = main[q] * ux + main[q + 1] * uz
      const b = -main[q] * uz + main[q + 1] * ux
      a0 = Math.min(a0, a)
      a1 = Math.max(a1, a)
      b0 = Math.min(b0, b)
      b1 = Math.max(b1, b)
    }
    const area = (a1 - a0) * (b1 - b0)
    if (area < best.area) {
      const ca = (a0 + a1) / 2,
        cb = (b0 + b1) / 2
      const cx = ca * ux - cb * uz,
        cz = ca * uz + cb * ux
      if (a1 - a0 >= b1 - b0) best = { area, ux, uz, cx, cz, halfLen: (a1 - a0) / 2, halfWid: (b1 - b0) / 2 }
      else best = { area, ux: -uz, uz: ux, cx, cz, halfLen: (b1 - b0) / 2, halfWid: (a1 - a0) / 2 }
    }
  }
  return best
}

export function prepare(b: Bld, S: State): Prep {
  const pad = PAD
  const ox = b.i0 - pad,
    oz = b.j0 - pad
  const sx = b.i1 - b.i0 + 1 + pad * 2,
    sz = b.j1 - b.j0 + 1 + pad * 2
  const n = sx * sz
  const inside = new Uint8Array(n)
  for (const c of b.cells) inside[(((c / W) | 0) - oz) * sx + ((c % W) - ox)] = 1
  const dist = new Uint8Array(n)
  let frontier: number[] = []
  for (let l = 0; l < n; l++) {
    if (!inside[l]) continue
    const li = l % sx
    if (li === 0 || li === sx - 1 || l < sx || l >= n - sx || !inside[l - 1] || !inside[l + 1] || !inside[l - sx] || !inside[l + sx]) {
      dist[l] = 1
      frontier.push(l)
    }
  }
  for (let step = 2; frontier.length && step < 250; step++) {
    const next: number[] = []
    for (const l of frontier)
      for (const q of [l - 1, l + 1, l - sx, l + sx])
        if (inside[q] && !dist[q]) {
          dist[q] = step
          next.push(q)
        }
    frontier = next
  }

  // nearest real wall segment for every boundary cell → bay rhythm follows true wall directions
  const edgeT = new Float32Array(n),
    edgeL = new Float32Array(n),
    nx = new Float32Array(n),
    nz = new Float32Array(n)
  const edgeI = new Int16Array(n)
  const gOut = new Uint16Array(n)
  let minGround = Infinity
  let longestEdge = 0,
    longestLen = 0
  {
    let e = 0
    for (const r of b.rings)
      for (let k = 0; k + 3 < r.length; k += 2, e++) {
        const len = Math.hypot(r[k + 2] - r[k], r[k + 3] - r[k + 1])
        if (len > longestLen) {
          longestLen = len
          longestEdge = e
        }
      }
  }
  for (let l = 0; l < n; l++) {
    if (!inside[l]) continue
    const li = l % sx,
      lj = (l / sx) | 0
    const gi = ox + li,
      gj = oz + lj
    minGround = Math.min(minGround, S.H[cellIndex(gi, gj)])
    if (dist[l] !== 1) continue
    const px = gi + 0.5,
      pz = gj + 0.5
    let bestD = Infinity,
      e = 0
    for (const r of b.rings)
      for (let k = 0; k + 3 < r.length; k += 2, e++) {
        const ax = r[k],
          az = r[k + 1],
          dx = r[k + 2] - ax,
          dz = r[k + 3] - az
        const len2 = dx * dx + dz * dz
        if (len2 < 1e-6) continue
        const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / len2))
        const d = Math.hypot(px - ax - dx * t, pz - az - dz * t)
        if (d < bestD) {
          bestD = d
          const len = Math.sqrt(len2)
          edgeT[l] = t * len
          edgeL[l] = len
          edgeI[l] = e
          nx[l] = dz / len
          nz[l] = -dx / len
        }
      }
    // orient the normal outward
    const tx = li + Math.round(nx[l]),
      tz = lj + Math.round(nz[l])
    if (tx >= 0 && tz >= 0 && tx < sx && tz < sz && inside[tz * sx + tx]) {
      nx[l] = -nx[l]
      nz[l] = -nz[l]
    }
    let g = 65535
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const qi = li + di,
        qj = lj + dj
      if (qi < 0 || qj < 0 || qi >= sx || qj >= sz || !inside[qj * sx + qi]) g = Math.min(g, S.H[cellIndex(Math.min(W - 1, Math.max(0, ox + qi)), Math.min(D - 1, Math.max(0, oz + qj)))])
    }
    gOut[l] = g === 65535 ? S.H[cellIndex(gi, gj)] : g
    minGround = Math.min(minGround, gOut[l])
  }
  const ob = orientedBox(b.rings)
  return { pad, ox, oz, sx, sz, inside, dist, edgeT, edgeL, edgeI, nx, nz, gOut, minGround, longestEdge, ...ob }
}

export function makeVolume(b: Bld, P: Prep, extraTop = 12): Volume {
  const y0 = Math.min(P.minGround, b.base) - 1
  return new Volume(P.ox, y0, P.oz, P.sx, b.base + b.hBlocks + extraTop - y0, P.sz)
}

const Z = { CENTRAL: 1, CC: 2, NA: 3, UC: 4, SHAW: 5, RES: 6, EAST: 7, MORN: 8, SHHO: 9, CWC: 10, WYS: 11, LWS: 12, A39: 13 }

export function pickStyle(b: Bld): Style {
  const r = mulberry32(strSeed(b.id + ':style'))
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)]
  const st: Style = {
    wall: M.WALL_CONCRETE,
    band: M.SLAB,
    plinth: M.CONCRETE,
    window: M.WINDOW,
    glass: M.GLASS_BLUE,
    roof: M.ROOF_FLAT,
    accent: M.SLAB,
    pattern: 'strip',
    ground: 'solid',
    bay: 4,
    parapet: true,
    roofType: 'flat',
    roofTile: M.ROOF_TILE_GREY,
    equipment: true,
  }
  switch (b.zoneId) {
    case Z.CENTRAL:
      st.wall = pick([M.WALL_CONCRETE, M.WALL_CONCRETE, M.WALL_TILE_BEIGE, M.WALL_GREY])
      st.window = M.WINDOW_STRIP
      break
    case Z.CC:
      st.wall = pick([M.WALL_WHITE, M.WALL_CREAM, M.WALL_TILE_BEIGE])
      st.plinth = M.WALL_STONE
      st.pattern = pick<Pattern>(['strip', 'punched'])
      st.window = st.pattern === 'strip' ? M.WINDOW_STRIP : M.WINDOW
      break
    case Z.NA:
      st.wall = pick([M.WALL_TILE_BEIGE, M.WALL_BRICK_BROWN, M.WALL_CONCRETE])
      st.pattern = 'punched'
      st.band = M.WALL_CONCRETE
      break
    case Z.UC:
      st.wall = pick([M.WALL_GREY, M.WALL_CONCRETE, M.WALL_WHITE])
      st.window = M.WINDOW_STRIP
      break
    case Z.SHAW:
      st.wall = pick([M.WALL_WHITE, M.WALL_PINK, M.WALL_WHITE])
      st.pattern = 'punched'
      st.accent = M.ACCENT_RED
      break
    case Z.RES:
      st.wall = pick([M.WALL_CREAM, M.WALL_WHITE, M.WALL_TILE_BEIGE])
      st.pattern = 'punched'
      break
    case Z.EAST:
      st.wall = pick([M.WALL_GREY, M.WALL_WHITE])
      st.window = M.WINDOW_STRIP
      break
    case Z.MORN:
      st.wall = M.WALL_TILE_BEIGE
      st.pattern = 'punched'
      st.accent = M.ACCENT_RED
      break
    case Z.SHHO:
      st.wall = M.WALL_WHITE
      st.pattern = 'punched'
      st.accent = M.ACCENT_BLUE
      break
    case Z.CWC:
      st.wall = M.WALL_CREAM
      st.pattern = 'punched'
      st.accent = M.ACCENT_GREEN
      break
    case Z.WYS:
      st.wall = M.WALL_WHITE
      st.pattern = 'punched'
      st.accent = M.WALL_TERRACOTTA
      break
    case Z.LWS:
      st.wall = M.WALL_GREY
      st.pattern = 'punched'
      st.accent = M.ACCENT_BLUE
      break
    case Z.A39:
      st.wall = M.WALL_WHITE
      st.window = M.WINDOW_STRIP
      st.glass = M.GLASS_GREEN
      break
    default:
      st.wall = pick([M.WALL_WHITE, M.WALL_CREAM, M.WALL_GREY])
  }
  if (b.category === 'residence' || b.category === 'hotel') {
    st.pattern = b.levels >= 4 && r() < 0.6 ? 'balcony' : 'punched'
    st.window = M.WINDOW
    st.bay = 3
  } else if (b.category === 'sports') {
    st.pattern = 'blank'
    st.window = M.WINDOW_STRIP
  } else if (b.levels >= 12) {
    st.pattern = 'curtain'
    st.band = st.wall
  }
  if (b.category === 'utility') {
    st.pattern = 'blank'
    st.equipment = false
  }
  if (b.areaM2 < 140) {
    st.equipment = false
    st.bay = 3
  }
  if (b.category === 'academic' && b.areaM2 > 900 && r() < 0.35) st.ground = 'arcade'
  return st
}

/** Material of one façade block. */
export function facadeBlock(st: Style, b: Bld, P: Prep, l: number, y: number): number {
  const rel = y - b.base
  const g = P.gOut[l]
  if (y <= g && st.plinth !== st.wall) return st.plinth
  if (rel < 0 && y < g + 1) return st.plinth
  const L = P.edgeL[l],
    t = P.edgeT[l]
  const fh = b.floorH
  const f = Math.floor(rel / fh),
    r = rel - f * fh
  const nb = Math.max(1, Math.round(L / st.bay))
  const bayLen = L / nb
  const frac = ((t / L) * nb) % 1
  const corner = L < 3.5 || t < 1 || t > L - 1
  const pier = corner || frac < 0.5 / bayLen || frac >= 1 - 0.5 / bayLen
  if (rel >= b.hBlocks - 1 && st.pattern !== 'curtain') return st.pattern === 'punched' || st.pattern === 'balcony' ? st.accent : st.band
  if (f === 0 && st.ground !== 'solid') {
    if (r === fh - 1) return st.band
    if (st.ground === 'arcade') return pier ? M.COLUMN : M.DOOR
    return pier ? st.wall : st.glass
  }
  const winRow = r === 1 || r === 2
  switch (st.pattern) {
    case 'strip':
      return r === 0 ? st.band : winRow && !corner ? st.window : st.wall
    case 'punched':
      return winRow && !pier ? st.window : st.wall
    case 'curtain':
      return r === 0 ? st.band : corner ? st.wall : st.glass
    case 'fins':
      return pier ? M.COLUMN : r === 0 ? st.band : st.glass
    case 'balcony':
      return r === 0 ? M.SLAB : pier ? st.wall : r === 1 ? M.BALCONY : st.window
    case 'blank':
      return rel >= b.hBlocks - 4 && rel < b.hBlocks - 2 && !pier ? st.window : st.wall
  }
}

/** Fills the footprint with a styled shell + roof. `topAt` lets bespoke models vary the height per cell. */
export function shell(vol: Volume, b: Bld, S: State, P: Prep, st: Style, topAt?: (l: number) => number): void {
  const fullTop = b.base + b.hBlocks
  for (let l = 0; l < P.inside.length; l++) {
    if (!P.inside[l]) continue
    const i = P.ox + (l % P.sx),
      j = P.oz + ((l / P.sx) | 0)
    const g = Math.min(S.H[cellIndex(i, j)], b.base)
    const top = topAt ? topAt(l) : fullTop
    if (top <= g) continue
    if (P.dist[l] === 1) {
      for (let y = g; y < top; y++) vol.set(i, y, j, top === fullTop ? facadeBlock(st, b, P, l, y) : y === top - 1 ? st.band : facadeBlock(st, b, P, l, y))
      if (st.parapet) vol.set(i, top, j, st.band)
    } else {
      for (let y = g; y < top - 1; y++) vol.set(i, y, j, st.wall)
      vol.set(i, top - 1, j, st.roof)
    }
  }
}

export function hipRoof(vol: Volume, b: Bld, P: Prep, tile: number, pitch = 0.5, maxRise = 6, overhang = false): number {
  const eave = b.base + b.hBlocks
  let peak = eave
  for (let l = 0; l < P.inside.length; l++) {
    if (!P.inside[l]) continue
    const i = P.ox + (l % P.sx),
      j = P.oz + ((l / P.sx) | 0)
    const rise = Math.min(maxRise, Math.floor((P.dist[l] - 1) * pitch) + 1)
    for (let y = eave; y < eave + rise; y++) vol.set(i, y, j, tile)
    peak = Math.max(peak, eave + rise)
    if (overhang && P.dist[l] === 1) {
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        vol.add(i + di, eave, j + dj, tile)
    }
  }
  return peak
}

/** Gable roof along the footprint's long axis. Returns the peak height. */
export function gableRoof(vol: Volume, b: Bld, P: Prep, tile: number, gableWall: number, pitch = 0.7, eaveDrop = 0): number {
  const eave = b.base + b.hBlocks - eaveDrop
  let peak = eave
  for (let l = 0; l < P.inside.length; l++) {
    if (!P.inside[l]) continue
    const i = P.ox + (l % P.sx),
      j = P.oz + ((l / P.sx) | 0)
    const px = i + 0.5 - P.cx,
      pz = j + 0.5 - P.cz
    const across = Math.abs(-px * P.uz + pz * P.ux)
    const rise = Math.max(1, Math.round((P.halfWid - across) * pitch) + 1)
    for (let y = eave; y < eave + rise; y++) vol.set(i, y, j, y === eave + rise - 1 || P.dist[l] > 1 ? tile : gableWall)
    peak = Math.max(peak, eave + rise)
  }
  return peak
}

export function roofEquipment(vol: Volume, b: Bld, P: Prep, st: Style): void {
  if (!st.equipment || st.roofType !== 'flat') return
  const r = mulberry32(strSeed(b.id + ':roof'))
  const top = b.base + b.hBlocks
  const deep: number[] = []
  for (let l = 0; l < P.inside.length; l++) if (P.dist[l] >= 4) deep.push(l)
  if (!deep.length) return
  const fits = (l: number, w: number, d: number) => {
    const li = l % P.sx,
      lj = (l / P.sx) | 0
    for (let a = 0; a < w; a++)
      for (let c = 0; c < d; c++) {
        const q = (lj + c) * P.sx + li + a
        if (P.dist[q] < 3) return false
      }
    return true
  }
  const box = (l: number, w: number, d: number, h: number, side: number, cap: number) => {
    const i = P.ox + (l % P.sx),
      j = P.oz + ((l / P.sx) | 0)
    for (let a = 0; a < w; a++)
      for (let c = 0; c < d; c++)
        for (let y = 0; y < h; y++) {
          if (vol.get(i + a, top + y, j + c) !== 0) return
        }
    for (let a = 0; a < w; a++) for (let c = 0; c < d; c++) for (let y = 0; y < h; y++) vol.set(i + a, top + y, j + c, y === h - 1 ? cap : side)
  }
  // stair / lift core
  if (b.areaM2 > 260) {
    for (let tries = 0; tries < 12; tries++) {
      const l = deep[Math.floor(r() * deep.length)]
      const w = 4 + Math.floor(r() * 2),
        d = 3 + Math.floor(r() * 2)
      if (fits(l, w, d)) {
        box(l, w, d, 3, st.wall, M.ROOF_FLAT)
        break
      }
    }
  }
  const count = Math.min(7, Math.floor(b.areaM2 / 320))
  for (let k = 0; k < count; k++) {
    const l = deep[Math.floor(r() * deep.length)]
    const big = r() < 0.3
    const w = big ? 3 : 2,
      d = 2
    if (fits(l, w, d)) box(l, w, d, big ? 2 : 1, M.AC_UNIT, M.AC_UNIT)
  }
  if (b.areaM2 > 700 && r() < 0.5) {
    const l = deep[Math.floor(r() * deep.length)]
    if (fits(l, 5, 3)) box(l, 5, 3, 1, M.SOLAR, M.SOLAR)
  }
}

/** Doors (from OSM entrance nodes, else inferred on the longest wall) with a small canopy. */
export function entrances(vol: Volume, b: Bld, S: State, P: Prep, allowInferred: boolean): number {
  const doors: { l: number; main: boolean }[] = []
  for (const e of S.entrances) {
    if (e.gx < b.i0 - 3 || e.gx > b.i1 + 4 || e.gz < b.j0 - 3 || e.gz > b.j1 + 4) continue
    let best = -1,
      bd = 3.2
    for (let l = 0; l < P.inside.length; l++) {
      if (P.dist[l] !== 1) continue
      const d = Math.hypot(P.ox + (l % P.sx) + 0.5 - e.gx, P.oz + ((l / P.sx) | 0) + 0.5 - e.gz)
      if (d < bd) {
        bd = d
        best = l
      }
    }
    if (best >= 0 && !doors.some((q) => q.l === best)) doors.push({ l: best, main: e.main })
  }
  if (!doors.length && allowInferred) {
    let best = -1,
      bd = Infinity
    for (let l = 0; l < P.inside.length; l++) {
      if (P.dist[l] !== 1 || P.edgeI[l] !== P.longestEdge) continue
      const d = Math.abs(P.edgeT[l] - P.edgeL[l] / 2) + Math.max(0, b.base - P.gOut[l]) * 3
      if (d < bd) {
        bd = d
        best = l
      }
    }
    if (best >= 0) doors.push({ l: best, main: true })
  }
  for (const { l, main } of doors.slice(0, 6)) {
    const li = l % P.sx,
      lj = (l / P.sx) | 0
    const i = P.ox + li,
      j = P.oz + lj
    const nx = Math.round(P.nx[l]),
      nz = Math.round(P.nz[l])
    const tx = nx === 0 ? 1 : 0,
      tz = nx === 0 ? 0 : 1
    const g = Math.max(P.gOut[l], Math.min(b.base, P.gOut[l] + 1))
    for (const a of [0, 1]) {
      const q = (lj + tz * a) * P.sx + li + tx * a
      if (P.dist[q] !== 1) continue
      for (let dy = 0; dy < 3; dy++) vol.set(i + tx * a, g + dy, j + tz * a, M.DOOR)
    }
    if (main && (nx !== 0 || nz !== 0)) {
      for (let a = -1; a <= 2; a++) for (let o = 1; o <= 2; o++) vol.add(i + tx * a + nx * o, g + 3, j + tz * a + nz * o, M.CANOPY)
    }
  }
  return doors.length
}

export function generic(vol: Volume, b: Bld, S: State, P: Prep, st: Style): void {
  shell(vol, b, S, P, st)
  if (st.roofType === 'hip') hipRoof(vol, b, P, st.roofTile)
  roofEquipment(vol, b, P, st)
  entrances(vol, b, S, P, b.areaM2 > 90)
}

/** Tier C: honest massing only — neutral walls, plain roof, nothing invented. */
export function approx(vol: Volume, b: Bld, S: State, P: Prep): void {
  const top = b.base + b.hBlocks
  for (let l = 0; l < P.inside.length; l++) {
    if (!P.inside[l]) continue
    const i = P.ox + (l % P.sx),
      j = P.oz + ((l / P.sx) | 0)
    const g = Math.min(S.H[cellIndex(i, j)], b.base)
    for (let y = g; y < top - 1; y++) vol.set(i, y, j, M.WALL_APPROX)
    vol.set(i, top - 1, j, P.dist[l] === 1 ? M.WALL_APPROX : M.ROOF_APPROX)
  }
}

/** Open-sided roof (OSM building=roof, shelters, canopies). */
export function canopy(vol: Volume, b: Bld, S: State, P: Prep, roofMat: number = M.CANOPY): void {
  const roofY = b.base + 3
  for (let l = 0; l < P.inside.length; l++) {
    if (!P.inside[l]) continue
    const i = P.ox + (l % P.sx),
      j = P.oz + ((l / P.sx) | 0)
    vol.set(i, roofY, j, roofMat)
    if (P.dist[l] === 1 && (P.edgeT[l] < 1 || P.edgeT[l] > P.edgeL[l] - 1 || Math.floor(P.edgeT[l]) % 6 === 3)) {
      for (let y = S.H[cellIndex(i, j)]; y < roofY; y++) vol.set(i, y, j, M.COLUMN)
    }
  }
}
