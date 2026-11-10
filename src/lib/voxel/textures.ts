/**
 * Original procedural block textures (16×16, one layer per palette material).
 * Nothing here is derived from any game's assets: every tile is drawn by the small
 * pattern functions below from a base colour and a seeded random generator.
 */
import { M, MATERIAL_COUNT } from './palette'

export const TILE = 16
type RGB = [number, number, number]
type Painter = (x: number, y: number, rnd: () => number) => RGB

function rng(seed: number) {
  let a = (seed * 2654435761) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/** Speckled flat colour. */
const speck = (base: string, amp = 0.1, dark?: string, darkP = 0): Painter => {
  const b = hex(base),
    d = dark ? hex(dark) : b
  return (_x, _y, r) => (r() < darkP ? mul(d, 0.9 + r() * 0.2) : mul(b, 1 - amp / 2 + r() * amp))
}
/** Running-bond bricks / tiles. */
const bricks = (base: string, joint: string, bw: number, bh: number, amp = 0.12): Painter => {
  const b = hex(base),
    j = hex(joint)
  const tone: number[] = []
  return (x, y, r) => {
    const row = Math.floor(y / bh)
    const ox = (x + (row % 2) * Math.floor(bw / 2)) % TILE
    if (y % bh === bh - 1 || ox % bw === bw - 1) return mul(j, 0.95 + r() * 0.1)
    const id = row * 8 + Math.floor(ox / bw)
    tone[id] ??= 1 - amp / 2 + r() * amp
    return mul(b, tone[id] * (0.97 + r() * 0.06))
  }
}
/** Regular grid of slabs (pavers, glass panes, tiles). */
const grid = (base: string, joint: string, cw: number, ch: number, amp = 0.08): Painter => {
  const b = hex(base),
    j = hex(joint)
  const tone: number[] = []
  return (x, y, r) => {
    if (x % cw === 0 || y % ch === 0) return j
    const id = Math.floor(y / ch) * 16 + Math.floor(x / cw)
    tone[id] ??= 1 - amp / 2 + r() * amp
    return mul(b, tone[id] * (0.98 + r() * 0.04))
  }
}
const rows = (a: string, b: string, period: number, amp = 0.06): Painter => {
  const ca = hex(a),
    cb = hex(b)
  return (_x, y, r) => mul(y % period === period - 1 ? cb : mix(ca, cb, ((y % period) / period) * 0.25), 1 - amp / 2 + r() * amp)
}
const leaves = (base: string, dark: string, light: string, flower?: string, flowerP = 0): Painter => {
  const b = hex(base),
    d = hex(dark),
    l = hex(light),
    f = flower ? hex(flower) : b
  return (_x, _y, r) => {
    const v = r()
    if (flower && v < flowerP) return mul(f, 0.9 + r() * 0.2)
    if (v < flowerP + 0.24) return d
    if (v > 0.84) return l
    return mul(b, 0.93 + r() * 0.14)
  }
}
const glass = (tint: string, frame: string, sky: string): Painter => {
  const t = hex(tint),
    f = hex(frame),
    s = hex(sky)
  return (x, y) => {
    if (x === 0 || y === 0 || x === 8) return f
    const sheen = (x + (15 - y)) / 30
    return mix(t, s, sheen * sheen * 0.75)
  }
}

const PAINTERS: Record<number, Painter> = {
  [M.GRASS]: speck('#63a544', 0.16, '#4f8f38', 0.14),
  [M.GRASS_SIDE]: (() => {
    const g = speck('#63a544', 0.16, '#4f8f38', 0.14),
      d = speck('#8b6543', 0.14, '#6f4f33', 0.12)
    const fringe = [3, 2, 4, 3, 2, 3, 5, 3, 2, 4, 3, 2, 3, 4, 2, 3]
    return (x, y, r) => (y < fringe[x] ? g(x, y, r) : d(x, y, r))
  })(),
  [M.DIRT]: speck('#8b6543', 0.14, '#6f4f33', 0.14),
  [M.STONE]: speck('#8d8d8b', 0.1, '#74746f', 0.16),
  [M.ROCK]: (() => {
    const s = speck('#857e74', 0.12, '#676058', 0.18)
    return (x, y, r) => ((x * 3 + y * 5) % 11 === 0 || (x + y * 2) % 13 === 0 ? mul(hex('#5f5952'), 0.9 + r() * 0.2) : s(x, y, r))
  })(),
  [M.SAND]: speck('#dccf9c', 0.08, '#c9b981', 0.08),
  [M.FOREST_FLOOR]: speck('#4e7c38', 0.16, '#6a5a36', 0.2),
  [M.LAWN]: (() => {
    const s = speck('#7fbf58', 0.08)
    return (x, y, r) => mul(s(x, y, r), y % 8 < 4 ? 1 : 0.955)
  })(),
  [M.GRASS_FLOWERS]: (() => {
    const g = speck('#69aa49', 0.14, '#54943b', 0.12)
    const dots: Record<number, string> = { 34: '#f7e36a', 70: '#ffffff', 121: '#f08fb5', 180: '#f7e36a', 215: '#ffffff', 99: '#e86f7c', 150: '#f7e36a' }
    return (x, y, r) => (dots[y * 16 + x] ? hex(dots[y * 16 + x]) : g(x, y, r))
  })(),
  [M.GRAVEL]: speck('#b9ad96', 0.14, '#93886f', 0.3),
  [M.ASPHALT]: speck('#4b4e53', 0.08, '#3d4044', 0.12),
  [M.ASPHALT_LINE]: (() => {
    const a = speck('#4b4e53', 0.08, '#3d4044', 0.12)
    return (x, y, r) => (x >= 5 && x <= 10 && y >= 2 && y <= 13 ? mul(hex('#e9e2c4'), 0.94 + r() * 0.08) : a(x, y, r))
  })(),
  [M.PAVEMENT]: grid('#c2c0b8', '#a9a79f', 8, 8, 0.06),
  [M.PAVERS]: grid('#cfc5ae', '#b2a78f', 4, 4, 0.14),
  [M.PLAZA_BRICK]: bricks('#b8604d', '#8f4a3c', 8, 4, 0.2),
  [M.STAIRS]: (() => {
    const s = speck('#c4c2bb', 0.05)
    return (x, y, r) => (y % 4 === 3 ? hex('#8e8c85') : y % 4 === 0 ? hex('#dad8d1') : s(x, y, r))
  })(),
  [M.CONCRETE]: (() => {
    const s = speck('#a7a59e', 0.07, '#96948d', 0.1)
    return (x, y, r) => mul(s(x, y, r), y % 8 === 7 ? 0.9 : 1)
  })(),
  [M.TRACK_RED]: (() => {
    const s = speck('#b9503f', 0.08)
    return (x, y, r) => (x === 0 ? hex('#ead9d0') : s(x, y, r))
  })(),
  [M.PITCH_GRASS]: (() => {
    const s = speck('#58a84a', 0.07)
    return (x, y, r) => mul(s(x, y, r), x % 16 < 8 ? 1 : 0.9)
  })(),
  [M.COURT_GREEN]: speck('#3f8f5f', 0.05),
  [M.COURT_BLUE]: (() => {
    const s = speck('#b56a4a', 0.05)
    return (x, y, r) => (x === 0 || y === 0 ? hex('#ecdcd0') : s(x, y, r))
  })(),
  [M.WATER]: (() => {
    const b = hex('#4a86c8'),
      l = hex('#79acdf')
    return (x, y, r) => ((x + y * 3) % 9 === 0 || (x * 2 + y) % 14 === 0 ? l : mul(b, 0.95 + r() * 0.08))
  })(),
  [M.SEA]: (() => {
    const b = hex('#3a79b4'),
      l = hex('#5b97cc')
    return (x, y, r) => ((x + y * 2) % 11 === 0 ? l : mul(b, 0.95 + r() * 0.08))
  })(),
  [M.POOL]: grid('#62c7de', '#8fdcec', 8, 8, 0.04),
  [M.RAIL_BALLAST]: speck('#8a8177', 0.16, '#6d655c', 0.3),
  [M.RAIL_TRACK]: (() => {
    const b = speck('#8a8177', 0.16, '#6d655c', 0.3)
    return (x, y, r) => (x === 3 || x === 12 || y === 3 || y === 12 ? hex('#5a5552') : y % 8 < 2 ? hex('#6b5a48') : b(x, y, r))
  })(),
  [M.PLATFORM]: (() => {
    const s = grid('#bdbbb4', '#a5a39c', 8, 8, 0.05)
    return (x, y, r) => (y < 2 ? hex('#e8c93f') : s(x, y, r))
  })(),
  [M.PARKING]: (() => {
    const a = speck('#56595e', 0.08, '#484b50', 0.12)
    return (x, y, r) => (x === 0 && y % 16 < 12 ? hex('#dcdcd2') : a(x, y, r))
  })(),
  [M.BRIDGE_DECK]: (() => {
    const s = speck('#b3b1aa', 0.06)
    return (x, y, r) => mul(s(x, y, r), y % 8 === 0 ? 0.86 : 1)
  })(),
  [M.SOIL]: speck('#7a5a3c', 0.16, '#644830', 0.2),
  [M.SCRUB]: speck('#6e9a45', 0.2, '#557a36', 0.25),
  [M.WALL_CONCRETE]: (() => {
    const s = speck('#d2cab8', 0.05)
    return (x, y, r) => mul(s(x, y, r), y % 8 === 7 ? 0.93 : x % 8 === 0 ? 0.97 : 1)
  })(),
  [M.WALL_GREY]: (() => {
    const s = speck('#afaeaa', 0.05)
    return (x, y, r) => mul(s(x, y, r), y % 8 === 7 ? 0.93 : 1)
  })(),
  [M.WALL_WHITE]: (() => {
    const s = speck('#efede6', 0.035)
    return (x, y, r) => mul(s(x, y, r), y % 16 === 15 ? 0.94 : 1)
  })(),
  [M.WALL_CREAM]: (() => {
    const s = speck('#e9dcbd', 0.045)
    return (x, y, r) => mul(s(x, y, r), y % 16 === 15 ? 0.94 : 1)
  })(),
  [M.WALL_BRICK_RED]: bricks('#aa5540', '#8a4636', 8, 4, 0.18),
  [M.WALL_BRICK_BROWN]: bricks('#946444', '#775037', 8, 4, 0.18),
  [M.WALL_STONE]: bricks('#9c9484', '#7b7466', 6, 5, 0.26),
  [M.WALL_PINK]: grid('#e4bcb0', '#d4a89c', 4, 4, 0.05),
  [M.WALL_APPROX]: (() => {
    const b = hex('#d9d8d3'),
      h = hex('#c9c8c2')
    return (x, y) => ((x + y) % 8 === 0 ? h : b)
  })(),
  [M.WINDOW]: (x, y) => {
    if (x < 2 || x > 13 || y < 2 || y > 13) return hex('#dcd9cf')
    if (x === 7 || x === 8) return hex('#b9b6ad')
    return mix(hex('#2b3f58'), hex('#6f93b8'), Math.pow((x + (15 - y)) / 30, 2) * 0.8)
  },
  [M.WINDOW_STRIP]: (x, y) => {
    if (x === 0 || x === 8) return hex('#9da3a8')
    return mix(hex('#263a52'), hex('#6a8fb5'), Math.pow((x + (15 - y)) / 30, 2) * 0.8)
  },
  [M.GLASS_BLUE]: glass('#3f6f9f', '#c9d3da', '#a8cfee'),
  [M.GLASS_GREEN]: glass('#3f7f78', '#cfd8d4', '#a8e0d2'),
  [M.DOOR]: (_x, y, r) => (y === 0 ? hex('#57514b') : mul(hex('#2f2b29'), 0.9 + r() * 0.2)),
  [M.ROOF_FLAT]: speck('#9f9e98', 0.1, '#8a8983', 0.2),
  [M.ROOF_TILE_GREEN]: rows('#3f8a63', '#2c6a4a', 4),
  [M.ROOF_TILE_RED]: rows('#b9623f', '#8f472c', 4),
  [M.ROOF_TILE_GREY]: rows('#7d8084', '#5d6064', 4),
  [M.ROOF_METAL]: (() => {
    const s = speck('#b9c2c8', 0.04)
    return (x, y, r) => mul(s(x, y, r), x % 4 === 0 ? 0.88 : 1)
  })(),
  [M.ROOF_APPROX]: (() => {
    const b = hex('#c4c3be'),
      h = hex('#b5b4ae')
    return (x, y) => ((x + y) % 8 === 0 ? h : b)
  })(),
  [M.AC_UNIT]: (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return hex('#8b8f93')
    const d = Math.hypot(x - 7.5, y - 7.5)
    return d < 5 ? (d < 1.5 ? hex('#6c7074') : (x + y) % 2 ? hex('#4f5357') : hex('#707478')) : hex('#b4b8bc')
  },
  [M.SLAB]: speck('#dcd9d0', 0.04),
  [M.COLUMN]: (() => {
    const s = speck('#cdc9bf', 0.04)
    return (x, y, r) => mul(s(x, y, r), x < 2 ? 0.86 : x > 13 ? 0.92 : 1)
  })(),
  [M.RAILING]: (x, y) => (y < 2 ? hex('#d7dadd') : x % 4 === 0 ? hex('#aeb3b8') : hex('#5d646b')),
  [M.CANOPY]: (() => {
    const s = speck('#e8e7e0', 0.03)
    return (x, y, r) => mul(s(x, y, r), x % 8 === 0 ? 0.9 : 1)
  })(),
  [M.WOOD_LOG]: (() => {
    const s = speck('#6f5236', 0.12)
    return (x, y, r) => mul(s(x, y, r), x % 4 === 0 ? 0.78 : 1)
  })(),
  [M.LEAVES_A]: leaves('#4f9a3a', '#3b7c2c', '#69b64a'),
  [M.LEAVES_B]: leaves('#3d8334', '#2c6628', '#539c41'),
  [M.LEAVES_C]: leaves('#77ac3c', '#5c8e2e', '#93c552'),
  [M.LEAVES_PINK]: leaves('#4f9a3a', '#3b7c2c', '#69b64a', '#f2a3c4', 0.3),
  [M.LEAVES_RED]: leaves('#4b9238', '#3a782c', '#62ab46', '#e25a3c', 0.3),
  [M.LEAVES_YELLOW]: leaves('#6ba33a', '#527f2c', '#86bd4a', '#f3d44c', 0.3),
  [M.PALM_LEAF]: (() => {
    const s = speck('#5d9c3a', 0.1)
    return (x, y, r) => mul(s(x, y, r), (x + y) % 4 === 0 ? 0.78 : 1)
  })(),
  [M.HEDGE]: leaves('#3f7f33', '#2f6427', '#4f953e'),
  [M.LAMP_HEAD]: speck('#fff2c2', 0.03),
  [M.METAL_DARK]: speck('#3b3f45', 0.06),
  [M.BRONZE]: speck('#8f6c3d', 0.14, '#5f8a70', 0.1),
  [M.SIGN_BLUE]: (x, y) => (x > 3 && x < 12 && y > 4 && y < 11 ? hex('#f3f5f7') : hex('#2f66c4')),
  [M.WOOD_PLANK]: (() => {
    const s = speck('#a67c4e', 0.08)
    return (x, y, r) => mul(s(x, y, r), y % 4 === 3 ? 0.76 : 1)
  })(),
  [M.ACCENT_RED]: speck('#b9463b', 0.05),
  [M.ACCENT_BLUE]: speck('#2f6db3', 0.05),
  [M.ACCENT_GREEN]: speck('#3f8c5c', 0.05),
  [M.WALL_TILE_BEIGE]: grid('#dccba7', '#cbb992', 4, 4, 0.07),
  [M.BALCONY]: (x, y) => {
    if (y < 5) return x % 8 === 0 ? hex('#b4b0a6') : mix(hex('#2b3a4c'), hex('#5c7c9c'), (15 - y) / 30)
    if (y === 5) return hex('#e2dfd6')
    return x % 3 === 0 ? hex('#cfcbc0') : hex('#8b8f93')
  },
  [M.SEA_SIDE]: (_x, y, r) => mul(mix(hex('#3a79b4'), hex('#1f4d7c'), y / 15), 0.96 + r() * 0.08),
  [M.WALL_TERRACOTTA]: grid('#c47a56', '#a9643f', 8, 4, 0.1),
  [M.SOLAR]: (x, y) => (x % 8 === 0 || y % 8 === 0 ? hex('#c6ccd2') : mix(hex('#1f3152'), hex('#3d5f96'), (x + y) / 40)),
  [M.SHINGLE_DARK]: rows('#5b534c', '#40392f', 4),
}

/** RGBA data for a WebGL2 texture array (rows flipped so V runs upward). */
export function buildAtlasData(): Uint8Array {
  const data = new Uint8Array(TILE * TILE * 4 * MATERIAL_COUNT)
  for (let m = 0; m < MATERIAL_COUNT; m++) {
    const paint = PAINTERS[m]
    const rnd = rng(m * 7919 + 13)
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const c: RGB = paint ? paint(x, y, rnd) : [255, 0, 255]
        const o = (m * TILE * TILE + (TILE - 1 - y) * TILE + x) * 4
        data[o] = Math.max(0, Math.min(255, Math.round(c[0])))
        data[o + 1] = Math.max(0, Math.min(255, Math.round(c[1])))
        data[o + 2] = Math.max(0, Math.min(255, Math.round(c[2])))
        data[o + 3] = 255
      }
  }
  return data
}

/** Mean colour per material (used for UI swatches). */
export function averageColours(data: Uint8Array): string[] {
  const out: string[] = []
  const n = TILE * TILE
  for (let m = 0; m < MATERIAL_COUNT; m++) {
    let r = 0,
      g = 0,
      b = 0
    for (let p = 0; p < n; p++) {
      r += data[(m * n + p) * 4]
      g += data[(m * n + p) * 4 + 1]
      b += data[(m * n + p) * 4 + 2]
    }
    out.push(`rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`)
  }
  return out
}
