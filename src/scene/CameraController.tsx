/**
 * Camera controller for every mode:
 *   iso      — orthographic three-quarter overview (orbit / pan / zoom)
 *   orbit    — perspective free orbit around any point
 *   explore  — first-person walk / run / fly with terrain following and building collision
 * plus guided fly-to animation (cancelled instantly by any input), picking, URL camera state.
 *
 * All motion is delta-time based with exponential damping; nothing depends on frame rate.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { EYE_HEIGHT } from '../lib/geo/constants'
import { bus, type CameraCommand } from '../app/bus'
import { runtime, setFocus } from '../app/runtime'
import { useApp, type CameraMode } from '../app/store'
import { readUrlState, writeUrlState } from '../app/urlState'
import { DIST_MAX, DIST_MIN, FOV_EXPLORE, FOV_ORBIT, POL_MAX, POL_MIN, clonePose, ease, homePose, orbitOffset, rig, wrapAngle, type OrbitPose } from './rig'

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const ndc = new THREE.Vector2()
const raycaster = new THREE.Raycaster()
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV_ORBIT / 2))
const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

function clampPose(p: OrbitPose) {
  const w = runtime.world
  p.pol = Math.min(POL_MAX, Math.max(POL_MIN, p.pol))
  p.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, p.dist))
  if (w) {
    // soft campus boundary: the pivot may not leave the modelled area
    p.tx = Math.min(w.maxX - 4, Math.max(w.minX + 4, p.tx))
    p.tz = Math.min(w.maxZ - 4, Math.max(w.minZ + 4, p.tz))
  }
}

function flyOrbit(to: OrbitPose, dur = 1.5) {
  clampPose(to)
  const from = clonePose(rig.cur)
  to.az = from.az + wrapAngle(to.az - from.az)
  const hop = Math.hypot(to.tx - from.tx, to.tz - from.tz)
  rig.tween = { t: 0, dur: Math.min(2.6, dur + hop / 2400), from, to, lift: Math.max(0, hop * 0.55 - Math.max(from.dist, to.dist) * 0.5) }
  Object.assign(rig.goal, to)
}
/** Animated move to a pose (instant when the visitor prefers reduced motion). */
function goPose(to: OrbitPose, dur?: number) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    clampPose(to)
    Object.assign(rig.cur, to)
    Object.assign(rig.goal, to)
    rig.tween = null
  } else flyOrbit(to, dur)
}
/** Work to run right after the camera has switched out of explorer mode. */
let afterSwitch: (() => void) | null = null

