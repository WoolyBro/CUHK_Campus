/**
 * process-osm.ts — turns the cached raw Overpass response into clean, grouped GeoJSON.
 *
 *  - resolves multipolygon relations (osmtogeojson)
 *  - assigns stable ids ("way/123", "relation/45", "node/678")
 *  - keeps every source tag and the OSM id
 *  - groups features: buildings, roads, paths, stairs, bridges, waterways,
 *    vegetation, facilities, transport (+ terrain-features for cliffs/walls)
 *  - flags missing or unreliable geometry instead of silently fixing it
 *
 * Output: data/processed/*.geojson + data/processed/summary.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import osmtogeojson from 'osmtogeojson'
import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson'
import { studyAreaRing } from '../src/lib/geo/projection'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RAW_FILE = resolve(ROOT, 'data/raw/osm-cuhk.json')
const OUT = resolve(ROOT, 'data/processed')

type Tags = Record<string, string>
export interface ProcessedProps {
  id: string
  osmType: string
  osmId: number
  group: string
  kind: string
  tags: Tags
  flags: string[]
  inCampus: boolean
  areaM2?: number
  lengthM?: number
}

const raw = JSON.parse(readFileSync(RAW_FILE, 'utf8'))
const meta = JSON.parse(readFileSync(resolve(ROOT, 'data/raw/osm-cuhk.meta.json'), 'utf8'))
const boundary = JSON.parse(readFileSync(resolve(ROOT, 'data/campus-boundary.geojson'), 'utf8'))
const campusPoly = boundary.features[0] as Feature<Polygon | MultiPolygon>
const studyPoly = turf.polygon([studyAreaRing(0)])
const studyBbox = turf.bbox(studyPoly)

const gj = osmtogeojson(raw, { flatProperties: false }) as FeatureCollection<Geometry, any>

const groups: Record<string, Feature<Geometry, ProcessedProps>[]> = {
  buildings: [],
  roads: [],
  paths: [],
  stairs: [],
  bridges: [],
  waterways: [],
  vegetation: [],
  facilities: [],
  transport: [],
  'terrain-features': [],
}
const flagged: { id: string; group: string; flags: string[]; name?: string }[] = []
const seen = new Set<string>()

const VEHICULAR = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'service',
  'living_street',
  'track',
  'construction',
])
const PEDESTRIAN = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'corridor', 'bridleway'])

function isArea(g: Geometry): g is Polygon | MultiPolygon {
  return g.type === 'Polygon' || g.type === 'MultiPolygon'
}

function intersectsStudy(f: Feature<Geometry>): boolean {
  const b = turf.bbox(f)
  return !(b[2] < studyBbox[0] || b[0] > studyBbox[2] || b[3] < studyBbox[1] || b[1] > studyBbox[3])
}

function fullyInside(f: Feature<Geometry>): boolean {
  const b = turf.bbox(f)
  return b[0] >= studyBbox[0] && b[2] <= studyBbox[2] && b[1] >= studyBbox[1] && b[3] <= studyBbox[3]
}

function classify(tags: Tags, g: Geometry): { group: string; kind: string } | null {
  const area = isArea(g)
  const line = g.type === 'LineString' || g.type === 'MultiLineString'
  const point = g.type === 'Point'
  const hw = tags.highway
  if (tags.building && area) return { group: 'buildings', kind: tags.building }
  if (tags['building:part'] && area) return { group: 'buildings', kind: 'part' }
  if (tags.man_made === 'water_tower' && area) return { group: 'buildings', kind: 'water_tower' }
  if (hw && line) {
    if (tags.bridge && tags.bridge !== 'no') return { group: 'bridges', kind: hw }
    if (hw === 'steps') return { group: 'stairs', kind: 'steps' }
    if (VEHICULAR.has(hw)) return { group: 'roads', kind: hw }
    if (PEDESTRIAN.has(hw)) return { group: 'paths', kind: hw }
    return null
  }
  if (hw && area) {
    if (hw === 'pedestrian' || hw === 'footway') return { group: 'facilities', kind: 'plaza' }
    if (hw === 'steps') return { group: 'stairs', kind: 'steps-area' }
    if (VEHICULAR.has(hw)) return { group: 'facilities', kind: 'road-area' }
  }
  if (tags['area:highway'] === 'steps' && area) return { group: 'stairs', kind: 'steps-area' }
  if (tags.place === 'square' && area) return { group: 'facilities', kind: 'plaza' }
  if (tags.man_made === 'bridge' && area) return { group: 'bridges', kind: 'bridge-area' }
  if (tags.railway && line) {
    if (tags.railway === 'rail') return { group: tags.bridge && tags.bridge !== 'no' ? 'bridges' : 'transport', kind: 'rail' }
    return null
  }
  if ((tags.railway === 'platform' || tags.public_transport === 'platform') && (area || line)) return { group: 'transport', kind: 'platform' }
  if (tags.natural === 'water' && area) return { group: 'waterways', kind: tags.water ?? 'water' }
  if (tags.natural === 'coastline' && line) return { group: 'waterways', kind: 'coastline' }
  if (tags.waterway && line) return { group: 'waterways', kind: tags.waterway }
  if (tags.leisure === 'swimming_pool' && area) return { group: 'facilities', kind: 'swimming_pool' }
  if (tags.amenity === 'fountain') return { group: 'facilities', kind: 'fountain' }
  if (area && (tags.natural === 'wood' || tags.landuse === 'forest')) return { group: 'vegetation', kind: 'wood' }
  if (area && tags.natural === 'scrub') return { group: 'vegetation', kind: 'scrub' }
  if (area && (tags.landuse === 'grass' || tags.natural === 'grassland' || tags.landuse === 'meadow')) return { group: 'vegetation', kind: 'grass' }
  if (area && tags.landuse === 'flowerbed') return { group: 'vegetation', kind: 'flowerbed' }
  if (area && (tags.leisure === 'garden' || tags.leisure === 'park')) return { group: 'vegetation', kind: tags.leisure }
  if (line && tags.natural === 'tree_row') return { group: 'vegetation', kind: 'tree_row' }
  if (point && tags.natural === 'tree') return { group: 'vegetation', kind: 'tree' }
  if (line && tags.barrier === 'hedge') return { group: 'vegetation', kind: 'hedge' }
  if (area && (tags.leisure === 'pitch' || tags.leisure === 'track')) return { group: 'facilities', kind: tags.leisure }
  if (line && tags.leisure === 'track') return { group: 'facilities', kind: 'track-line' }
  if (area && tags.leisure === 'playground') return { group: 'facilities', kind: 'playground' }
  if (area && tags.amenity === 'parking') return { group: 'facilities', kind: 'parking' }
  if (area && tags.man_made === 'pier') return { group: 'facilities', kind: 'pier' }
  if (line && tags.man_made === 'pier') return { group: 'facilities', kind: 'pier-line' }
  if (area && tags.landuse === 'cemetery') return { group: 'vegetation', kind: 'grass' }
  if (line && tags.natural === 'cliff') return { group: 'terrain-features', kind: 'cliff' }
  if (line && (tags.barrier === 'retaining_wall' || tags.barrier === 'wall')) return { group: 'terrain-features', kind: tags.barrier }
  if (line && tags.barrier === 'fence') return { group: 'terrain-features', kind: 'fence' }
  if (tags.man_made === 'ceremonial_gate') return { group: 'facilities', kind: 'ceremonial_gate' }
  if (point) {
    if (hw === 'bus_stop') return { group: 'transport', kind: 'bus_stop' }
    if (tags.railway === 'station' || tags.railway === 'subway_entrance') return { group: 'transport', kind: tags.railway }
    if (tags.amenity === 'bus_station' || tags.amenity === 'taxi' || tags.amenity === 'ferry_terminal') return { group: 'transport', kind: tags.amenity }
    if (tags.entrance) return { group: 'facilities', kind: 'entrance' }
    if (tags.barrier === 'gate' || tags.barrier === 'lift_gate') return { group: 'facilities', kind: 'gate' }
    if (tags.tourism === 'artwork' || tags.tourism === 'viewpoint' || tags.tourism === 'museum' || tags.tourism === 'information') return { group: 'facilities', kind: tags.tourism }
    if (tags.natural === 'peak') return { group: 'terrain-features', kind: 'peak' }
    if (tags.amenity && tags.name) return { group: 'facilities', kind: tags.amenity }
    if (tags.leisure && tags.name) return { group: 'facilities', kind: tags.leisure }
    return null
  }
  if (area && tags.amenity && tags.name && ['college', 'university', 'library', 'theatre', 'place_of_worship'].includes(tags.amenity)) return { group: 'facilities', kind: `area:${tags.amenity}` }
  if (area && tags.leisure && ['sports_centre', 'stadium'].includes(tags.leisure)) return { group: 'facilities', kind: `area:${tags.leisure}` }
  if (area && tags.amenity === 'shelter') return { group: 'buildings', kind: 'roof' }
  if (area && tags.man_made === 'canopy') return { group: 'buildings', kind: 'roof' }
  if (area && tags.landuse === 'construction') return { group: 'facilities', kind: 'construction' }
  return null
}

function firstCoord(g: Geometry): Position | null {
  if (g.type === 'Point') return g.coordinates
  if (g.type === 'LineString') return g.coordinates[Math.floor(g.coordinates.length / 2)]
  if (g.type === 'MultiLineString') return g.coordinates[0]?.[0] ?? null
  if (g.type === 'Polygon') return turf.centroid(g).geometry.coordinates
  if (g.type === 'MultiPolygon') return turf.centroid(g).geometry.coordinates
  return null
}

let skipped = 0
for (const f of gj.features) {
  const p = f.properties ?? {}
  const tags: Tags = p.tags ?? {}
  const id = p.type && p.id != null ? `${p.type}/${p.id}` : String(f.id ?? '')
  if (!id || seen.has(id)) continue
  if (!f.geometry || !intersectsStudy(f)) {
    skipped++
    continue
  }
  const cls = classify(tags, f.geometry)
  if (!cls) {
    skipped++
    continue
  }
  seen.add(id)
  const [osmType, osmIdStr] = id.split('/')
  const flags: string[] = []
  const props: ProcessedProps = { id, osmType, osmId: Number(osmIdStr), group: cls.group, kind: cls.kind, tags, flags, inCampus: false }
  const c = firstCoord(f.geometry)
  if (c) props.inCampus = turf.booleanPointInPolygon(c, campusPoly)
  if (!fullyInside(f)) flags.push('clipped-by-study-area')
  if (isArea(f.geometry)) {
    props.areaM2 = Math.round(turf.area(f) * 10) / 10
    if (cls.group === 'buildings') {
      if (props.areaM2 < 8) flags.push('tiny-footprint')
      if (tags.building === 'construction' || tags.construction) flags.push('under-construction')
      if (!tags.name && !tags['building:levels'] && !tags.height) flags.push('no-attributes')
      try {
        if (turf.kinks(f as Feature<Polygon | MultiPolygon>).features.length > 0) flags.push('self-intersecting')
      } catch {
        flags.push('invalid-geometry')
      }
    }
  } else if (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString') {
    props.lengthM = Math.round(turf.length(f, { units: 'meters' }) * 10) / 10
    if (props.lengthM < 1) flags.push('degenerate-line')
  }
  if (p.tainted) flags.push('incomplete-geometry')
  const out: Feature<Geometry, ProcessedProps> = { type: 'Feature', id, properties: props, geometry: f.geometry }
  groups[cls.group].push(out)
  if (flags.some((x) => x !== 'clipped-by-study-area' && x !== 'no-attributes')) flagged.push({ id, group: cls.group, flags, name: tags['name:en'] ?? tags.name })
}

mkdirSync(OUT, { recursive: true })
const summary: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  source: { file: 'data/raw/osm-cuhk.json', fetchedAt: meta.fetchedAt, osmBase: meta.osmBase, licence: meta.licence },
  counts: {} as Record<string, number>,
  skippedUnclassified: skipped,
  flagged,
}
for (const [name, features] of Object.entries(groups)) {
  features.sort((a, b) => (a.properties.id < b.properties.id ? -1 : 1))
  const fc = {
    type: 'FeatureCollection',
    metadata: { group: name, attribution: '© OpenStreetMap contributors (ODbL 1.0)', osmBase: meta.osmBase, crs: 'WGS84 lon/lat' },
    features,
  }
  writeFileSync(resolve(OUT, `${name}.geojson`), JSON.stringify(fc))
  ;(summary.counts as Record<string, number>)[name] = features.length
}
writeFileSync(resolve(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
console.log('processed OSM →', summary.counts, `| flagged: ${flagged.length} | unclassified/outside: ${skipped}`)
