import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import type { FeatureRecord, WorldMeta } from '../src/lib/voxel/world-format'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const worldBuilt = existsSync(resolve(ROOT, 'public/world/world.json'))
export const readJson = <T>(p: string): T => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')) as T

export function loadWorld() {
  const meta = readJson<WorldMeta>('public/world/world.json')
  const features = readJson<FeatureRecord[]>('public/world/features.json')
  const raw = gunzipSync(readFileSync(resolve(ROOT, 'public/world', meta.columns.file)))
  const W = meta.world.sizeX,
    D = meta.world.sizeZ,
    N = W * D
  let o = 0
  const take = (bytes: number) => {
    const s = raw.buffer.slice(raw.byteOffset + o, raw.byteOffset + o + bytes)
    o += bytes
    return s
  }
  const height = new Uint16Array(take(N * 2))
  const surface = new Uint8Array(take(N))
  const sBot = new Uint16Array(take(N * 2))
  const sTop = new Uint16Array(take(N * 2))
  const sFeat = new Uint16Array(take(N * 2))
  const zone = new Uint8Array(take(meta.zoneGrid.w * meta.zoneGrid.d))
  for (let j = 0; j < D; j++) {
    let acc = 0
    for (let i = 0; i < W; i++) {
      acc = (acc + height[j * W + i]) & 0xffff
      height[j * W + i] = acc
    }
  }
  return { meta, features, W, D, height, surface, sBot, sTop, sFeat, zone }
}
