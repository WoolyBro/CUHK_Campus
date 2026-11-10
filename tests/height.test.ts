import { describe, expect, it } from 'vitest'
import { FLOOR_HEIGHT_M, PLACEHOLDER_HEIGHT_M, RESIDENTIAL_FLOOR_HEIGHT_M } from '../src/lib/geo/constants'
import { estimateHeight, parseLevels, parseMetres } from '../src/lib/geo/height'

describe('height estimation hierarchy', () => {
  it('prefers a verified value over everything else', () => {
    const e = estimateHeight({ category: 'academic', verifiedHeightM: 40, osmHeight: '66', osmLevels: '14', referenceLevels: 3 })
    expect(e).toMatchObject({ heightM: 40, source: 'verified', confidence: 'high' })
  })
  it('uses OSM height before OSM levels', () => {
    expect(estimateHeight({ category: 'academic', osmHeight: '66.4', osmLevels: '14' })).toMatchObject({ heightM: 66.4, levels: 14, source: 'osm-height' })
    expect(estimateHeight({ category: 'academic', osmLevels: '10' })).toMatchObject({ heightM: 10 * FLOOR_HEIGHT_M, source: 'osm-levels', confidence: 'medium' })
  })
  it('uses the residential floor height for hostels', () => {
    expect(estimateHeight({ category: 'residence', osmLevels: '10' }).heightM).toBeCloseTo(10 * RESIDENTIAL_FLOOR_HEIGHT_M, 5)
  })
  it('falls back to a reference estimate, then a category heuristic, then a placeholder', () => {
    expect(estimateHeight({ category: 'library', referenceLevels: 5 }).source).toBe('reference-estimate')
    expect(estimateHeight({ category: 'house' })).toMatchObject({ source: 'category-heuristic', confidence: 'low' })
    expect(estimateHeight({ category: 'unknown' })).toMatchObject({ source: 'placeholder', heightM: PLACEHOLDER_HEIGHT_M, confidence: 'low' })
  })
  it('parses tag values defensively', () => {
    expect(parseMetres('51.8 m')).toBe(51.8)
    expect(parseMetres('tall')).toBeUndefined()
    expect(parseLevels('7')).toBe(7)
    expect(parseLevels('0')).toBeUndefined()
    expect(parseLevels('-1')).toBeUndefined()
  })
})
