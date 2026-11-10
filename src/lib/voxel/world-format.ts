/** Shapes of the shipped world data (public/world/*). Written by scripts/build-voxel-world.ts. */

export type FeatureKind = 'building' | 'landmark' | 'facility' | 'stop' | 'road' | 'zone'
export type GeometryConfidence = 'verified' | 'inferred' | 'approximate'
export type Tier = 'A' | 'B' | 'C'

export interface FeatureRecord {
  /** Index into the feature list; also the id baked into structure quads / pick grid. */
  i: number
  /** Stable key, e.g. "way/134410449", "official-landmark/3". */
  key: string
  kind: FeatureKind
  name: string
  nameZh?: string
  /** Official CUHK campus-map code (e.g. "H3"), source-verified only. */
  code?: string
  /** Official short / teaching-venue code (e.g. "LSK"), source-verified only. */
  short?: string
  zone: number
  category: string
  tier?: Tier
  /** Label anchor in world blocks. */
  x: number
  y: number
  z: number
  /** Footprint bounds in world blocks (buildings). */
  bbox?: [number, number, number, number]
  lat: number
  lon: number
  levels?: number
  heightM?: number
  heightSource?: string
  heightConfidence?: string
  geom: GeometryConfidence
  /** How naming was established: "official-name" | "official-location" | "osm" | "official-point". */
  nameSource: string
  osm?: string
  official?: boolean
  notes?: string
  /** Search priority (higher first). */
  rank: number
  /** Extra search terms. */
  alt?: string[]
}

export interface StructureGroup {
  cx: number
  cz: number
  start: number
  count: number
  /** Bounds in grid columns / biased Y. */
  min: [number, number, number]
  max: [number, number, number]
}

export interface ZoneInfo {
  id: number
  nameEn: string
  nameZh: string
  colour: string
  enabled: boolean
  source: string
  x: number
  y: number
  z: number
  buildingCount: number
}

export interface WorldMeta {
  version: number
  generatedAt: string
  anchor: { lat: number; lon: number }
  blocksPerMetre: number
  world: { minX: number; minZ: number; sizeX: number; sizeZ: number; chunk: number }
  yBias: number
  seaLevel: number
  columns: { file: string; bytes: number }
  structures: { file: string; quadCount: number; groups: StructureGroup[] }
  trees: { file: string; count: number }
  props: { file: string; count: number }
  zoneGrid: { scale: number; w: number; d: number }
  zones: ZoneInfo[]
  stats: Record<string, number | string>
  sources: { osmBase: string | null; osmFetchedAt: string | null; terrain: string; official: string }
}

/** Tree record: 10 bytes — Uint16 x·8, y (biased), z·8 then Uint8 type, height, tint, rotation. */
export const TREE_STRIDE = 10
/** Prop record: 10 bytes — Uint16 x·8, y (biased), z·8 then Uint8 type, rotation (0–3), a, b. */
export const PROP_STRIDE = 10

export const PROP = { LAMP: 0, BUS_SHELTER: 1, BENCH: 2, FENCE: 3, BOLLARD: 4, SIGN: 5, SHRUB: 6, FLOWER_SHRUB: 7, ROCK: 8 } as const
export const TREE = { BROADLEAF: 0, TALL: 1, BANYAN: 2, SMALL: 3, PALM: 4, PINK: 5, RED: 6, YELLOW: 7, CONIFER: 8 } as const
export const TREE_TYPE_COUNT = 9
export const PROP_TYPE_COUNT = 9