export function CameraController() {
  const { gl, set, size, scene } = useThree()
  const mode = useApp((s) => s.mode)
  const persp = useMemo(() => {
    const c = new THREE.PerspectiveCamera(FOV_ORBIT, 1, 1, 14000)
    ;(c as unknown as { manual: boolean }).manual = true
    return c
  }, [])
  const ortho = useMemo(() => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 16000)
    ;(c as unknown as { manual: boolean }).manual = true
    return c
  }, [])
  const keys = useRef(new Set<string>())
  const modeRef = useRef<CameraMode>(mode)
  const sizeRef = useRef(size)
  sizeRef.current = size

  // ── initial pose (shareable URL state wins over the default overview) ──
  useLayoutEffect(() => {
    if (rig.initialised) return
    rig.initialised = true
    const home = homePose(size.width / size.height)
    Object.assign(rig.cur, home)
    Object.assign(rig.goal, home)
    const url = readUrlState()
    if (url?.pose) {
      Object.assign(rig.cur, url.pose)
      Object.assign(rig.goal, url.pose)
    }
    if (url?.explore) {
      rig.pos.set(url.explore.x, url.explore.y, url.explore.z)
      rig.yaw = url.explore.yaw
      rig.pitch = url.explore.pitch
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── switch camera object with the mode; keep framing continuous ──
  useLayoutEffect(() => {
    const prev = modeRef.current
    modeRef.current = mode
    const cam = mode === 'iso' ? ortho : persp
    if (mode === 'explore' && prev !== 'explore') {
      // start from where the orbit camera is; glide down if we were far away
      orbitOffset(rig.cur, tmp).multiplyScalar(rig.cur.dist)
      rig.pos.set(rig.cur.tx + tmp.x, rig.cur.ty + tmp.y, rig.cur.tz + tmp.z)
      rig.yaw = rig.cur.az
      rig.pitch = -(Math.PI / 2 - rig.cur.pol)
      rig.vel.set(0, 0, 0)
      const far = rig.cur.dist > 260
      useApp.setState({ flying: far || rig.pos.y - (runtime.world?.groundAt(rig.pos.x, rig.pos.z) ?? 0) > 6 })
      if (far) {
        const back = orbitOffset({ ...rig.cur, pol: 1.25 }, tmp2).multiplyScalar(110)
        rig.etween = {
          t: 0,
          dur: 1.6,
          fromPos: rig.pos.clone(),
          toPos: new THREE.Vector3(rig.cur.tx + back.x, rig.cur.ty + 42, rig.cur.tz + back.z),
          fromYaw: rig.yaw,
          toYaw: rig.yaw,
          fromPitch: rig.pitch,
          toPitch: -0.28,
          thenWalk: false,
        }
      }
    } else if (mode !== 'explore' && prev === 'explore') {
      // pivot on whatever the explorer was looking at
      const dir = tmp.set(-Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), -Math.cos(rig.yaw) * Math.cos(rig.pitch))
      const hit = runtime.world?.pick(rig.pos.x, rig.pos.y, rig.pos.z, dir.x, dir.y, dir.z, 600)
      const d = Math.max(60, hit ? hit.distance : 140)
      const pose: OrbitPose = { tx: rig.pos.x + dir.x * d, ty: rig.pos.y + dir.y * d, tz: rig.pos.z + dir.z * d, az: rig.yaw, pol: Math.min(POL_MAX, Math.max(0.35, Math.PI / 2 + rig.pitch)), dist: d }
      clampPose(pose)
      Object.assign(rig.cur, pose)
      Object.assign(rig.goal, pose)
      rig.etween = null
      afterSwitch?.()
      afterSwitch = null
    }
    persp.fov = mode === 'explore' ? FOV_EXPLORE : FOV_ORBIT
    set({ camera: cam })
  }, [mode, ortho, persp, set])

  // ── commands from the UI ──
  useEffect(() => {
    return bus.on((c: CameraCommand) => {
      const w = runtime.world
      const s = useApp.getState()
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      const go = goPose
      switch (c.type) {
        case 'cancel':
          rig.tween = null
          rig.etween = null
          break
        case 'reset':
          if (s.mode === 'explore') {
            afterSwitch = () => go(homePose(sizeRef.current.width / sizeRef.current.height))
            useApp.setState({ mode: 'iso' })
          } else go(homePose(sizeRef.current.width / sizeRef.current.height))
          break
        case 'north':
          if (s.mode === 'explore') rig.yaw = 0
          else go({ ...rig.goal, az: 0 }, 0.7)
          break
        case 'rotate':
          if (s.mode === 'explore') rig.yaw += c.delta
          else go({ ...rig.goal, az: rig.goal.az + c.delta }, 0.5)
          break
        case 'zoom':
          if (s.mode !== 'explore') go({ ...rig.goal, dist: rig.goal.dist * c.factor }, 0.35)
          break
        case 'flyToPoint':
        case 'flyTo': {
          const x = c.type === 'flyTo' ? c.feature.x : c.x
          const z = c.type === 'flyTo' ? c.feature.z : c.z
          const span = c.type === 'flyTo' && c.feature.bbox ? Math.hypot(c.feature.bbox[2] - c.feature.bbox[0], c.feature.bbox[3] - c.feature.bbox[1]) : 30
          const dist = c.type === 'flyToPoint' && c.dist ? c.dist : c.type === 'flyTo' && c.feature.kind === 'zone' ? 900 : Math.min(900, 150 + span * 2.4)
          const y = w ? w.groundAt(x, z) : 0
          if (s.mode === 'explore') {
            const back = 26 + span * 0.7
            const toPos = new THREE.Vector3(
              x + Math.sin(rig.yaw) * back,
              Math.max(y + 14, (w?.topAt(x + Math.sin(rig.yaw) * back, z + Math.cos(rig.yaw) * back) ?? y) + 6),
              z + Math.cos(rig.yaw) * back,
            )
            rig.etween = { t: 0, dur: reduce ? 0.01 : 1.8, fromPos: rig.pos.clone(), toPos, fromYaw: rig.yaw, toYaw: rig.yaw, fromPitch: rig.pitch, toPitch: -0.3, thenWalk: false }
            useApp.setState({ flying: true })
          } else go({ tx: x, ty: y, tz: z, az: rig.goal.az, pol: Math.min(Math.max(rig.goal.pol, 0.8), 1.08), dist })
          break
        }
        case 'street': {
          const x = s.mode === 'explore' ? rig.pos.x : rig.cur.tx
          const z = s.mode === 'explore' ? rig.pos.z : rig.cur.tz
          if (s.mode !== 'explore') useApp.setState({ mode: 'explore' })
          // runs after the mode effect has positioned the explorer camera
          queueMicrotask(() => {
            const g = w ? w.standAt(x, z, 1e6) : 0
            rig.etween = {
              t: 0,
              dur: reduce ? 0.01 : 1.7,
              fromPos: rig.pos.clone(),
              toPos: new THREE.Vector3(x, g + EYE_HEIGHT, z),
              fromYaw: rig.yaw,
              toYaw: rig.yaw,
              fromPitch: rig.pitch,
              toPitch: 0,
              thenWalk: true,
            }
          })
          break
        }
      }
    })
  }, [])

  // ── pointer / wheel / keyboard input ──
  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    const pointers = new Map<number, { x: number; y: number }>()
    let moved = 0
    let downAt = 0
    let button = 0
    let shift = false
    let pinch = 0
    let lastHover = 0
    const cancelAnim = () => {
      rig.tween = null
      rig.etween = null
      rig.lastInput = performance.now()
    }

    const pickAt = (cx: number, cy: number) => {
      const w = runtime.world
      if (!w) return null
      const r = el.getBoundingClientRect()
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
      const cam = modeRef.current === 'iso' ? ortho : persp
      raycaster.setFromCamera(ndc, cam)
      const o = raycaster.ray.origin,
        d = raycaster.ray.direction
      return w.pick(o.x, o.y, o.z, d.x, d.y, d.z, 20000)
    }
    const pan = (dx: number, dy: number) => {
      const scale = rig.viewHeight / sizeRef.current.height
      const az = rig.goal.az
      // screen-right and screen-up projected on the ground plane
      const rx = Math.cos(az),
        rz = -Math.sin(az)
      const fx = -Math.sin(az),
        fz = -Math.cos(az)
      const fy = scale / Math.max(0.25, Math.cos(rig.goal.pol))
      rig.goal.tx += -dx * scale * rx + dy * fy * fx
      rig.goal.tz += -dx * scale * rz + dy * fy * fz
      clampPose(rig.goal)
    }
    const onDown = (e: PointerEvent) => {
      if (!useApp.getState().started) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      moved = 0
      downAt = performance.now()
      button = e.button
      shift = e.shiftKey || e.ctrlKey || e.metaKey
      cancelAnim()
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      const m = modeRef.current
      if (!p) {
        // hover highlight (mouse only, throttled)
        if (e.pointerType === 'mouse' && useApp.getState().started && performance.now() - lastHover > 60) {
          lastHover = performance.now()
          const hit = pickAt(e.clientX, e.clientY)
          const f = hit?.feature && useApp.getState().layers.buildings ? hit.feature : null
          if (useApp.getState().hovered !== f) useApp.setState({ hovered: f })
          el.style.cursor = f ? 'pointer' : 'grab'
        }
        return
      }
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
      rig.lastInput = performance.now()
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (m === 'explore') {
          if (pinch > 0) {
            const f = (d - pinch) * 0.4
            rig.pos.x += -Math.sin(rig.yaw) * f
            rig.pos.z += -Math.cos(rig.yaw) * f
          }
        } else {
          if (pinch > 0 && d > 0) rig.goal.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, rig.goal.dist * (pinch / d)))
          pan(dx / 2, dy / 2)
        }
        pinch = d
        return
      }
      if (m === 'explore') {
        rig.yaw -= dx * 0.0042
        rig.pitch = Math.min(1.45, Math.max(-1.45, rig.pitch - dy * 0.0042))
      } else if (button === 2 || button === 1 || shift) pan(dx, dy)
      else {
        rig.goal.az -= dx * 0.0052
        rig.goal.pol = Math.min(POL_MAX, Math.max(POL_MIN, rig.goal.pol - dy * 0.0042))
      }
    }
    const onUp = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      pinch = 0
      if (moved < 7 && performance.now() - downAt < 450 && button === 0 && pointers.size === 0) {
        const hit = pickAt(e.clientX, e.clientY)
        const st = useApp.getState()
        const f = hit?.feature && st.layers.buildings ? hit.feature : null
        st.select(f)
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (!useApp.getState().started) return
      e.preventDefault()
      cancelAnim()
      const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY
      if (modeRef.current === 'explore') {
        const f = -dy * 0.06
        tmp.set(-Math.sin(rig.yaw) * Math.cos(rig.pitch), Math.sin(rig.pitch), -Math.cos(rig.yaw) * Math.cos(rig.pitch))
        rig.vel.addScaledVector(tmp, f * 3)
        return
      }
      const k = Math.exp(Math.max(-1, Math.min(1, dy * 0.0016)))
      const old = rig.goal.dist
      rig.goal.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, old * k))
      // zoom toward the point under the cursor
      const hit = pickAt(e.clientX, e.clientY)
      if (hit && rig.goal.dist < old) {
        const t = 1 - rig.goal.dist / old
        rig.goal.tx += (hit.x - rig.goal.tx) * t
        rig.goal.tz += (hit.z - rig.goal.tz) * t
        clampPose(rig.goal)
      }
    }
    const onDbl = (e: MouseEvent) => {
      const hit = pickAt(e.clientX, e.clientY)
      if (hit && modeRef.current !== 'explore') bus.emit({ type: 'flyToPoint', x: hit.x, z: hit.z, dist: Math.max(90, rig.goal.dist * 0.45) })
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const st = useApp.getState()
      if (!st.started) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (k === 'Escape') {
        if (st.panel) st.set({ panel: null })
        else st.select(null)
        return
      }
      if (k === 'r') {
        bus.emit({ type: 'reset' })
        return
      }
      if (k === 'f') {
        if (st.mode === 'explore') st.set({ flying: !st.flying })
        else st.set({ mode: 'explore' })
        return
      }
      if (k === 'n') {
        bus.emit({ type: 'north' })
        return
      }
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && (e.target === document.body || e.target === el)) e.preventDefault()
      keys.current.add(k)
      cancelAnim()
      if (k === ' ' && st.mode === 'explore' && !st.flying && !rig.airborne) {
        rig.jump = 7.5
        rig.airborne = true
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key)
    }
    const onBlur = () => keys.current.clear()
    const noMenu = (e: Event) => e.preventDefault()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDbl)
    el.addEventListener('contextmenu', noMenu)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDbl)
      el.removeEventListener('contextmenu', noMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [gl, ortho, persp])

  const lastFocus = useRef({ x: 1e9, z: 1e9, t: 0 })
  const urlTimer = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(0.1, rawDt)
    const w = runtime.world
    const st = useApp.getState()
    const m = modeRef.current
    const K = keys.current
    const { width, height } = sizeRef.current
    const fog = scene.fog as THREE.Fog | null

    if (m !== 'explore') {
      // keyboard: arrows / WASD pan, Q E rotate, + − zoom, PageUp/Down tilt
      const kx = (K.has('ArrowRight') || K.has('d') ? 1 : 0) - (K.has('ArrowLeft') || K.has('a') ? 1 : 0)
      const kz = (K.has('ArrowUp') || K.has('w') ? 1 : 0) - (K.has('ArrowDown') || K.has('s') ? 1 : 0)
      if (kx || kz) {
        const sp = rig.viewHeight * 0.7 * dt * (K.has('Shift') ? 2.2 : 1)
        const az = rig.goal.az
        rig.goal.tx += (Math.cos(az) * kx - Math.sin(az) * kz) * sp
        rig.goal.tz += (-Math.sin(az) * kx - Math.cos(az) * kz) * sp
      }
      if (K.has('q')) rig.goal.az += 1.4 * dt
      if (K.has('e')) rig.goal.az -= 1.4 * dt
      if (K.has('+') || K.has('=')) rig.goal.dist *= Math.exp(-1.6 * dt)
      if (K.has('-') || K.has('_')) rig.goal.dist *= Math.exp(1.6 * dt)
      if (K.has('PageUp')) rig.goal.pol -= 0.9 * dt
      if (K.has('PageDown')) rig.goal.pol += 0.9 * dt
      clampPose(rig.goal)
      if (w?.ready) rig.goal.ty = w.groundSmooth(rig.goal.tx, rig.goal.tz)

      const c = rig.cur
      if (rig.tween) {
        const tw = rig.tween
        tw.t = Math.min(1, tw.t + dt / tw.dur)
        const e = ease(tw.t)
        c.tx = tw.from.tx + (tw.to.tx - tw.from.tx) * e
        c.tz = tw.from.tz + (tw.to.tz - tw.from.tz) * e
        c.ty = tw.from.ty + (tw.to.ty - tw.from.ty) * e
        c.az = tw.from.az + (tw.to.az - tw.from.az) * e
        c.pol = tw.from.pol + (tw.to.pol - tw.from.pol) * e
        c.dist = Math.exp(Math.log(tw.from.dist) + (Math.log(tw.to.dist) - Math.log(tw.from.dist)) * e) + tw.lift * Math.sin(Math.PI * e)
        if (tw.t >= 1) rig.tween = null
      } else {
        const k = 1 - Math.exp(-dt * 10)
        const g = rig.goal
        c.tx += (g.tx - c.tx) * k
        c.tz += (g.tz - c.tz) * k
        c.ty += (g.ty - c.ty) * (1 - Math.exp(-dt * 5))
        c.az += wrapAngle(g.az - c.az) * k
        c.pol += (g.pol - c.pol) * k
        c.dist = Math.exp(Math.log(c.dist) + (Math.log(g.dist) - Math.log(c.dist)) * k)
      }
      rig.viewHeight = 2 * c.dist * TAN
      orbitOffset(c, tmp)
      if (m === 'iso') {
        ortho.left = -width / 2
        ortho.right = width / 2
        ortho.top = height / 2
        ortho.bottom = -height / 2
        ortho.zoom = height / rig.viewHeight
        ortho.position.set(c.tx + tmp.x * 5000, c.ty + tmp.y * 5000, c.tz + tmp.z * 5000)
        ortho.near = 100
        ortho.far = 12000
        ortho.lookAt(c.tx, c.ty, c.tz)
        ortho.updateProjectionMatrix()
        if (fog) {
          fog.near = 1e6
          fog.far = 2e6
        }
      } else {
        // keep the perspective camera above the terrain / roofs: raise the view until it clears
        if (w?.ready) {
          for (let guard = 0; guard < 24; guard++) {
            const px = c.tx + tmp.x * c.dist,
              py = c.ty + tmp.y * c.dist,
              pz = c.tz + tmp.z * c.dist
            const inside = px > w.minX && px < w.maxX && pz > w.minZ && pz < w.maxZ
            if (!inside || py > w.topAt(px, pz) + 2.5 || c.pol <= POL_MIN + 0.03) break
            c.pol -= 0.025
            rig.goal.pol = Math.min(rig.goal.pol, c.pol)
            orbitOffset(c, tmp)
          }
        }
        persp.aspect = width / height
        persp.position.set(c.tx + tmp.x * c.dist, c.ty + tmp.y * c.dist, c.tz + tmp.z * c.dist)
        persp.near = Math.min(40, Math.max(0.6, c.dist * 0.02))
        persp.far = c.dist + 9000
        persp.lookAt(c.tx, c.ty, c.tz)
        persp.updateProjectionMatrix()
        if (fog) {
          fog.near = c.dist * 0.9 + 500
          fog.far = c.dist + (st.perf ? 4200 : 6200)
        }
      }
      rig.focus.set(c.tx, c.ty, c.tz)
      rig.heading = (((-(c.az * 180) / Math.PI) % 360) + 360) % 360
    } else {
      // ── first-person explorer ──
      if (rig.etween) {
        const tw = rig.etween
        tw.t = Math.min(1, tw.t + dt / tw.dur)
        const e = ease(tw.t)
        rig.pos.lerpVectors(tw.fromPos, tw.toPos, e)
        rig.yaw = tw.fromYaw + (tw.toYaw - tw.fromYaw) * e
        rig.pitch = tw.fromPitch + (tw.toPitch - tw.fromPitch) * e
        rig.vel.set(0, 0, 0)
        if (tw.t >= 1) {
          if (tw.thenWalk) useApp.setState({ flying: false })
          rig.etween = null
        }
      } else {
        const fwd = (K.has('w') || K.has('ArrowUp') ? 1 : 0) - (K.has('s') || K.has('ArrowDown') ? 1 : 0) - rig.joy.y
        const side = (K.has('d') || K.has('ArrowRight') ? 1 : 0) - (K.has('a') || K.has('ArrowLeft') ? 1 : 0) + rig.joy.x
        const up = (K.has('e') || K.has(' ') ? 1 : 0) - (K.has('q') ? 1 : 0) + rig.vert
        const fast = K.has('Shift')
        const speed = st.flying ? (fast ? 120 : 40) : fast ? 15 : 6
        const cp = st.flying ? Math.cos(rig.pitch) : 1
        const want = tmp.set(
          (-Math.sin(rig.yaw) * cp * fwd + Math.cos(rig.yaw) * side) * speed,
          st.flying ? (Math.sin(rig.pitch) * fwd + up) * speed : 0,
          (-Math.cos(rig.yaw) * cp * fwd - Math.sin(rig.yaw) * side) * speed,
        )
        rig.vel.lerp(want, 1 - Math.exp(-dt * 9))
        if (w?.ready) {
          const feet = rig.pos.y - EYE_HEIGHT
          const nx = rig.pos.x + rig.vel.x * dt,
            nz = rig.pos.z + rig.vel.z * dt
          // axis-separated collision so the camera slides along walls
          const hit = (x: number, z: number) => (st.flying ? flyBlocked(x, z, rig.pos.y) : w.blocked(x, z, feet, rig.pos.y + 0.3))
          if (!hit(nx, rig.pos.z)) rig.pos.x = nx
          else rig.vel.x = 0
          if (!hit(rig.pos.x, nz)) rig.pos.z = nz
          else rig.vel.z = 0
          rig.pos.x = Math.min(w.maxX - 2, Math.max(w.minX + 2, rig.pos.x))
          rig.pos.z = Math.min(w.maxZ - 2, Math.max(w.minZ + 2, rig.pos.z))
          if (st.flying) {
            rig.pos.y += rig.vel.y * dt
            const floor = w.groundSmooth(rig.pos.x, rig.pos.z) + 1.6
            const s = w.structureAt(rig.pos.x, rig.pos.z)
            const roof = s && rig.pos.y > s[0] - 1 && rig.pos.y < s[1] + 1.6 ? s[1] + 1.6 : -1e9
            rig.pos.y = Math.min(1400, Math.max(rig.pos.y, floor, roof))
            rig.airborne = false
          } else {
            const stand = w.standAt(rig.pos.x, rig.pos.z, rig.pos.y - EYE_HEIGHT) + EYE_HEIGHT
            if (rig.airborne) {
              rig.pos.y += rig.jump * dt
              rig.jump -= 24 * dt
              if (rig.pos.y <= stand) {
                rig.pos.y = stand
                rig.airborne = false
                rig.jump = 0
              }
            } else rig.pos.y += (stand - rig.pos.y) * (1 - Math.exp(-dt * (rig.pos.y > stand + 3 ? 4 : 14)))
          }
        } else rig.pos.addScaledVector(rig.vel, dt)
      }
      persp.aspect = width / height
      persp.position.copy(rig.pos)
      persp.rotation.set(rig.pitch, rig.yaw, 0, 'YXZ')
      const alt = w?.ready ? rig.pos.y - w.groundAt(rig.pos.x, rig.pos.z) : 50
      persp.near = alt < 12 ? 0.15 : 0.6
      persp.far = 9000
      persp.updateProjectionMatrix()
      rig.viewHeight = Math.max(60, alt * 2.2)
      rig.focus.copy(rig.pos)
      rig.heading = (((-(rig.yaw * 180) / Math.PI) % 360) + 360) % 360
      if (fog) {
        fog.near = 260 + alt * 2
        fog.far = (st.perf ? 2300 : 3600) + alt * 4
      }
    }

    // tell the loader which chunks matter most, and keep the shareable URL fresh
    const now = performance.now()
    if (now - lastFocus.current.t > 400 && Math.hypot(rig.focus.x - lastFocus.current.x, rig.focus.z - lastFocus.current.z) > 96) {
      lastFocus.current = { x: rig.focus.x, z: rig.focus.z, t: now }
      if (!st.loaded) setFocus(rig.focus.x, rig.focus.z)
    }
    if (st.started && now - urlTimer.current > 600) {
      urlTimer.current = now
      writeUrlState()
    }

    function flyBlocked(x: number, z: number, y: number): boolean {
      if (!w) return false
      if (x < w.minX + 2 || z < w.minZ + 2 || x > w.maxX - 2 || z > w.maxZ - 2) return true
      const s = w.structureAt(x, z)
      return !!s && y > s[0] - 0.6 && y < s[1] + 0.8 && s[1] - s[0] > 2
    }
  }, -1)

  return null
}
