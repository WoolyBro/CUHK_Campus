/**
 * Tier A — bespoke landmark models.
 *
 * Each model starts from the landmark's real OSM footprint (so position, orientation and plan
 * shape stay data-driven) and replaces the generic façade rules with hand-written block
 * architecture. Form, colour and roof character were checked against the photographs published
 * with the official CUHK campus map entry for each landmark (private reference only — no photo
 * is shipped). They remain stylised interpretations: see docs/ACCURACY.md.
 */
import { M } from '../../src/lib/voxel/palette'
import type { Volume } from '../../src/lib/voxel/mesher'
import { cellIndex } from './grid'
import { entrances, facadeBlock, roofEquipment, shell, type Prep, type Style } from './buildings'
import type { Bld, LandmarkDef, State } from './types'

const MAP = 'https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html'

export const LANDMARKS: LandmarkDef[] = [
  {
    match: { mapCode: 'H3' },
    model: 'library',
    title: 'University Library',
    evidence: MAP,
    notes: 'White concrete block with cantilevered upper floors and vertical slit windows, modelled from the official map photograph.',
  },
  {
    match: { osmName: 'NA Water Tower' },
    model: 'tower_na',
    title: 'New Asia Water Tower (The Gentleman Tower)',
    evidence: MAP,
    notes: 'Concrete shaft with a wider finned tank head. Height is an estimate from the official photograph.',
    officialLandmark: 'The Water Tower in New Asia College (The Gentleman Tower)',
  },
  {
    match: { osmName: 'UC Water Tower' },
    model: 'tower_uc',
    title: 'United College Water Tower (The Lady Tower)',
    evidence: MAP,
    notes: 'Slender banded concrete shaft with a flared tank head. Height is an estimate from the official photograph.',
    officialLandmark: 'The Water Tower in United College (The Lady Tower)',
  },
  {
    match: { mapCode: 'C4' },
    model: 'chapel',
    title: 'Chung Chi College Chapel',
    evidence: MAP,
    notes: 'Stone end wall with a tall window and a wide overhanging roof, modelled from the official map photograph.',
  },
  { match: { mapCode: 'H9' }, model: 'shaw_hall', title: 'Sir Run Run Shaw Hall', evidence: MAP, notes: 'White monolithic auditorium with cantilevered upper volume; fly-tower massing is inferred.' },
  {
    match: { mapCode: 'C39a' },
    model: 'grid_tower',
    title: 'Yasumoto International Academic Park',
    evidence: MAP,
    notes: 'White gridded tower over a glazed podium, modelled from the official map photograph.',
  },
  {
    match: { mapCode: 'C39b' },
    model: 'grid_tower',
    title: 'Wu Ho Man Yuen Building',
    evidence: MAP,
    notes: 'Companion tower to the Yasumoto International Academic Park; same façade language assumed.',
  },
  {
    match: { mapCode: 'E8' },
    model: 'glass_tower',
    title: 'Cheng Yu Tung Building',
    evidence: MAP,
    notes: 'Glazed tower beside University Station; curtain-wall character from the official map photograph.',
  },
  { match: { mapCode: 'H4' }, model: 'ics', title: 'Institute of Chinese Studies', evidence: MAP, notes: 'Courtyard building with white walls; low tiled roof edge is a stylised interpretation.' },
  { match: { osmName: 'Lion Pavilion' }, model: 'pavilion', title: 'Lion Pavilion', evidence: MAP, notes: 'Open lakeside pavilion beside Lake Ad Excellentiam; roof form is stylised.' },
]

const base: Style = {
  wall: M.WALL_WHITE,
  band: M.SLAB,
  plinth: M.CONCRETE,
  window: M.WINDOW,
  glass: M.GLASS_BLUE,
  roof: M.ROOF_FLAT,
  accent: M.SLAB,
  pattern: 'fins',
  ground: 'solid',
  bay: 3,
  parapet: true,
  roofType: 'flat',
  roofTile: M.ROOF_TILE_GREY,
  equipment: true,
}

