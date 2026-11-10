import { describe, expect, it } from 'vitest'
import { World } from '../src/lib/terrain/world'
import { M } from '../src/lib/voxel/palette'
import { loadWorld, readJson, worldBuilt } from './helpers'

describe.skipIf(!worldBuilt)('shipped world data', () => {
  const data = worldBuilt ? loadWorld() : null!
  const bias = worldBuilt ? data.meta.yBias : 0

  it('has the expected extent, chunks and catalogue', () => {
    const { meta, features } = data
    expect(meta.world.sizeX * meta.world.sizeZ).toBe(data.height.length)
    expect(meta.blocksPerMetre).toBe(1)
    expect(features.length).toBeGreaterThan(900)
    features.forEach((f, k) => expect(f.i).toBe(k + 1))
    expect(Number(meta.stats.officialMatched)).toBeGreaterThanOrEqual(150)
    expect(meta.zones.filter((z) => z.enabled).length).toBeGreaterThanOrEqual(13)
  })

  it('never marks an approximate (Tier C) building as verified, and only official matches carry codes', () => {
    for (const f of data.features) {
      if (f.kind !== 'building') continue
      if (f.tier === 'C') expect(f.geom).toBe('approximate')
      if (f.code || f.short) expect(f.official).toBe(true)
      if (f.geom === 'verified') expect(f.official).toBe(true)
    }
  })

  it('keeps sea at sea level and land above it', () => {
    let sea = 0
    for (let c = 0; c < data.height.length; c += 7) {
      if (data.surface[c] === M.SEA) {
        sea++
        expect(data.height[c]).toBe(bias + data.meta.seaLevel)
      } else expect(data.height[c]).toBeGreaterThan(bias)
    }
    expect(sea).toBeGreaterThan(1000)
  })

  it('grounds every major building: none floats above or is buried in the terrain', () => {
    const { W, height, sBot, sTop, sFeat, features } = data
    const stats = new Map<number, { n: number; grounded: number; minClear: number; maxRise: number }>()
    for (let c = 0; c < sFeat.length; c++) {
      const f = sFeat[c]
      if (!f) continue
      let s = stats.get(f)
      if (!s) {
        s = { n: 0, grounded: 0, minClear: 1e9, maxRise: 0 }
        stats.set(f, s)
      }
      s.n++
      const gap = sBot[c] - height[c]
      if (gap <= 0) s.grounded++
      s.minClear = Math.min(s.minClear, gap)
      s.maxRise = Math.max(s.maxRise, sTop[c] - height[c])
    }
    const problems: string[] = []
    for (const f of features) {
      if (f.kind !== 'building' || f.rank < 60 || f.category === 'canopy' || f.category === 'station') continue
      const s = stats.get(f.i)
      if (!s) {
        problems.push(`${f.name}: no structure columns`)
        continue
      }
      if (f.notes?.includes('Open lakeside pavilion')) continue
      const mushroom = f.tier === 'A' && s.minClear <= 0 // towers with a wider head, cantilevered landmarks
      if (s.grounded / s.n < 0.6 && !mushroom) problems.push(`${f.name}: only ${Math.round((s.grounded / s.n) * 100)}% of columns reach the ground`)
      if (s.maxRise < 3) problems.push(`${f.name}: rises only ${s.maxRise} blocks above ground`)
    }
    expect(problems).toEqual([])
    expect(W).toBe(data.meta.world.sizeX)
  })

  it('keeps trees off buildings, roads, courts, plazas and water', async () => {
    const { gunzipSync } = await import('node:zlib')
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const { ROOT } = await import('./helpers')
    const buf = gunzipSync(readFileSync(resolve(ROOT, 'public/world/trees.bin')))
    const banned = new Set<number>([
      M.ASPHALT,
      M.ASPHALT_LINE,
      M.PAVEMENT,
      M.PAVERS,
      M.PLAZA_BRICK,
      M.STAIRS,
      M.WATER,
      M.SEA,
      M.POOL,
      M.TRACK_RED,
      M.PITCH_GRASS,
      M.COURT_GREEN,
      M.COURT_BLUE,
      M.PARKING,
      M.RAIL_TRACK,
      M.RAIL_BALLAST,
      M.PLATFORM,
    ])
    const n = buf.length / 10
    expect(n).toBe(data.meta.trees.count)
    let bad = 0
    for (let k = 0; k < n; k++) {
      const i = Math.floor(buf.readUInt16LE(k * 10) / 8),
        j = Math.floor(buf.readUInt16LE(k * 10 + 4) / 8)
      const c = j * data.W + i
      if (banned.has(data.surface[c]) || data.sTop[c] > 0) bad++
    }
    expect(bad).toBe(0)
  })

  it('records every manual override with evidence, confidence, reason and date', () => {
    const file = readJson<{ overrides: Record<string, unknown>[] }>('data/manual-overrides.json')
    for (const o of file.overrides)
      for (const k of ['target', 'original', 'corrected', 'correctionType', 'evidence', 'confidence', 'reason', 'date']) expect(o, `override ${String(o.target)}`).toHaveProperty(k)
  })
})

describe('World column queries', () => {
  const meta = { world: { minX: 0, minZ: 0, sizeX: 8, sizeZ: 8, chunk: 8 }, yBias: 10, zoneGrid: { scale: 4, w: 2, d: 2 } } as never
  const w = new World(meta)
  w.height = new Uint16Array(64).fill(15) // ground at y = 5
  w.surface = new Uint8Array(64)
  w.sBot = new Uint16Array(64)
  w.sTop = new Uint16Array(64)
  w.sFeat = new Uint16Array(64)
  w.zone = new Uint8Array(4)
  // a 2×2 building from the ground to y = 12 with feature id 3
  for (const [i, j] of [
    [3, 3],
    [4, 3],
    [3, 4],
    [4, 4],
  ]) {
    const c = j * 8 + i
    w.sBot[c] = 15
    w.sTop[c] = 22
    w.sFeat[c] = 3
  }
  // a bridge deck over column (6,6) between y = 9 and y = 10
  w.sBot[6 * 8 + 6] = 19
  w.sTop[6 * 8 + 6] = 20
  w.maxY = 40

  it('picks the terrain from above', () => {
    const hit = w.pick(1.5, 30, 1.5, 0, -1, 0)!
    expect(hit.kind).toBe('terrain')
    expect(hit.y).toBeCloseTo(5, 5)
  })
  it('picks a building roof and reports its feature id', () => {
    const hit = w.pick(3.5, 30, 3.5, 0, -1, 0)!
    expect(hit).toMatchObject({ kind: 'structure', feature: 3 })
    expect(hit.y).toBeCloseTo(12, 5)
  })
  it('picks a building wall with a slanted ray', () => {
    const d = Math.SQRT1_2
    const hit = w.pick(0.5, 8, 3.5, d, -d * 0.2, 0)!
    expect(hit.feature).toBe(3)
    expect(hit.x).toBeCloseTo(3, 3)
  })
  it('blocks walkers at walls but lets them pass under and stand on a bridge', () => {
    expect(w.blocked(3.5, 3.5, 5, 6.7)).toBe(true)
    expect(w.blocked(1.5, 1.5, 5, 6.7)).toBe(false)
    expect(w.blocked(6.5, 6.5, 5, 6.7)).toBe(false) // deck is overhead
    expect(w.standAt(6.5, 6.5, 5)).toBeCloseTo(5, 5) // walking underneath
    expect(w.standAt(6.5, 6.5, 10)).toBe(10) // walking on the deck
  })
})
