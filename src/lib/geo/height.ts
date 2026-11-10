/**
 * Building height estimation — an explicit, documented hierarchy (highest priority first):
 *
 *  1. verified            a height / floor count from a reliable public source (manual-overrides.json)
 *  2. osm-height          OSM `height`
 *     osm-levels          OSM `building:levels`
 *  3. reference-estimate  floor count estimated from official imagery / reference pages (manual-overrides.json)
 *  4. category-heuristic  typical size for the building category
 *  5. placeholder         conservative default when nothing is known
 *
 * The chosen source is stored with every building and shown in the inspector.
 */
import { FLOOR_HEIGHT_M, PLACEHOLDER_HEIGHT_M, RESIDENTIAL_FLOOR_HEIGHT_M } from './constants'

export type HeightSource = 'verified' | 'osm-height' | 'osm-levels' | 'reference-estimate' | 'category-heuristic' | 'placeholder'
export type Confidence = 'high' | 'medium' | 'low'

export interface HeightInput {
  category: string
  verifiedHeightM?: number
  verifiedLevels?: number
  osmHeight?: string
  osmLevels?: string
  referenceHeightM?: number
  referenceLevels?: number
}
export interface HeightEstimate {
  heightM: number
  levels: number
  floorHeightM: number
  source: HeightSource
  confidence: Confidence
}

export const RESIDENTIAL_CATEGORIES = new Set(['residence', 'house', 'hotel'])

export function floorHeightFor(category: string): number {
  return RESIDENTIAL_CATEGORIES.has(category) ? RESIDENTIAL_FLOOR_HEIGHT_M : FLOOR_HEIGHT_M
}

/** Typical floor counts per category, used only when no better source exists. */
export const CATEGORY_LEVELS: Record<string, number> = {
  house: 3,
  residence: 6,
  academic: 4,
  office: 4,
  library: 4,
  sports: 3,
  worship: 3,
  hospital: 6,
  hotel: 10,
  station: 2,
  utility: 1,
  canopy: 1,
}

export function parseMetres(v: string | undefined): number | undefined {
  if (!v) return undefined
  const m = /^\s*(\d+(?:\.\d+)?)\s*(m|metres?|meters?)?\s*$/i.exec(v)
  if (!m) return undefined
  const n = Number(m[1])
  return n > 0 && n < 600 ? n : undefined
}

export function parseLevels(v: string | undefined): number | undefined {
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 1 && n <= 120 ? Math.round(n) : undefined
}

export function estimateHeight(input: HeightInput): HeightEstimate {
  const fh = floorHeightFor(input.category)
  const fromLevels = (levels: number) => Math.round(levels * fh * 10) / 10
  const fromHeight = (h: number) => Math.max(1, Math.round(h / fh))

  if (input.verifiedHeightM) return { heightM: input.verifiedHeightM, levels: input.verifiedLevels ?? fromHeight(input.verifiedHeightM), floorHeightM: fh, source: 'verified', confidence: 'high' }
  if (input.verifiedLevels) return { heightM: fromLevels(input.verifiedLevels), levels: input.verifiedLevels, floorHeightM: fh, source: 'verified', confidence: 'high' }

  const osmH = parseMetres(input.osmHeight)
  const osmL = parseLevels(input.osmLevels)
  if (osmH) return { heightM: osmH, levels: osmL ?? fromHeight(osmH), floorHeightM: fh, source: 'osm-height', confidence: 'high' }
  if (osmL) return { heightM: fromLevels(osmL), levels: osmL, floorHeightM: fh, source: 'osm-levels', confidence: 'medium' }

  if (input.referenceHeightM)
    return { heightM: input.referenceHeightM, levels: input.referenceLevels ?? fromHeight(input.referenceHeightM), floorHeightM: fh, source: 'reference-estimate', confidence: 'medium' }
  if (input.referenceLevels) return { heightM: fromLevels(input.referenceLevels), levels: input.referenceLevels, floorHeightM: fh, source: 'reference-estimate', confidence: 'medium' }

  const typical = CATEGORY_LEVELS[input.category]
  if (typical) return { heightM: fromLevels(typical), levels: typical, floorHeightM: fh, source: 'category-heuristic', confidence: 'low' }

  return { heightM: PLACEHOLDER_HEIGHT_M, levels: fromHeight(PLACEHOLDER_HEIGHT_M), floorHeightM: fh, source: 'placeholder', confidence: 'low' }
}
