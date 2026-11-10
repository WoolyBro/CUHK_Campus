/**
 * Coordinate conversion. Raw sources are WGS84 lon/lat (OSM, official CUHK
 * map) or Hong Kong 1980 Grid (Lands Department DTM). Everything is converted
 * into ONE local metre-based Cartesian frame centred on the campus anchor,
 * then scaled to blocks.
 *
 * This module pulls in proj4 and is used by the build scripts and tests only;
 * the browser bundle works purely in pre-computed block coordinates.
 */
import proj4 from 'proj4'
import { ANCHOR, BLOCKS_PER_METRE, STUDY_AREA_M } from './constants'

export const WGS84 = 'EPSG:4326'

/** Local transverse-Mercator frame, origin at the campus anchor, metres. */
export const LOCAL_TM = `+proj=tmerc +lat_0=${ANCHOR.lat} +lon_0=${ANCHOR.lon} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs`

/** Hong Kong 1980 Grid System (EPSG:2326). */
export const HK80 =
  '+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246 +units=m +no_defs'

const toLocal = proj4(WGS84, LOCAL_TM)
const toHk80 = proj4(WGS84, HK80)

export interface LocalM {
  /** metres east of the anchor */
  e: number
  /** metres north of the anchor */
  n: number
}

export function lonLatToLocal(lon: number, lat: number): LocalM {
  const [e, n] = toLocal.forward([lon, lat])
  return { e, n }
}

export function localToLonLat(e: number, n: number): { lon: number; lat: number } {
  const [lon, lat] = toLocal.inverse([e, n])
  return { lon, lat }
}

/** Local metres → world/block coordinates (+X east, +Z south). */
export function localToWorld(e: number, n: number): { x: number; z: number } {
  return { x: e * BLOCKS_PER_METRE, z: -n * BLOCKS_PER_METRE }
}

export function worldToLocal(x: number, z: number): LocalM {
  return { e: x / BLOCKS_PER_METRE, n: -z / BLOCKS_PER_METRE }
}

export function lonLatToWorld(lon: number, lat: number): { x: number; z: number } {
  const { e, n } = lonLatToLocal(lon, lat)
  return localToWorld(e, n)
}

export function worldToLonLat(x: number, z: number): { lon: number; lat: number } {
  const { e, n } = worldToLocal(x, z)
  return localToLonLat(e, n)
}

export function lonLatToHk80(lon: number, lat: number): { E: number; N: number } {
  const [E, N] = toHk80.forward([lon, lat])
  return { E, N }
}

export function hk80ToLonLat(E: number, N: number): { lon: number; lat: number } {
  const [lon, lat] = toHk80.inverse([E, N])
  return { lon, lat }
}

/** Study-area rectangle as a closed WGS84 ring [lon, lat][] (counter-clockwise). */
export function studyAreaRing(marginM = 0): [number, number][] {
  const { minE, maxE, minN, maxN } = STUDY_AREA_M
  const corners: [number, number][] = [
    [minE - marginM, minN - marginM],
    [maxE + marginM, minN - marginM],
    [maxE + marginM, maxN + marginM],
    [minE - marginM, maxN + marginM],
  ]
  const ring = corners.map(([e, n]) => {
    const { lon, lat } = localToLonLat(e, n)
    return [lon, lat] as [number, number]
  })
  ring.push(ring[0])
  return ring
}