/** Adds a one-block cantilever ring around the footprint between two heights. */
function overhang(vol: Volume, P: Prep, y0: number, y1: number, mat: (y: number, l: number) => number) {
  for (let l = 0; l < P.inside.length; l++) {
    if (P.dist[l] !== 1) continue
    const i = P.ox + (l % P.sx),
      j = P.oz + ((l / P.sx) | 0)
    const nx = Math.round(P.nx[l]),
      nz = Math.round(P.nz[l])
    if (nx === 0 && nz === 0) continue
    for (let y = y0; y < y1; y++) {
      vol.add(i + nx, y, j + nz, mat(y, l))
      if (nx !== 0 && nz !== 0) {
        vol.add(i + nx, y, j, mat(y, l))
        vol.add(i, y, j + nz, mat(y, l))
      }
    }
  }
}

function disc(vol: Volume, cx: number, cz: number, r: number, y0: number, y1: number, mat: (i: number, y: number, j: number, d: number) => number) {
  const R = Math.ceil(r)
  for (let dj = -R; dj <= R; dj++)
    for (let di = -R; di <= R; di++) {
      const d = Math.hypot(di, dj)
      if (d > r + 0.2) continue
      for (let y = y0; y < y1; y++) vol.set(Math.floor(cx) + di, y, Math.floor(cz) + dj, mat(di, y, dj, d))
    }
}

type Model = (vol: Volume, b: Bld, S: State, P: Prep) => void

