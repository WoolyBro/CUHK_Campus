/** Shareable URL camera state: mode, pose, selected feature, active layers, time of day. */
import { runtime } from './runtime'
import { LAYER_KEYS, useApp, type CameraMode, type LayerKey, type TimeOfDay } from './store'
import { rig, type OrbitPose } from '../scene/rig'

export interface UrlState {
  mode?: CameraMode
  pose?: OrbitPose
  explore?: { x: number; y: number; z: number; yaw: number; pitch: number }
  selectedKey?: string
  layers?: Record<LayerKey, boolean>
  time?: TimeOfDay
  perf?: boolean
}

const r1 = (n: number) => Math.round(n * 10) / 10
const r3 = (n: number) => Math.round(n * 1000) / 1000
let last = ''
let parsed: UrlState | null | undefined

export function readUrlState(): UrlState | null {
  if (parsed !== undefined) return parsed
  parsed = null
  const h = window.location.hash.replace(/^#/, '')
  if (!h) return null
  const q = new URLSearchParams(h)
  const out: UrlState = {}
  const m = q.get('m')
  if (m === 'iso' || m === 'orbit' || m === 'explore') out.mode = m
  const c = (q.get('c') ?? '').split(',').map(Number)
  if (c.length === 5 && c.every(Number.isFinite)) {
    if (out.mode === 'explore') out.explore = { x: c[0], y: c[1], z: c[2], yaw: c[3], pitch: c[4] }
    else out.pose = { tx: c[0], ty: 0, tz: c[1], az: c[2], pol: c[3], dist: c[4] }
  }
  const s = q.get('s')
  if (s) out.selectedKey = s
  const l = q.get('l')
  if (l && l.length === LAYER_KEYS.length) out.layers = Object.fromEntries(LAYER_KEYS.map((k, i) => [k, l[i] === '1'])) as Record<LayerKey, boolean>
  const t = q.get('t')
  if (t === 'day' || t === 'sunset' || t === 'night') out.time = t
  if (q.get('p') === '1') out.perf = true
  if (q.get('p') === '0') out.perf = false
  parsed = out
  return out
}

export function writeUrlState(): void {
  const s = useApp.getState()
  const q = new URLSearchParams()
  q.set('m', s.mode)
  if (s.mode === 'explore') q.set('c', [r1(rig.pos.x), r1(rig.pos.y), r1(rig.pos.z), r3(rig.yaw), r3(rig.pitch)].join(','))
  else q.set('c', [r1(rig.goal.tx), r1(rig.goal.tz), r3(rig.goal.az), r3(rig.goal.pol), r1(rig.goal.dist)].join(','))
  const f = runtime.world?.feature(s.selected)
  if (f) q.set('s', f.key)
  q.set('l', LAYER_KEYS.map((k) => (s.layers[k] ? '1' : '0')).join(''))
  q.set('t', s.time)
  if (s.perf) q.set('p', '1')
  const next = '#' + q.toString().replace(/%2C/g, ',').replace(/%2F/g, '/')
  if (next !== last) {
    last = next
    window.history.replaceState(null, '', next)
  }
}
