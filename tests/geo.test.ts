import { describe, expect, it } from 'vitest'
import { ANCHOR, BLOCKS_PER_METRE, WORLD } from '../src/lib/geo/constants'
import { hk80ToLonLat, lonLatToHk80, lonLatToLocal, lonLatToWorld, studyAreaRing, worldToLonLat } from '../src/lib/geo/projection'

describe('coordinate system', () => {
  it('puts the campus anchor at the world origin', () => {
    const p = lonLatToWorld(ANCHOR.lon, ANCHOR.lat)
    expect(Math.abs(p.x)).toBeLessThan(1e-6)
    expect(Math.abs(p.z)).toBeLessThan(1e-6)
  })

  it('maps east to +X and north to −Z at the project scale', () => {
    // 0.001° of latitude ≈ 110.7 m, 0.001° of longitude ≈ 102.9 m at 22.42° N
    const north = lonLatToWorld(ANCHOR.lon, ANCHOR.lat + 0.001)
    const east = lonLatToWorld(ANCHOR.lon + 0.001, ANCHOR.lat)
    expect(north.z / BLOCKS_PER_METRE).toBeCloseTo(-110.7, 0)
    expect(Math.abs(north.x)).toBeLessThan(0.01)
    expect(east.x / BLOCKS_PER_METRE).toBeCloseTo(102.9, 0)
    expect(Math.abs(east.z)).toBeLessThan(0.05)
  })

  it('round-trips WGS84 ↔ world within a millimetre', () => {
    for (const [lon, lat] of [
      [114.2, 22.412],
      [114.2149, 22.4282],
      [114.2053, 22.4195],
    ]) {
      const w = lonLatToWorld(lon, lat)
      const back = worldToLonLat(w.x, w.z)
      const again = lonLatToLocal(back.lon, back.lat)
      expect(Math.hypot(again.e * BLOCKS_PER_METRE - w.x, -again.n * BLOCKS_PER_METRE - w.z)).toBeLessThan(1e-3)
    }
  })

  it('round-trips WGS84 ↔ Hong Kong 1980 Grid and lands in the expected grid range', () => {
    const g = lonLatToHk80(ANCHOR.lon, ANCHOR.lat)
    // CUHK lies around HK80 E 839 600, N 831 000
    expect(g.E).toBeGreaterThan(838_500)
    expect(g.E).toBeLessThan(840_800)
    expect(g.N).toBeGreaterThan(830_000)
    expect(g.N).toBeLessThan(832_500)
    const back = hk80ToLonLat(g.E, g.N)
    expect(back.lon).toBeCloseTo(ANCHOR.lon, 7)
    expect(back.lat).toBeCloseTo(ANCHOR.lat, 7)
  })

  it('keeps the study area consistent with the world extent', () => {
    const ring = studyAreaRing(0)
    expect(ring).toHaveLength(5)
    const sw = lonLatToWorld(ring[0][0], ring[0][1])
    expect(sw.x).toBeCloseTo(WORLD.minX, 3)
    expect(sw.z).toBeCloseTo(WORLD.minZ + WORLD.sizeZ, 3)
    expect(WORLD.sizeX % WORLD.chunk).toBe(0)
    expect(WORLD.sizeZ % WORLD.chunk).toBe(0)
  })
})
