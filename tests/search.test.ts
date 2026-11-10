import { describe, expect, it } from 'vitest'
import { SearchIndex } from '../src/features/search/search'
import { loadWorld, worldBuilt } from './helpers'

describe.skipIf(!worldBuilt)('search', () => {
  const world = worldBuilt ? loadWorld() : null!
  const index = worldBuilt ? new SearchIndex(world.features, world.meta.zones) : null!
  const top = (q: string) => index.search(q)[0]?.feature

  it('finds buildings by official short code and map code', () => {
    expect(top('LSK')?.name).toBe('Lee Shau Kee Building')
    expect(top('mmw')?.name).toBe('Mong Man Wai Building')
    expect(top('H3')?.name).toBe('University Library')
  })
  it('finds buildings by English and Chinese names', () => {
    expect(top('university library')?.name).toBe('University Library')
    expect(top('大學圖書館')?.name).toBe('University Library')
    expect(index.search('圖書館').length).toBeGreaterThan(2)
  })
  it('finds colleges, landmarks, roads and stops', () => {
    expect(top('Chung Chi College')?.kind).toBe('zone')
    expect(top('Pavilion of Harmony')?.kind).toBe('landmark')
    expect(index.search('station').some((h) => h.feature.name.startsWith('University Station'))).toBe(true)
    expect(index.search('road').some((h) => h.feature.kind === 'road')).toBe(true)
  })
  it('returns nothing for nonsense', () => {
    expect(index.search('zzzzqqq')).toEqual([])
    expect(index.search('   ')).toEqual([])
  })
})
