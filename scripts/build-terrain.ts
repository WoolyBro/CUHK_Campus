/**
 * build-terrain.ts — crops the Lands Department 5 m DTM to the study area and
 * resamples it onto the project grid (1 sample per block column).
 *
 *  input : data/raw/dem/Whole_HK_DTM_5m.asc  (Esri ASCII grid, HK1980 Grid, metres above HKPD)
 *  output: data/terrain/elevation.i16        (Int16 LE, decimetres, row-major, north row first)
 *          data/terrain/elevation.meta.json
 *
 * Only a light smoothing pass is applied (to hide the 5 m facets of the source
 * raster); hills, valleys, cuttings and ridge lines are preserved.
 */
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import { WORLD } from '../src/lib/geo/constants'
import { lonLatToHk80, worldToLonLat } from '../src/lib/geo/projection'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASC = resolve(ROOT, 'data/raw/dem/Whole_HK_DTM_5m.asc')
const OUT_DIR = resolve(ROOT, 'data/terrain')

if (!existsSync(ASC)) {
  console.error('Missing DTM. Run: npx tsx scripts/fetch-terrain.ts')
  process.exit(1)
}

const { minX, minZ, sizeX, sizeZ } = WORLD

// 1. HK80 extent of the study area (+ margin for interpolation).
let minE = Infinity,
  maxE = -Infinity,
  minN = Infinity,
  maxN = -Infinity
for (const [x, z] of [
  [minX, minZ],
  [minX + sizeX, minZ],
  [minX, minZ + sizeZ],
  [minX + sizeX, minZ + sizeZ],
]) {
  const { lon, lat } = worldToLonLat(x, z)
  const { E, N } = lonLatToHk80(lon, lat)
  minE = Math.min(minE, E)
  maxE = Math.max(maxE, E)
  minN = Math.min(minN, N)
  maxN = Math.max(maxN, N)
}
const MARGIN = 40
minE -= MARGIN
maxE += MARGIN
minN -= MARGIN
maxN += MARGIN

// 2. Stream the ASCII grid, keeping only the rows/cols we need.
const header: Record<string, number> = {}
let row = -1
let col0 = 0,
  col1 = 0,
  row0 = 0,
  row1 = 0,
  cropW = 0,
  cropH = 0
let crop: Float32Array = new Float32Array(0)
let cell = 5,
  xll = 0,
  yll = 0,
  nrows = 0

const rl = createInterface({ input: createReadStream(ASC, { highWaterMark: 1 << 20 }), crlfDelay: Infinity })
for await (const line of rl) {
  if (row < 0) {
    const m = /^(\w+)\s+(-?[\d.]+)/.exec(line)
    if (m && Object.keys(header).length < 6 && /^[a-zA-Z]/.test(line)) {
      header[m[1].toLowerCase()] = Number(m[2])
      if (Object.keys(header).length === 6) {
        cell = header.cellsize
        xll = header.xllcorner
        yll = header.yllcorner
        nrows = header.nrows
        // cell (r, c) centre: E = xll + (c + .5)·cell, N = yll + (nrows − r − .5)·cell
        col0 = Math.max(0, Math.floor((minE - xll) / cell - 0.5))
        col1 = Math.min(header.ncols - 1, Math.ceil((maxE - xll) / cell - 0.5))
        row0 = Math.max(0, Math.floor(nrows - 0.5 - (maxN - yll) / cell))
        row1 = Math.min(nrows - 1, Math.ceil(nrows - 0.5 - (minN - yll) / cell))
        cropW = col1 - col0 + 1
        cropH = row1 - row0 + 1
        crop = new Float32Array(cropW * cropH)
        row = 0
      }
      continue
    }
  }
  if (row >= row0 && row <= row1) {
    // fast manual split of the columns we need
    let c = 0,
      i = 0
    const n = line.length
    const base = (row - row0) * cropW
    while (i < n && c <= col1) {
      while (i < n && line.charCodeAt(i) === 32) i++
      const s = i
      while (i < n && line.charCodeAt(i) !== 32) i++
      if (c >= col0 && s < i) crop[base + (c - col0)] = Number(line.slice(s, i))
      c++
    }
  }
  row++
  if (row > row1) break
}
rl.close()
console.log(`DTM crop: cols ${col0}–${col1}, rows ${row0}–${row1} (${cropW}×${cropH} @ ${cell} m)`)

// 3. Fill NODATA (sea / voids) with 0 and resample bicubically onto the block grid.
const nodata = header.nodata_value ?? -9999
for (let i = 0; i < crop.length; i++) if (crop[i] === nodata || !Number.isFinite(crop[i])) crop[i] = 0

