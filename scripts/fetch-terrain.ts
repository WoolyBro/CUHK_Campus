/**
 * fetch-terrain.ts — downloads the Lands Department 5 m Digital Terrain Model once
 * and unpacks it into data/raw/dem/. (Open data under the DATA.GOV.HK terms of use.)
 * The raw grid (≈300 MB unpacked) is git-ignored; only the cropped campus grid is kept.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = resolve(ROOT, 'data/raw/dem')
const URL_DTM = 'https://www.landsd.gov.hk/landsd_psi_data/SMO/data/Whole_HK_DTM_5m.zip'
const ZIP = resolve(DIR, 'Whole_HK_DTM_5m.zip')
const ASC = resolve(DIR, 'Whole_HK_DTM_5m.asc')
const force = process.argv.includes('--force')

mkdirSync(DIR, { recursive: true })
if (existsSync(ASC) && !force) {
  console.log('terrain: DTM already present (use --force to re-download)')
} else {
  console.log('terrain: downloading', URL_DTM)
  const res = await fetch(URL_DTM, { headers: { 'User-Agent': 'cuhk-voxel-campus-build/0.1 (one-off static data extract)' } })
  if (!res.ok) throw new Error(`DTM download failed: HTTP ${res.status}`)
  writeFileSync(ZIP, Buffer.from(await res.arrayBuffer()))
  execFileSync('unzip', ['-o', '-q', ZIP, '-d', DIR])
  writeFileSync(
    resolve(DIR, 'source.json'),
    JSON.stringify({ url: URL_DTM, fetchedAt: new Date().toISOString(), lastModified: res.headers.get('last-modified'), licence: 'DATA.GOV.HK Terms and Conditions of Use' }, null, 2),
  )
  console.log('terrain: unpacked', ASC)
}
