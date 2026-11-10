/**
 * fetch-osm.ts — one-off, reproducible OpenStreetMap extract for the CUHK study area.
 *
 *  1. Fetches the CUHK campus boundary (OSM relation, amenity=university) and stores it
 *     as a polygon in data/campus-boundary.geojson. An existing boundary file is treated
 *     as curated data and is NEVER overwritten (delete it by hand to refresh).
 *  2. Queries only the feature types the model needs, limited to the study-area polygon.
 *  3. Saves the raw response plus query metadata under data/raw/.
 *
 * The published website never talks to Overpass — only this script does.
 * Usage: npm run data:fetch   (or: npx tsx scripts/fetch-osm.ts [--force])
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import osmtogeojson from 'osmtogeojson'
import { CAMPUS_RELATION_ID } from '../src/lib/geo/constants'
import { studyAreaRing } from '../src/lib/geo/projection'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = resolve(ROOT, 'data/raw')
const BOUNDARY_FILE = resolve(ROOT, 'data/campus-boundary.geojson')
const OUT_FILE = resolve(RAW, 'osm-cuhk.json')
const META_FILE = resolve(RAW, 'osm-cuhk.meta.json')

/** Public Overpass instances, tried in order. */
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const USER_AGENT = 'cuhk-voxel-campus-build/0.1 (one-off static data extract)'
const force = process.argv.includes('--force')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function overpass(query: string): Promise<{ json: any; endpoint: string }> {
  let lastErr: unknown
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(240_000),
        })
        if (res.status === 429 || res.status === 504) {
          // Respect rate limiting: back off, then retry once on this endpoint.
          console.warn(`  ${endpoint} → HTTP ${res.status}; backing off 30 s`)
          await sleep(30_000)
          continue
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!json.elements) throw new Error('response has no elements')
        return { json, endpoint }
      } catch (err) {
        lastErr = err
        console.warn(`  ${endpoint} failed: ${(err as Error).message}`)
        break
      }
    }
  }
  throw new Error(`All Overpass endpoints failed: ${String(lastErr)}`)
}

function buildFeatureQuery(): string {
  // Study-area polygon (not a plain bbox): "lat lon lat lon …" for Overpass poly filters.
  const ring = studyAreaRing(30)
  const poly = ring
    .slice(0, -1)
    .map(([lon, lat]) => `${lat.toFixed(6)} ${lon.toFixed(6)}`)
    .join(' ')
  const p = `(poly:"${poly}")`
  const areaKeys = ['building', 'building:part', 'natural', 'landuse', 'leisure', 'amenity', 'man_made']
  const wayOnlyKeys = ['highway', 'railway', 'waterway', 'barrier', 'area:highway', 'public_transport', 'tourism', 'historic', 'place']
  const nodeKeys = 'amenity|tourism|historic|man_made|leisure|public_transport|railway|highway|natural|barrier|place|entrance'
  return [
    '[out:json][timeout:180];',
    '(',
    ...areaKeys.map((k) => `  way["${k}"]${p}; relation["${k}"]${p};`),
    ...wayOnlyKeys.map((k) => `  way["${k}"]${p};`),
    `  node[~"^(${nodeKeys})$"~"."]${p};`,
    ');',
    'out geom;',
  ].join('\n')
}

async function fetchBoundary() {
  if (existsSync(BOUNDARY_FILE) && !force) {
    console.log('campus boundary: keeping existing data/campus-boundary.geojson (curated; not overwritten)')
    return
  }
  if (existsSync(BOUNDARY_FILE)) {
    console.log('campus boundary: --force given but boundary is curated data; delete it manually to refetch')
    return
  }
  console.log(`campus boundary: fetching OSM relation ${CAMPUS_RELATION_ID}`)
  const query = `[out:json][timeout:60];relation(${CAMPUS_RELATION_ID});out geom;`
  const { json, endpoint } = await overpass(query)
  const gj = osmtogeojson(json)
  const feature = gj.features.find((f) => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
  if (!feature) throw new Error('boundary relation did not resolve to a polygon')
  const out = {
    type: 'FeatureCollection',
    metadata: {
      description: 'CUHK Sha Tin campus boundary',
      source: `OpenStreetMap relation ${CAMPUS_RELATION_ID} (amenity=university)`,
      licence: 'ODbL 1.0 — © OpenStreetMap contributors',
      fetchedAt: new Date().toISOString(),
      endpoint,
      osmBase: json.osm3s?.timestamp_osm_base ?? null,
    },
    features: [{ type: 'Feature', id: `relation/${CAMPUS_RELATION_ID}`, properties: feature.properties, geometry: feature.geometry }],
  }
  writeFileSync(BOUNDARY_FILE, JSON.stringify(out))
  console.log('campus boundary: saved data/campus-boundary.geojson')
  await sleep(3000)
}

async function fetchFeatures() {
  if (existsSync(OUT_FILE) && !force) {
    const meta = existsSync(META_FILE) ? JSON.parse(readFileSync(META_FILE, 'utf8')) : {}
    console.log(`osm extract: data/raw/osm-cuhk.json already cached (fetched ${meta.fetchedAt ?? 'unknown'}); use --force to refresh`)
    return
  }
  const query = buildFeatureQuery()
  console.log('osm extract: querying Overpass for the study area …')
  const { json, endpoint } = await overpass(query)
  writeFileSync(OUT_FILE, JSON.stringify(json))
  const counts: Record<string, number> = {}
  for (const el of json.elements) counts[el.type] = (counts[el.type] ?? 0) + 1
  const meta = {
    fetchedAt: new Date().toISOString(),
    endpoint,
    osmBase: json.osm3s?.timestamp_osm_base ?? null,
    copyright: json.osm3s?.copyright ?? null,
    licence: 'ODbL 1.0 — © OpenStreetMap contributors',
    elementCounts: counts,
    query,
  }
  writeFileSync(META_FILE, JSON.stringify(meta, null, 2))
  console.log(`osm extract: saved ${json.elements.length} elements`, counts)
}

mkdirSync(RAW, { recursive: true })
await fetchBoundary()
await fetchFeatures()