function at(r: number, c: number): number {
  r = r < 0 ? 0 : r >= cropH ? cropH - 1 : r
  c = c < 0 ? 0 : c >= cropW ? cropW - 1 : c
  return crop[r * cropW + c]
}
function cubic(p0: number, p1: number, p2: number, p3: number, t: number) {
  // Catmull-Rom
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
}
function sample(E: number, N: number): number {
  const fc = (E - xll) / cell - 0.5 - col0
  const fr = nrows - 0.5 - (N - yll) / cell - row0
  const c = Math.floor(fc),
    r = Math.floor(fr)
  const tc = fc - c,
    tr = fr - r
  const rows: number[] = []
  let lo = Infinity,
    hi = -Infinity
  for (let k = -1; k <= 2; k++) {
    rows.push(cubic(at(r + k, c - 1), at(r + k, c), at(r + k, c + 1), at(r + k, c + 2), tc))
  }
  for (let k = 0; k <= 1; k++)
    for (let l = 0; l <= 1; l++) {
      const v = at(r + k, c + l)
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
  // clamp to the local 2×2 range to avoid cubic overshoot at cliffs / shoreline
  return Math.min(hi, Math.max(lo, cubic(rows[0], rows[1], rows[2], rows[3], tr)))
}

// The local TM frame and HK80 are both conformal; over 2 km an affine fit from four
// corners + centre is accurate to millimetres, so sample HK80 at coarse knots and interpolate.
const KN = 64
const kx = Math.ceil(sizeX / KN) + 1,
  kz = Math.ceil(sizeZ / KN) + 1
const knotE = new Float64Array(kx * kz),
  knotN = new Float64Array(kx * kz)
for (let j = 0; j < kz; j++)
  for (let i = 0; i < kx; i++) {
    const { lon, lat } = worldToLonLat(minX + i * KN, minZ + j * KN)
    const { E, N } = lonLatToHk80(lon, lat)
    knotE[j * kx + i] = E
    knotN[j * kx + i] = N
  }
let elev: Float32Array = new Float32Array(sizeX * sizeZ)
for (let j = 0; j < sizeZ; j++) {
  const gz = (j + 0.5) / KN,
    jz = Math.floor(gz),
    tz = gz - jz
  for (let i = 0; i < sizeX; i++) {
    const gx = (i + 0.5) / KN,
      ix = Math.floor(gx),
      tx = gx - ix
    const a = jz * kx + ix,
      b = a + 1,
      c = a + kx,
      d = c + 1
    const E = (knotE[a] * (1 - tx) + knotE[b] * tx) * (1 - tz) + (knotE[c] * (1 - tx) + knotE[d] * tx) * tz
    const N = (knotN[a] * (1 - tx) + knotN[b] * tx) * (1 - tz) + (knotN[c] * (1 - tx) + knotN[d] * tx) * tz
    elev[j * sizeX + i] = sample(E, N)
  }
}

// 4. Light separable smoothing (radius 2 box ×2 ≈ gaussian σ≈2 m): removes 5 m facets only.
function boxBlur(src: Float32Array, radius: number): Float32Array {
  const tmp = new Float32Array(src.length),
    out = new Float32Array(src.length)
  const w = sizeX,
    h = sizeZ,
    n = radius * 2 + 1
  for (let j = 0; j < h; j++) {
    let acc = 0
    for (let k = -radius; k <= radius; k++) acc += src[j * w + Math.min(w - 1, Math.max(0, k))]
    for (let i = 0; i < w; i++) {
      tmp[j * w + i] = acc / n
      acc += src[j * w + Math.min(w - 1, i + radius + 1)] - src[j * w + Math.max(0, i - radius)]
    }
  }
  for (let i = 0; i < w; i++) {
    let acc = 0
    for (let k = -radius; k <= radius; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + i]
    for (let j = 0; j < h; j++) {
      out[j * w + i] = acc / n
      acc += tmp[Math.min(h - 1, j + radius + 1) * w + i] - tmp[Math.max(0, j - radius) * w + i]
    }
  }
  return out
}
const rawElev = elev
elev = boxBlur(boxBlur(elev, 2), 2)
// keep exact zeros (sea) crisp so the shoreline is not smeared inland
for (let i = 0; i < elev.length; i++) if (rawElev[i] <= 0.05) elev[i] = Math.min(elev[i], 0.4)

let lo = Infinity,
  hi = -Infinity,
  sea = 0
const out = new Int16Array(elev.length)
for (let i = 0; i < elev.length; i++) {
  const v = elev[i]
  lo = Math.min(lo, v)
  hi = Math.max(hi, v)
  if (rawElev[i] <= 0.05) sea++
  out[i] = Math.round(v * 10)
}
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'elevation.i16'), Buffer.from(out.buffer))
const metaOut = {
  generatedAt: new Date().toISOString(),
  source: 'Lands Department, HKSAR Government — Digital Terrain Model (5 m grid), Whole_HK_DTM_5m.asc',
  sourceCrs: 'Hong Kong 1980 Grid (EPSG:2326), heights in metres above HKPD',
  sourceCellM: cell,
  sourceAccuracyNote: 'Published accuracy ±5 m; vegetated ground and elevated structures may be included in the surface.',
  crop: { col0, col1, row0, row1 },
  grid: { sizeX, sizeZ, minX, minZ, unit: 'decimetre', layout: 'row-major, row 0 = northern edge (min Z)' },
  resampling: 'Catmull-Rom bicubic (range-clamped) + 2× box blur radius 2 m',
  stats: { minM: Math.round(lo * 10) / 10, maxM: Math.round(hi * 10) / 10, seaFraction: Math.round((sea / elev.length) * 1000) / 1000 },
}
writeFileSync(resolve(OUT_DIR, 'elevation.meta.json'), JSON.stringify(metaOut, null, 2))
console.log('terrain grid written:', metaOut.stats)