export const MODELS: Record<string, Model> = {
  /** University Library — recessed base, cantilevered white box with vertical fins and slit windows. */
  library(vol, b, S, P) {
    const st: Style = { ...base, wall: M.WALL_WHITE, band: M.WALL_WHITE, pattern: 'fins', ground: 'glass', glass: M.WINDOW_STRIP, bay: 4 }
    shell(vol, b, S, P, st)
    const lift = b.base + b.floorH * 2
    const top = b.base + b.hBlocks
    // cantilevered upper storeys: fins (white) alternating with dark slit glazing
    overhang(vol, P, lift, top + 1, (y, l) => {
      if (y === lift || y >= top - 1) return M.WALL_WHITE
      const t = Math.floor(P.edgeT[l])
      return t % 2 === 0 || P.edgeT[l] < 1 || P.edgeT[l] > P.edgeL[l] - 1 ? M.WALL_WHITE : M.WINDOW
    })
    roofEquipment(vol, b, P, st)
    entrances(vol, b, S, P, true)
  },

  /** New Asia water tower — concrete shaft, wider tank head with vertical fins. */
  tower_na(vol, b) {
    const g = b.base,
      top = b.base + b.hBlocks
    const head = top - 9
    disc(vol, b.cx, b.cz, 2.3, g - 2, head, (di, y, dj) => ((Math.abs(di) === 2 && dj === 0) || (Math.abs(dj) === 2 && di === 0) ? M.COLUMN : y % 7 === 0 ? M.SLAB : M.WALL_CONCRETE))
    disc(vol, b.cx, b.cz, 3.3, head, head + 1, () => M.SLAB)
    disc(vol, b.cx, b.cz, 4.2, head + 1, top, (di, y, dj, d) => (y === top - 1 ? M.SLAB : d > 3.3 && (di + dj) % 2 === 0 ? M.COLUMN : M.WALL_CONCRETE))
    disc(vol, b.cx, b.cz, 1.2, top, top + 2, () => M.METAL_DARK)
  },

  /** United College water tower — slender banded shaft flaring into a T-shaped head. */
  tower_uc(vol, b) {
    const g = b.base,
      top = b.base + b.hBlocks
    const flare = top - 7
    disc(vol, b.cx, b.cz, 1.8, g - 2, flare, (_di, y) => (y % 5 === 0 ? M.SLAB : M.WALL_GREY))
    for (let k = 0; k < 4; k++) disc(vol, b.cx, b.cz, 2.2 + k * 0.7, flare + k, flare + k + 1, () => (k % 2 ? M.SLAB : M.WALL_GREY))
    disc(vol, b.cx, b.cz, 4.6, flare + 4, top, (_di, y, _dj, d) => (y === top - 1 ? M.SLAB : d > 3.6 ? M.WALL_GREY : M.WALL_CONCRETE))
  },

  /** Chung Chi College Chapel — stone end walls with a tall window, ribbon clerestory, wide overhanging roof. */
  chapel(vol, b, S, P) {
    const st: Style = { ...base, wall: M.WALL_TILE_BEIGE, band: M.WALL_TILE_BEIGE, plinth: M.WALL_STONE, pattern: 'blank', window: M.WINDOW_STRIP, parapet: false, equipment: false }
    const top = b.base + b.hBlocks
    for (let l = 0; l < P.inside.length; l++) {
      if (!P.inside[l]) continue
      const i = P.ox + (l % P.sx),
        j = P.oz + ((l / P.sx) | 0)
      const g = Math.min(S.H[cellIndex(i, j)], b.base)
      const px = i + 0.5 - P.cx,
        pz = j + 0.5 - P.cz
      const along = px * P.ux + pz * P.uz
      const across = Math.abs(-px * P.uz + pz * P.ux)
      const endWall = Math.abs(along) > P.halfLen - 1.6
      for (let y = g; y < top; y++) {
        let m: number = st.wall
        if (P.dist[l] === 1) {
          if (endWall) m = across < 2.2 && y > b.base + 1 && y < top - 2 ? M.GLASS_BLUE : M.WALL_STONE
          else m = y >= top - 4 && y < top - 1 ? M.WINDOW_STRIP : y <= P.gOut[l] + 1 ? M.WALL_STONE : st.wall
        }
        vol.set(i, y, j, m)
      }
      vol.set(i, top, j, M.SHINGLE_DARK)
    }
    // wide roof overhang
    overhang(vol, P, top, top + 1, () => M.SHINGLE_DARK)
    for (let l = 0; l < P.inside.length; l++) {
      if (P.dist[l] !== 1) continue
      const i = P.ox + (l % P.sx),
        j = P.oz + ((l / P.sx) | 0)
      const nx = Math.round(P.nx[l]) * 2,
        nz = Math.round(P.nz[l]) * 2
      vol.add(i + nx, top, j + nz, M.SHINGLE_DARK)
    }
    entrances(vol, b, S, P, true)
  },

  /** Sir Run Run Shaw Hall — white monolith, cantilevered upper volume, raised fly-tower core. */
  shaw_hall(vol, b, S, P) {
    const st: Style = { ...base, wall: M.WALL_WHITE, band: M.WALL_WHITE, pattern: 'blank', window: M.WINDOW_STRIP, equipment: false }
    shell(vol, b, S, P, st)
    const top = b.base + b.hBlocks
    overhang(vol, P, b.base + 5, top - 2, () => M.WALL_WHITE)
    for (let l = 0; l < P.inside.length; l++) {
      if (P.dist[l] < 8) continue
      const i = P.ox + (l % P.sx),
        j = P.oz + ((l / P.sx) | 0)
      for (let y = top; y < top + 5; y++) vol.set(i, y, j, y === top + 4 ? M.ROOF_FLAT : M.WALL_WHITE)
    }
    entrances(vol, b, S, P, true)
  },

  /** White gridded tower over a glazed podium (Yasumoto International Academic Park, Wu Ho Man Yuen Building). */
  grid_tower(vol, b, S, P) {
    const st: Style = { ...base, wall: M.WALL_WHITE, band: M.WALL_WHITE, pattern: 'punched', window: M.WINDOW, ground: 'glass', glass: M.GLASS_GREEN, bay: 2, accent: M.WALL_WHITE }
    shell(vol, b, S, P, st)
    // sky-garden recess every sixth floor
    const top = b.base + b.hBlocks
    for (let l = 0; l < P.inside.length; l++) {
      if (P.dist[l] !== 1) continue
      const i = P.ox + (l % P.sx),
        j = P.oz + ((l / P.sx) | 0)
      for (let y = b.base + b.floorH * 6; y < top - b.floorH; y += b.floorH * 6) {
        for (let k = 1; k < b.floorH; k++) if (P.edgeT[l] > 2 && P.edgeT[l] < P.edgeL[l] - 2) vol.set(i, y + k, j, k === 1 ? M.HEDGE : M.DOOR)
      }
    }
    roofEquipment(vol, b, P, st)
    entrances(vol, b, S, P, true)
  },

  /** Curtain-wall tower (Cheng Yu Tung Building). */
  glass_tower(vol, b, S, P) {
    const st: Style = { ...base, wall: M.WALL_GREY, band: M.SLAB, pattern: 'curtain', glass: M.GLASS_BLUE, ground: 'glass', bay: 4 }
    shell(vol, b, S, P, st)
    roofEquipment(vol, b, P, st)
    entrances(vol, b, S, P, true)
  },

  /** Institute of Chinese Studies — white courtyard building with a low tiled roof edge. */
  ics(vol, b, S, P) {
    const st: Style = {
      ...base,
      wall: M.WALL_WHITE,
      band: M.WALL_WHITE,
      plinth: M.WALL_STONE,
      pattern: 'punched',
      window: M.WINDOW,
      bay: 4,
      parapet: false,
      equipment: false,
      accent: M.ROOF_TILE_GREY,
    }
    shell(vol, b, S, P, st)
    const top = b.base + b.hBlocks
    for (let l = 0; l < P.inside.length; l++) {
      if (!P.inside[l] || P.dist[l] > 3) continue
      const i = P.ox + (l % P.sx),
        j = P.oz + ((l / P.sx) | 0)
      vol.set(i, top - 1 + (P.dist[l] === 2 ? 1 : 0), j, M.ROOF_TILE_GREY)
    }
    overhang(vol, P, top - 1, top, () => M.ROOF_TILE_GREY)
    entrances(vol, b, S, P, true)
  },

  /** Small open pavilion with a tiled hip roof. */
  pavilion(vol, b, S, P) {
    const roofY = b.base + 3
    for (let l = 0; l < P.inside.length; l++) {
      if (!P.inside[l]) continue
      const i = P.ox + (l % P.sx),
        j = P.oz + ((l / P.sx) | 0)
      const rise = Math.min(3, P.dist[l])
      for (let y = roofY; y < roofY + rise; y++) vol.set(i, y, j, M.ROOF_TILE_GREEN)
      if (P.dist[l] === 1 && (P.edgeT[l] < 1 || P.edgeT[l] > P.edgeL[l] - 1)) for (let y = S.H[cellIndex(i, j)]; y < roofY; y++) vol.set(i, y, j, M.ACCENT_RED)
    }
    overhang(vol, P, roofY, roofY + 1, () => M.ROOF_TILE_GREEN)
  },

  /** University Station — metal platform canopies on columns with a blue fascia. */
  station(vol, b, S, P) {
    const roofY = b.base + 5
    for (let l = 0; l < P.inside.length; l++) {
      if (!P.inside[l]) continue
      const i = P.ox + (l % P.sx),
        j = P.oz + ((l / P.sx) | 0)
      vol.set(i, roofY, j, P.dist[l] === 1 ? M.ACCENT_BLUE : M.ROOF_METAL)
      if (P.dist[l] === 2 && Math.floor(P.edgeT[l]) % 8 === 4) for (let y = S.H[cellIndex(i, j)]; y < roofY; y++) vol.set(i, y, j, M.COLUMN)
      if (P.dist[l] === 1 && (P.edgeT[l] < 1 || P.edgeT[l] > P.edgeL[l] - 1)) for (let y = S.H[cellIndex(i, j)]; y < roofY; y++) vol.set(i, y, j, M.COLUMN)
    }
  },
}

/** Whether the model is an open structure whose footprint must stay walkable (no terrain cut, no solid fill). */
export const OPEN_MODELS = new Set(['pavilion', 'station'])

export { facadeBlock }
