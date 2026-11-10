/**
 * Block material palette shared by the build pipeline, the mesher and the renderer.
 * Ids are stable: they are baked into the shipped world data. Every material is an
 * ORIGINAL procedural 16×16 texture generated in src/lib/voxel/textures.ts.
 */
export const M = {
  AIR: 0,
  GRASS: 1,
  GRASS_SIDE: 2,
  DIRT: 3,
  STONE: 4,
  ROCK: 5,
  SAND: 6,
  FOREST_FLOOR: 7,
  LAWN: 8,
  GRASS_FLOWERS: 9,
  GRAVEL: 10,
  ASPHALT: 11,
  ASPHALT_LINE: 12,
  PAVEMENT: 13,
  PAVERS: 14,
  PLAZA_BRICK: 15,
  STAIRS: 16,
  CONCRETE: 17,
  TRACK_RED: 18,
  PITCH_GRASS: 19,
  COURT_GREEN: 20,
  COURT_BLUE: 21,
  WATER: 22,
  SEA: 23,
  POOL: 24,
  RAIL_BALLAST: 25,
  RAIL_TRACK: 26,
  PLATFORM: 27,
  PARKING: 28,
  BRIDGE_DECK: 29,
  SOIL: 30,
  SCRUB: 31,
  WALL_CONCRETE: 32,
  WALL_GREY: 33,
  WALL_WHITE: 34,
  WALL_CREAM: 35,
  WALL_BRICK_RED: 36,
  WALL_BRICK_BROWN: 37,
  WALL_STONE: 38,
  WALL_PINK: 39,
  WALL_APPROX: 40,
  WINDOW: 41,
  WINDOW_STRIP: 42,
  GLASS_BLUE: 43,
  GLASS_GREEN: 44,
  DOOR: 45,
  ROOF_FLAT: 46,
  ROOF_TILE_GREEN: 47,
  ROOF_TILE_RED: 48,
  ROOF_TILE_GREY: 49,
  ROOF_METAL: 50,
  ROOF_APPROX: 51,
  AC_UNIT: 52,
  SLAB: 53,
  COLUMN: 54,
  RAILING: 55,
  CANOPY: 56,
  WOOD_LOG: 57,
  LEAVES_A: 58,
  LEAVES_B: 59,
  LEAVES_C: 60,
  LEAVES_PINK: 61,
  LEAVES_RED: 62,
  LEAVES_YELLOW: 63,
  PALM_LEAF: 64,
  HEDGE: 65,
  LAMP_HEAD: 66,
  METAL_DARK: 67,
  BRONZE: 68,
  SIGN_BLUE: 69,
  WOOD_PLANK: 70,
  ACCENT_RED: 71,
  ACCENT_BLUE: 72,
  ACCENT_GREEN: 73,
  WALL_TILE_BEIGE: 74,
  BALCONY: 75,
  SEA_SIDE: 76,
  WALL_TERRACOTTA: 77,
  SOLAR: 78,
  SHINGLE_DARK: 79,
} as const

export type MaterialId = (typeof M)[keyof typeof M]
export const MATERIAL_COUNT = 80
export const MATERIAL_NAMES: string[] = (() => {
  const names: string[] = new Array(MATERIAL_COUNT).fill('')
  for (const [k, v] of Object.entries(M)) names[v] = k
  return names
})()

/** Road surfaces (hidden by the "Roads" layer toggle). */
export const ROAD_MATERIALS: number[] = [M.ASPHALT, M.ASPHALT_LINE, M.PARKING, M.RAIL_BALLAST, M.RAIL_TRACK, M.BRIDGE_DECK]
/** Pedestrian surfaces (hidden by the "Paths & stairs" layer toggle). */
export const PATH_MATERIALS: number[] = [M.PAVEMENT, M.PAVERS, M.PLAZA_BRICK, M.STAIRS, M.GRAVEL, M.PLATFORM]
/** Materials that glow at night (value = emissive strength). */
export const EMISSIVE: Record<number, number> = {
  [M.WINDOW]: 1.0,
  [M.WINDOW_STRIP]: 1.0,
  [M.GLASS_BLUE]: 0.75,
  [M.GLASS_GREEN]: 0.75,
  [M.LAMP_HEAD]: 2.2,
  [M.BALCONY]: 0.45,
}
/** Water-like surfaces: rendered slightly below the block top and gently animated. */
export const WATER_MATERIALS: number[] = [M.WATER, M.SEA, M.POOL]

const BUILT = new Set<number>([
  M.ASPHALT,
  M.ASPHALT_LINE,
  M.PAVEMENT,
  M.PAVERS,
  M.PLAZA_BRICK,
  M.STAIRS,
  M.CONCRETE,
  M.TRACK_RED,
  M.COURT_GREEN,
  M.COURT_BLUE,
  M.POOL,
  M.RAIL_BALLAST,
  M.RAIL_TRACK,
  M.PLATFORM,
  M.PARKING,
  M.BRIDGE_DECK,
])
export const isBuiltSurface = (m: number) => BUILT.has(m)
export const isWaterSurface = (m: number) => m === M.WATER || m === M.SEA || m === M.POOL

/**
 * What the exposed side of a terrain column looks like, from the top down:
 * [first block, next `subDepth` blocks, everything deeper].
 */
export function sideProfile(surface: number): [number, number, number] {
  switch (surface) {
    case M.GRASS:
    case M.LAWN:
    case M.GRASS_FLOWERS:
    case M.FOREST_FLOOR:
    case M.SCRUB:
    case M.PITCH_GRASS:
      return [M.GRASS_SIDE, M.DIRT, M.STONE]
    case M.DIRT:
    case M.SOIL:
    case M.GRAVEL:
      return [M.DIRT, M.DIRT, M.STONE]
    case M.ROCK:
    case M.STONE:
      return [M.ROCK, M.STONE, M.STONE]
    case M.SAND:
      return [M.SAND, M.SAND, M.STONE]
    case M.SEA:
      return [M.SEA_SIDE, M.SEA_SIDE, M.STONE]
    case M.WATER:
    case M.POOL:
      return [M.CONCRETE, M.DIRT, M.STONE]
    default:
      return [M.CONCRETE, M.CONCRETE, M.STONE]
  }
}
export const SUB_DEPTH = 3

/** Zone tint colours (index = zone id; 0 = none). */
export const ZONE_COLOURS: string[] = [
  '#000000',
  '#5b8def', // 1 Central Campus
  '#e0564f', // 2 Chung Chi
  '#f2a23a', // 3 New Asia
  '#8a63d2', // 4 United
  '#e667a7', // 5 Shaw
  '#8d9aa8', // 6 Residential Area
  '#34b3a0', // 7 Eastern Campus
  '#c9b037', // 8 Morningside
  '#4fb1e8', // 9 S.H. Ho
  '#7ac74f', // 10 C.W. Chu
  '#d9783c', // 11 Wu Yee Sun
  '#b05ec4', // 12 Lee Woo Sing
  '#5f7f96', // 13 Area 39
  '#f5d547', // 14 University Station area (derived)
]
