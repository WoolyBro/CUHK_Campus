/**
 * Runtime singleton: owns the world model, shared GPU uniforms and the loader worker.
 * Scene layers subscribe to geometry as it streams in.
 */
import * as THREE from 'three'
import { World } from '../lib/terrain/world'
import type { WorkerIn, WorkerOut } from '../lib/terrain/world.worker'
import { FEATURE_TEX_WIDTH, createQuadBase, createUniforms } from '../lib/voxel/materials'
import type { FeatureRecord, WorldMeta } from '../lib/voxel/world-format'
import { useApp } from './store'

export type ChunkMsg = Extract<WorkerOut, { type: 'chunk' }>
export type StructMsg = Extract<WorkerOut, { type: 'structures' }>
export type InstanceMsg = Extract<WorkerOut, { type: 'instances' }>
type Listener = (kind: 'chunk' | 'structures' | 'instances' | 'columns', payload?: ChunkMsg) => void

export const runtime = {
  world: null as World | null,
  uniforms: createUniforms(),
  quadBase: createQuadBase(),
  chunks: [] as ChunkMsg[],
  structures: null as StructMsg | null,
  instances: null as InstanceMsg | null,
  listeners: new Set<Listener>(),
  shadowDirty: true,
  /** Rendering invalidation hook, set by the scene. */
  invalidate: () => {},
  worker: null as Worker | null,
  started: false,
}

const emit: Listener = (kind, payload) => {
  runtime.shadowDirty = true
  for (const l of runtime.listeners) l(kind, payload)
  runtime.invalidate()
}

export const BASE = `${import.meta.env.BASE_URL}world/`

export function setFocus(x: number, z: number) {
  const w = runtime.world
  if (!w || !runtime.worker) return
  const msg: WorkerIn = { type: 'focus', focus: [x - w.minX, z - w.minZ] }
  runtime.worker.postMessage(msg)
}

/** Colours the per-feature overlay texture (zone tint or confidence classes). */
export function paintFeatureOverlay(colourOf: (f: FeatureRecord) => [string, number] | null) {
  const w = runtime.world
  if (!w) return
  const rows = Math.max(1, Math.ceil((w.features.length + 1) / FEATURE_TEX_WIDTH))
  const data = new Uint8Array(FEATURE_TEX_WIDTH * rows * 4)
  const c = new THREE.Color()
  for (const f of w.features) {
    const col = colourOf(f)
    if (!col) continue
    c.set(col[0])
    data[f.i * 4] = Math.round(c.r * 255)
    data[f.i * 4 + 1] = Math.round(c.g * 255)
    data[f.i * 4 + 2] = Math.round(c.b * 255)
    data[f.i * 4 + 3] = Math.round(col[1] * 255)
  }
  const tex = new THREE.DataTexture(data, FEATURE_TEX_WIDTH, rows)
  tex.magFilter = tex.minFilter = THREE.NearestFilter
  tex.needsUpdate = true
  runtime.uniforms.uFeatureTex.value.dispose()
  runtime.uniforms.uFeatureTex.value = tex
}

export async function startLoading(): Promise<void> {
  if (runtime.started) return
  runtime.started = true
  const app = useApp.getState()
  try {
    const [meta, features] = await Promise.all([
      fetch(`${BASE}world.json`).then((r) => {
        if (!r.ok) throw new Error(`world.json: HTTP ${r.status}`)
        return r.json() as Promise<WorldMeta>
      }),
      fetch(`${BASE}features.json`).then((r) => {
        if (!r.ok) throw new Error(`features.json: HTTP ${r.status}`)
        return r.json() as Promise<FeatureRecord[]>
      }),
    ])
    const world = new World(meta)
    world.setFeatures(features)
    runtime.world = world
    runtime.uniforms.uWorldMin.value.set(world.minX, world.minZ)
    runtime.uniforms.uWorldSize.value.set(world.W, world.D)
    useApp.setState({ catalogReady: true })
    emit('columns')

    const worker = new Worker(new URL('../lib/terrain/world.worker.ts', import.meta.url), { type: 'module' })
    runtime.worker = worker
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const msg = e.data
      switch (msg.type) {
        case 'progress':
          useApp.setState({ loadPhase: msg.phase, loadProgress: msg.value })
          break
        case 'columns': {
          world.height = msg.height
          world.surface = msg.surface
          world.sBot = msg.sBot
          world.sTop = msg.sTop
          world.sFeat = msg.sFeat
          world.zone = msg.zone
          let top = 0
          for (let i = 0; i < msg.height.length; i += 97) if (msg.height[i] > top) top = msg.height[i]
          world.maxY = top - world.bias + 70
          const zt = new THREE.DataTexture(msg.zone, meta.zoneGrid.w, meta.zoneGrid.d, THREE.RedFormat, THREE.UnsignedByteType)
          zt.magFilter = zt.minFilter = THREE.NearestFilter
          zt.needsUpdate = true
          runtime.uniforms.uZoneTex.value = zt
          emit('columns')
          break
        }
        case 'structures':
          runtime.structures = msg
          emit('structures')
          break
        case 'instances':
          runtime.instances = msg
          emit('instances')
          break
        case 'chunk':
          runtime.chunks.push(msg)
          emit('chunk', msg)
          if (msg.lod === 0) useApp.setState({ loadPhase: 'Building terrain', loadProgress: 0.6 + 0.4 * (msg.done / msg.total) })
          else useApp.setState({ loadPhase: 'Building terrain', loadProgress: 0.58 })
          break
        case 'done':
          useApp.setState({ loaded: true, loadProgress: 1, loadPhase: 'Ready' })
          break
        case 'error':
          useApp.setState({ error: msg.message })
          break
      }
    }
    worker.onerror = (e) => useApp.setState({ error: e.message || 'World loader failed' })
    const load: WorkerIn = { type: 'load', base: new URL(BASE, window.location.href).href, meta, focus: [world.W / 2, world.D / 2] }
    worker.postMessage(load)
  } catch (err) {
    app.set({ error: err instanceof Error ? err.message : String(err) })
  }
}
