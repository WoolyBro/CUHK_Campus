/// <reference lib="webworker" />
/**
 * World loader worker. Downloads and decompresses the shipped world data, then meshes terrain
 * chunk by chunk (nearest to the current camera focus first) so the main thread never blocks.
 */
import { gunzipSync } from 'fflate'
import { meshTerrainChunk, type ColumnGrid } from '../voxel/mesher'
import { isBuiltSurface, isWaterSurface } from '../voxel/palette'
import type { WorldMeta } from '../voxel/world-format'

export type WorkerIn = { type: 'load'; base: string; meta: WorldMeta; focus: [number, number] } | { type: 'focus'; focus: [number, number] }

export type WorkerOut =
  | { type: 'progress'; phase: string; value: number }
  | { type: 'columns'; height: Uint16Array; surface: Uint8Array; sBot: Uint16Array; sTop: Uint16Array; sFeat: Uint16Array; zone: Uint8Array }
  | { type: 'structures'; origin: Uint16Array; quad: Uint8Array; feature: Uint16Array }
  | { type: 'instances'; trees: Uint8Array; props: Uint8Array }
  | { type: 'chunk'; lod: 0 | 1; cx: number; cz: number; origin: Uint16Array; quad: Uint8Array; count: number; minY: number; maxY: number; done: number; total: number }
  | { type: 'done' }
  | { type: 'error'; message: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope
const post = (msg: WorkerOut, transfer: Transferable[] = []) => ctx.postMessage(msg, transfer)
let focus: [number, number] = [0, 0]

async function fetchGz(url: string, phase: string, weight: [number, number]): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  let bytes: Uint8Array
  if (res.body && total) {
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let got = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      got += value.length
      post({ type: 'progress', phase, value: weight[0] + (weight[1] - weight[0]) * Math.min(1, got / total) })
    }
    bytes = new Uint8Array(got)
    let o = 0
    for (const c of chunks) {
      bytes.set(c, o)
      o += c.length
    }
  } else bytes = new Uint8Array(await res.arrayBuffer())
  // Some hosts transparently decode gzip; only inflate when the gzip magic is present.
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes
}

/** Half-resolution column grid for distant terrain: built surfaces win so roads and paths stay readable. */
function buildLod(g: ColumnGrid): ColumnGrid {
  const w = g.w >> 1,
    d = g.d >> 1
  const height = new Uint16Array(w * d),
    surface = new Uint8Array(w * d)
  for (let j = 0; j < d; j++)
    for (let i = 0; i < w; i++) {
      let best = -1,
        bh = 0,
        bs = 0
      for (let b = 0; b < 2; b++)
        for (let a = 0; a < 2; a++) {
          const c = (j * 2 + b) * g.w + i * 2 + a
          const s = g.surface[c],
            h = g.height[c]
          const pr = isBuiltSurface(s) ? 3 : isWaterSurface(s) ? 1 : 2
          if (pr > best || (pr === best && h > bh)) {
            best = pr
            bh = h
            bs = s
          }
        }
      height[j * w + i] = bh
      surface[j * w + i] = bs
    }
  return { w, d, height, surface }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

async function load(base: string, meta: WorldMeta) {
  const { sizeX: W, sizeZ: D, chunk } = meta.world
  const N = W * D
  const raw = await fetchGz(base + meta.columns.file, 'Downloading terrain', [0, 0.3])
  let o = 0
  const take = (bytes: number) => {
    const s = raw.slice(o, o + bytes)
    o += bytes
    return s
  }
  const height = new Uint16Array(take(N * 2).buffer)
  const surface = take(N)
  const sBot = new Uint16Array(take(N * 2).buffer)
  const sTop = new Uint16Array(take(N * 2).buffer)
  const sFeat = new Uint16Array(take(N * 2).buffer)
  const zone = take(meta.zoneGrid.w * meta.zoneGrid.d)
  // heights are stored as row-wise deltas
  for (let j = 0; j < D; j++) {
    let acc = 0
    const row = j * W
    for (let i = 0; i < W; i++) {
      acc = (acc + height[row + i]) & 0xffff
      height[row + i] = acc
    }
  }
  post({ type: 'columns', height: height.slice(), surface: surface.slice(), sBot, sTop, sFeat, zone }, [sBot.buffer, sTop.buffer, sFeat.buffer, zone.buffer])

  const sraw = await fetchGz(base + meta.structures.file, 'Downloading buildings', [0.3, 0.45])
  const Q = meta.structures.quadCount
  const sOrigin = new Uint16Array(sraw.slice(0, Q * 6).buffer)
  const sQuad = sraw.slice(Q * 6, Q * 10)
  const sFeature = new Uint16Array(sraw.slice(Q * 10, Q * 12).buffer)
  post({ type: 'structures', origin: sOrigin, quad: sQuad, feature: sFeature }, [sOrigin.buffer, sQuad.buffer, sFeature.buffer])

  const trees = await fetchGz(base + meta.trees.file, 'Downloading vegetation', [0.45, 0.52])
  const props = await fetchGz(base + meta.props.file, 'Downloading details', [0.52, 0.55])
  post({ type: 'instances', trees, props }, [trees.buffer, props.buffer])

  // terrain chunks, nearest to the camera focus first (re-sorted when the focus moves)
  const cxN = W / chunk,
    czN = D / chunk
  const pending: [number, number][] = []
  for (let cz = 0; cz < czN; cz++) for (let cx = 0; cx < cxN; cx++) pending.push([cx, cz])
  const total = pending.length
  const grid = { w: W, d: D, height, surface }
  const coarse = buildLod(grid)
  const emit = (lod: 0 | 1, cx: number, cz: number, done: number) => {
    const t = (lod === 0 ? meshTerrainChunk(grid, cx, cz, chunk) : meshTerrainChunk(coarse, cx, cz, chunk >> 1)).trimmed()
    let minY = 65535,
      maxY = 0
    for (let q = 0; q < t.count; q++) {
      const y = t.origin[q * 3 + 1]
      const top = y + (t.quad[q * 4 + 2] === 2 ? 0 : t.quad[q * 4 + 1])
      if (y < minY) minY = y
      if (top > maxY) maxY = top
    }
    post({ type: 'chunk', lod, cx, cz, origin: t.origin, quad: t.quad, count: t.count, minY, maxY, done, total }, [t.origin.buffer, t.quad.buffer])
  }
  // 1) the whole campus at half resolution first — the overview is complete almost immediately
  for (let k = 0; k < pending.length; k++) {
    emit(1, pending[k][0], pending[k][1], 0)
    if (k % 16 === 15) await tick()
  }
  // 2) full-resolution chunks, nearest to the camera focus first
  let done = 0
  let sortedFor = ''
  while (pending.length) {
    const key = focus.join(',')
    if (key !== sortedFor) {
      const fx = focus[0] / chunk,
        fz = focus[1] / chunk
      pending.sort((a, b) => Math.hypot(b[0] + 0.5 - fx, b[1] + 0.5 - fz) - Math.hypot(a[0] + 0.5 - fx, a[1] + 0.5 - fz))
      sortedFor = key
    }
    const [cx, cz] = pending.pop()!
    done++
    emit(0, cx, cz, done)
    if (done % 4 === 0) await tick()
  }
  post({ type: 'done' })
}

ctx.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  if (msg.type === 'focus') focus = msg.focus
  else if (msg.type === 'load') {
    focus = msg.focus
    load(msg.base, msg.meta).catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }))
  }
}
