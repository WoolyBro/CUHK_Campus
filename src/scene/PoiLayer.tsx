/**
 * Points of interest and small details:
 *  - instanced props (lamps, bus shelters, benches, fences, shrubs) — drawn only when zoomed in
 *  - the selection marker anchored to the selected feature
 *  - floating labels, rendered as pooled DOM nodes and decluttered by priority, zoom and overlap
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { bus } from '../app/bus'
import { runtime } from '../app/runtime'
import { useApp } from '../app/store'
import { createModelMaterial } from '../lib/voxel/materials'
import { propGeometry } from '../lib/voxel/models'
import { PROP, PROP_STRIDE, PROP_TYPE_COUNT, type FeatureRecord } from '../lib/voxel/world-format'
import { rig } from './rig'

const v = new THREE.Vector3()
const dirV = new THREE.Vector3()

function Props() {
  const group = useRef<THREE.Group>(null!)
  const material = useMemo(() => createModelMaterial(runtime.uniforms), [])
  const perf = useApp((s) => s.perf)
  const trees = useApp((s) => s.layers.trees)

  useEffect(() => {
    const g = group.current
    const build = () => {
      const w = runtime.world,
        inst = runtime.instances
      if (!w || !inst || g.children.length) return
      const view = new DataView(inst.props.buffer, inst.props.byteOffset, inst.props.byteLength)
      const n = Math.floor(inst.props.byteLength / PROP_STRIDE)
      const lists: number[][] = Array.from({ length: PROP_TYPE_COUNT }, () => [])
      for (let k = 0; k < n; k++) lists[Math.min(PROP_TYPE_COUNT - 1, view.getUint8(k * PROP_STRIDE + 6))].push(k)
      const m4 = new THREE.Matrix4(),
        q = new THREE.Quaternion(),
        p = new THREE.Vector3(),
        s = new THREE.Vector3(),
        up = new THREE.Vector3(0, 1, 0)
      lists.forEach((list, type) => {
        if (!list.length) return
        const mesh = new THREE.InstancedMesh(propGeometry(type), material, list.length)
        list.forEach((k, i) => {
          const o = k * PROP_STRIDE
          const rot = view.getUint8(o + 7),
            a = view.getUint8(o + 8)
          const sc = type === PROP.SHRUB || type === PROP.FLOWER_SHRUB ? 0.8 + (a % 10) * 0.05 : 1
          q.setFromAxisAngle(up, (rot * Math.PI) / 2)
          mesh.setMatrixAt(i, m4.compose(p.set(view.getUint16(o, true) / 8 + w.minX, view.getUint16(o + 2, true) - w.bias, view.getUint16(o + 4, true) / 8 + w.minZ), q, s.set(sc, sc, sc)))
        })
        mesh.userData.type = type
        mesh.castShadow = type === PROP.BUS_SHELTER
        mesh.receiveShadow = true
        mesh.frustumCulled = false
        mesh.raycast = () => {}
        g.add(mesh)
      })
    }
    build()
    const listener = (kind: string) => {
      if (kind === 'instances') build()
    }
    runtime.listeners.add(listener)
    return () => {
      runtime.listeners.delete(listener)
      g.clear()
    }
  }, [material])

  useFrame(() => {
    // distance culling for small details
    const show = rig.viewHeight < (perf ? 260 : 620)
    for (const m of group.current.children) {
      const t = m.userData.type as number
      m.visible = show && (t === PROP.SHRUB || t === PROP.FLOWER_SHRUB ? trees && !perf : true)
    }
  })
  return <group ref={group} />
}

function SelectionMarker() {
  const selected = useApp((s) => s.selected)
  const ref = useRef<THREE.Group>(null!)
  const gem = useRef<THREE.Mesh>(null!)
  const beam = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    const f = runtime.world?.feature(selected)
    ref.current.visible = !!f
    if (!f) return
    const size = Math.max(1.2, rig.viewHeight * 0.012)
    const top = f.kind === 'building' ? f.y : (runtime.world?.topAt(f.x, f.z) ?? f.y)
    ref.current.position.set(f.x, top, f.z)
    gem.current.position.y = size * (2.2 + Math.sin(state.clock.elapsedTime * 3) * 0.35)
    gem.current.rotation.y = state.clock.elapsedTime * 1.6
    gem.current.scale.setScalar(size)
    beam.current.scale.set(size * 0.12, size * 1.6, size * 0.12)
    beam.current.position.y = size * 0.8
    runtime.uniforms.uSelected.value = f.kind === 'building' ? f.i : -1
  })
  useEffect(() => {
    if (!selected) runtime.uniforms.uSelected.value = -1
  }, [selected])
  return (
    <group ref={ref} visible={false}>
      <mesh ref={gem} raycast={() => {}}>
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#ffd23f" fog={false} />
      </mesh>
      <mesh ref={beam} raycast={() => {}}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffd23f" transparent opacity={0.75} fog={false} />
      </mesh>
    </group>
  )
}

interface LabelNode {
  el: HTMLButtonElement
  feature: FeatureRecord | null
  w: number
}

function Labels() {
  const { gl, camera, size } = useThree()
  const pool = useRef<LabelNode[]>([])
  const container = useRef<HTMLDivElement | null>(null)
  const chosen = useRef<FeatureRecord[]>([])
  const lastPick = useRef(0)
  const camRef = useRef(camera)
  camRef.current = camera

  useEffect(() => {
    const parent = gl.domElement.parentElement
    if (!parent) return
    const div = document.createElement('div')
    div.className = 'label-layer'
    div.setAttribute('aria-hidden', 'true')
    parent.appendChild(div)
    container.current = div
    const nodes = pool.current
    return () => {
      div.remove()
      nodes.length = 0
      container.current = null
    }
  }, [gl])

  useFrame(() => {
    const w = runtime.world,
      div = container.current
    if (!w || !div) return
    const st = useApp.getState()
    const cam = camRef.current
    const now = performance.now()
    const vh = rig.viewHeight
    const maxLabels = st.coarse ? 12 : st.perf ? 20 : 34
    const show = st.started && st.layers.labels

    // re-select which labels to show a few times per second
    if (now - lastPick.current > 220) {
      lastPick.current = now
      const picked: FeatureRecord[] = []
      if (show) {
        const cands: { f: FeatureRecord; score: number; sx: number; sy: number }[] = []
        const sel = st.selected
        for (const f of w.features) {
          let ok: boolean
          if (f.i === sel) ok = true
          else if (f.kind === 'zone') ok = (st.layers.zones || vh > 620) && vh > 260
          else if (f.kind === 'building') ok = st.layers.buildings && (f.rank >= 80 ? vh < 1500 : f.rank >= 50 ? vh < 520 : f.rank >= 10 ? vh < 240 : false)
          else if (f.kind === 'landmark') ok = st.layers.landmarks && vh < 1900
          else if (f.kind === 'road') ok = st.layers.roads && vh < 520
          else ok = st.layers.pois && vh < 460
          if (!ok) continue
          v.set(f.x, f.y + 3, f.z).project(cam)
          if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.96) continue
          const dx = f.x - rig.focus.x,
            dz = f.z - rig.focus.z
          cands.push({ f, score: f.rank + (f.i === sel ? 1000 : 0) - (Math.hypot(dx, dz) / Math.max(40, vh)) * 6, sx: (v.x * 0.5 + 0.5) * size.width, sy: (-v.y * 0.5 + 0.5) * size.height })
        }
        cands.sort((a, b) => b.score - a.score)
        const boxes: [number, number, number, number][] = []
        const ortho = (cam as THREE.OrthographicCamera).isOrthographicCamera
        cam.getWorldDirection(dirV)
        let tests = 0
        for (const c of cands) {
          if (picked.length >= maxLabels) break
          const text = c.f.kind === 'zone' ? c.f.name.toUpperCase() : c.f.name
          const bw = Math.min(230, text.length * 6.6 + (c.f.short || c.f.code ? 44 : 18)),
            bh = 24
          const box: [number, number, number, number] = [c.sx - bw / 2, c.sy - bh - 6, c.sx + bw / 2, c.sy - 6]
          if (boxes.some((b) => box[0] < b[2] + 6 && box[2] > b[0] - 6 && box[1] < b[3] + 4 && box[3] > b[1] - 4)) continue
          // hide labels whose anchor is behind a hill or building (zones float above everything)
          if (c.f.kind !== 'zone' && c.f.i !== sel) {
            const ax = c.f.x,
              ay = c.f.y + 3,
              az = c.f.z
            let ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, dist: number
            if (ortho) {
              dist = 2500
              dx = dirV.x
              dy = dirV.y
              dz = dirV.z
              ox = ax - dx * dist
              oy = ay - dy * dist
              oz = az - dz * dist
            } else {
              ox = cam.position.x
              oy = cam.position.y
              oz = cam.position.z
              dist = Math.hypot(ax - ox, ay - oy, az - oz)
              if (dist > Math.max(340, vh * 2.6)) continue
              dx = (ax - ox) / dist
              dy = (ay - oy) / dist
              dz = (az - oz) / dist
            }
            if (++tests > 140) continue
            const hit = w.pick(ox, oy, oz, dx, dy, dz, dist)
            if (hit && hit.distance < dist - 10 && hit.feature !== c.f.i) continue
          }
          boxes.push(box)
          picked.push(c.f)
        }
      }
      chosen.current = picked
      // sync the DOM pool
      while (pool.current.length < picked.length) {
        const el = document.createElement('button')
        el.type = 'button'
        el.tabIndex = -1
        const node: LabelNode = { el, feature: null, w: 0 }
        el.addEventListener('click', () => {
          if (node.feature) {
            useApp.getState().select(node.feature.i)
            bus.emit({ type: 'flyTo', feature: node.feature })
          }
        })
        div.appendChild(el)
        pool.current.push(node)
      }
      pool.current.forEach((node, i) => {
        const f = picked[i] ?? null
        if (node.feature !== f) {
          node.feature = f
          if (f) {
            node.el.className = `map-label kind-${f.kind}${f.tier === 'A' ? ' tier-a' : ''}`
            const tag = f.short || f.code
            node.el.replaceChildren(document.createTextNode(f.name), ...(tag ? [Object.assign(document.createElement('span'), { className: 'tag', textContent: tag })] : []))
          }
        }
        node.el.classList.toggle('is-selected', !!f && f.i === st.selected)
        node.el.style.display = f ? '' : 'none'
      })
    }
    // per-frame placement of the visible labels
    pool.current.forEach((node, i) => {
      const f = chosen.current[i]
      if (!f) return
      v.set(f.x, f.y + 3, f.z).project(cam)
      const hidden = v.z > 1 || v.z < -1
      node.el.style.opacity = hidden ? '0' : '1'
      node.el.style.transform = `translate(-50%, -100%) translate(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height - 6).toFixed(1)}px)`
    })
  })
  return null
}

export function PoiLayer() {
  const hovered = useApp((s) => s.hovered)
  useEffect(() => {
    runtime.uniforms.uHovered.value = hovered ?? -1
  }, [hovered])
  return (
    <>
      <Props />
      <SelectionMarker />
      <Labels />
    </>
  )
}
