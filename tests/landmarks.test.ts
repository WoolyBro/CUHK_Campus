/**
 * Coordinate validation against official CUHK mapping.
 *
 * The expected latitude / longitude values below are the points published for each building in
 * the official CUHK Campus Map (https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html),
 * recorded on 2026-11-10. The model's positions come from OpenStreetMap footprints, so these
 * tests check two independent sources against each other through the project's projection.
 */
import { describe, expect, it } from 'vitest'
import { lonLatToWorld } from '../src/lib/geo/projection'
import { loadWorld, worldBuilt } from './helpers'

const OFFICIAL: { name: string; code: string; lat: number; lon: number }[] = [
  { name: 'University Library', code: 'H3', lat: 22.419499, lon: 114.204911 },
  { name: 'Sir Run Run Shaw Hall', code: 'H9', lat: 22.420126, lon: 114.207113 },
  { name: 'University Science Centre', code: 'H10', lat: 22.419464, lon: 114.207929 },
  { name: 'Lee Shau Kee Building', code: 'H23a', lat: 22.419558, lon: 114.203935 },
  { name: 'Chung Chi College Chapel', code: 'C4', lat: 22.415978, lon: 114.206931 },
  { name: 'Cheng Ming Building', code: 'N1', lat: 22.421271, lon: 114.20799 },
  { name: 'Tsang Shiu Tim Building', code: 'U1', lat: 22.420498, lon: 114.204589 },
  { name: 'Wen Lan Tang', code: 'S3', lat: 22.423166, lon: 114.201773 },
  { name: 'Cheng Yu Tung Building', code: 'E8', lat: 22.412263, lon: 114.210632 },
  { name: 'Yasumoto International Academic Park', code: 'C39a', lat: 22.416355, lon: 114.210965 },
]

describe.skipIf(!worldBuilt)('landmark coordinates vs official CUHK map', () => {
  const world = worldBuilt ? loadWorld() : null!
  const building = (name: string) => world.features.find((f) => f.kind === 'building' && f.name === name)

  it.each(OFFICIAL)('$name ($code) sits on its official map point', ({ name, code, lat, lon }) => {
    const f = building(name)
    expect(f, `${name} missing from the model`).toBeDefined()
    expect(f!.code).toBe(code)
    const p = lonLatToWorld(lon, lat)
    // the official point must fall inside (or within 30 blocks of) the modelled footprint
    const [x0, z0, x1, z1] = f!.bbox!
    const dx = Math.max(x0 - p.x, 0, p.x - x1),
      dz = Math.max(z0 - p.z, 0, p.z - z1)
    expect(Math.hypot(dx, dz)).toBeLessThan(30)
    // and the footprint centroid must be within 60 m of it
    expect(Math.hypot(f!.x - p.x, f!.z - p.z)).toBeLessThan(60)
    // stored geographic position agrees with the block position
    const back = lonLatToWorld(f!.lon, f!.lat)
    expect(Math.hypot(back.x - f!.x, back.z - f!.z)).toBeLessThan(0.6)
  })

  it('keeps the campus the right way round', () => {
    const lib = building('University Library')!,
      chapel = building('Chung Chi College Chapel')!,
      cyt = building('Cheng Yu Tung Building')!,
      shaw = building('Wen Lan Tang')!
    expect(chapel.z).toBeGreaterThan(lib.z) // Chung Chi is south of Central Campus (+Z = south)
    expect(cyt.x).toBeGreaterThan(lib.x) // the station area is east of the library
    expect(shaw.z).toBeLessThan(lib.z) // Shaw College is north
    expect(shaw.x).toBeLessThan(lib.x) // and west
  })

  it('reproduces the hillside: hilltop colleges are far above the station', () => {
    const y = (name: string) => {
      const f = building(name)!
      return f.y - (f.heightM ?? 0)
    }
    expect(y('Cheng Ming Building')).toBeGreaterThan(110) // New Asia hilltop
    expect(y('University Library')).toBeGreaterThan(80) // Central Campus plateau
    expect(y('Cheng Yu Tung Building')).toBeLessThan(40) // beside University Station
  })
})
