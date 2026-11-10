/**
 * fetch-official.ts — caches the location database behind the official CUHK campus map
 * (https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html) and extracts the factual
 * fields this project relies on: official names (EN/ZH), map codes, short codes, campus
 * zones, landmark and shuttle-stop points.
 *
 * © The Chinese University of Hong Kong. No open licence is stated for this data, so the
 * raw file stays in data/raw/ (git-ignored) and only names/codes/zone ids/points are
 * carried into data/processed/official-cuhk.json, with attribution. See docs/DATA_SOURCES.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW_DIR = resolve(ROOT, 'data/raw/cuhk')
const RAW = resolve(RAW_DIR, 'cuhk_location_db.js')
const OUT = resolve(ROOT, 'data/processed/official-cuhk.json')
const SRC = 'https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js'
const force = process.argv.includes('--force')

mkdirSync(RAW_DIR, { recursive: true })
mkdirSync(dirname(OUT), { recursive: true })
if (!existsSync(RAW) || force) {
  console.log('official: downloading', SRC)
  const res = await fetch(SRC, { headers: { 'User-Agent': 'cuhk-voxel-campus-build/0.1 (one-off static data extract)' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  writeFileSync(RAW, Buffer.from(await res.arrayBuffer()))
  writeFileSync(resolve(RAW_DIR, 'source.json'), JSON.stringify({ url: SRC, fetchedAt: new Date().toISOString() }, null, 2))
} else console.log('official: using cached data/raw/cuhk/cuhk_location_db.js')

const text = readFileSync(RAW, 'utf8').replace(/^\uFEFF/, '')

/** Extracts `name : [ … ]` array literals (valid JSON inside) from the JS source. */
function section<T = Record<string, string>>(name: string): T[] {
  const m = new RegExp(`\\n${name}\\s*:\\s*\\[`).exec(text)
  if (!m) return []
  let i = m.index + m[0].length - 1
  const start = i
  let depth = 0
  for (; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      i++
      while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1
    } else if (ch === '[') depth++
    else if (ch === ']' && --depth === 0) break
  }
  return JSON.parse(text.slice(start, i + 1))
}
function latLng(s: string): { lat: number; lon: number } | null {
  const m = /\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/.exec(s ?? '')
  if (!m) return null
  const lat = Number(m[1]),
    lon = Number(m[2])
  return lat > 22 && lat < 23 && lon > 114 && lon < 115 ? { lat, lon } : null
}
const clean = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim()

const zones = section('campus').map((z) => ({ id: Number(z.id), nameEn: clean(z.campus_en), nameZh: clean(z.campus_xb5), point: latLng(z.lat_lng) }))
const buildings = section('buildings')
  .filter((b) => b.active === 'True')
  .map((b) => ({
    officialId: Number(b.building_id),
    mapCode: clean(b.bldg_code),
    shortCode: clean(b.shortname),
    nameEn: clean(b.bldg_name_en),
    nameZh: clean(b.bldg_name_xb5),
    zoneId: Number(b.campus_id),
    hostelType: b.hostel_type ? Number(b.hostel_type) : null,
    point: latLng(b.lat_lng),
  }))
const landmarks = section('landmarks')
  .filter((l) => l.active === 'True')
  .map((l) => ({ officialId: Number(l.landmark_id), nameEn: clean(l.landmark_name_en), nameZh: clean(l.landmark_name_xb5), zoneId: Number(l.campus_id), point: latLng(l.lat_lng) }))
const stops = section('shuttle_bus_stops')
  .filter((s) => s.active === 'True')
  .map((s) => ({ officialId: Number(s.bus_stop_id), nameEn: clean(s.bus_stop_name_en), nameZh: clean(s.bus_stop_name_xb5), point: latLng(s.lat_lng) }))
const facTypes = new Map(section('facilities_types').map((t) => [t.fac_type_id, clean(t.fac_type_en)]))
const facilities = section('facilities')
  .filter((f) => f.bCampusMap !== 'False' && latLng(f.lat_lng))
  .map((f) => ({
    officialId: Number(f.facilities_id),
    buildingId: f.building_id ? Number(f.building_id) : null,
    nameEn: clean(f.facilities_name_en),
    nameZh: clean(f.facilities_name_xb5),
    type: facTypes.get(f.type_id) ?? 'Facility',
    point: latLng(f.lat_lng),
  }))
const hostelTypes = Object.fromEntries(section('hostel_type').map((h) => [h.hostel_type_id, clean(h.hostel_type_name_en)]))

writeFileSync(
  OUT,
  JSON.stringify(
    {
      metadata: {
        source: 'Official CUHK Campus Map location database',
        url: 'https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html',
        dataUrl: SRC,
        rights: '© The Chinese University of Hong Kong. Factual names, codes and points only; used with attribution. Not an open-licensed dataset.',
        note: 'The official map states it may not be drawn to scale and is not updated in real time.',
        extractedAt: new Date().toISOString(),
      },
      zones,
      hostelTypes,
      buildings,
      landmarks,
      stops,
      facilities,
    },
    null,
    1,
  ),
)
console.log(`official: ${zones.length} zones, ${buildings.length} buildings, ${landmarks.length} landmarks, ${stops.length} stops, ${facilities.length} facilities`)
