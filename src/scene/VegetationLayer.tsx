/**
 * Trees: ~50 000 GPU instances grouped into 256 m regions with three levels of detail.
 *   near — detailed voxel tree per species
 *   mid  — trunk + two canopy boxes
 *   far  — a single canopy box (the whole-campus overview draws only these)
 * No per-tree React components; regions switch level by distance to the camera focus.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { runtime } from '../app/runtime'
import { useApp } from '../app/store'
import { createModelMaterial } from '../lib/voxel/materials'
import { TREE_SPECS, treeFarGeometry, treeMidGeometry, treeNearGeometry } from '../lib/voxel/models'
import { TREE_STRIDE, TREE_TYPE_COUNT } from '../lib/voxel/world-format'
import { rig } from './rig'

const REGION = 256
interface Region {
  cx: number
  cz: number
  near: THREE.InstancedMesh[]
  mid: THREE.InstancedMesh
  far: THREE.InstancedMesh
  level: number
}

function withInstanceLayer(base: THREE.BufferGeometry, layers: Float32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'aUv', 'aLayer']) g.setAttribute(name, base.getAttribute(name))
  g.setIndex(base.getIndex())
  g.setAttribute('aILayer', new THREE.InstancedBufferAttribute(layers, 1))
  return g
}

export function VegetationLayer() {
  const group = useRef<THREE.Group>(null!)
  const visible = useApp((s) => s.layers.trees)
  const perf = useApp((s) => s.perf)
  const regions = useRef<Region[]>([])
  const res = useMemo(
    () => ({
      material: createModelMaterial(runtime.uniforms),
      near: Array.from({ length: TREE_TYPE_COUNT }, (_, t) => treeNearGeometry(t)),
      mid: treeMidGeometry(),
      far: treeFarGeometry(),
    }),
    [],
  )

  useEffect(() => {
    const g = group.current
    const build = () => {
      const w = runtime.world,
        inst = runtime.instances
      if (!w || !inst || regions.current.length) return
      const view = new DataView(inst.trees.buffer, inst.trees.byteOffset, inst.trees.byteLength)
      const n = Math.floor(inst.trees.byteLength / TREE_STRIDE)
      const buckets = new Map<number, number[]>()
      for (let k = 0; k < n; k++) {
        const gx = view.getUint16(k * TREE_STRIDE, true) / 8,
          gz = view.getUint16(k * TREE_STRIDE + 4, true) / 8
        const key = Math.floor(gx / REGION) + Math.floor(gz / REGION) * 64
        let b = buckets.get(key)
        if (!b) {
          b = []
          buckets.set(key, b)
        }
        b.push(k)
      }
      const m4 = new THREE.Matrix4(),
        q = new THREE.Quaternion(),
        p = new THREE.Vector3(),
        s = new THREE.Vector3(),
        up = new THREE.Vector3(0, 1, 0),
        col = new THREE.Color()
      for (const [key, list] of buckets) {
        // deterministic shuffle so that drawing fewer instances (performance mode) thins evenly
        for (let i = list.length - 1; i > 0; i--) {
          const j = (Math.imul(list[i], 2654435761) >>> 0) % (i + 1)
          ;[list[i], list[j]] = [list[j], list[i]]
        }
        const count = list.length
        const midM = new Float32Array(count * 16),
          colours = new Float32Array(count * 3),
          layers = new Float32Array(count)
        const perType: number[][] = Array.from({ length: TREE_TYPE_COUNT }, () => [])
        list.forEach((k, slot) => {
          const o = k * TREE_STRIDE
          const x = view.getUint16(o, true) / 8 + w.minX,
            y = view.getUint16(o + 2, true) - w.bias,
            z = view.getUint16(o + 4, true) / 8 + w.minZ
          const type = Math.min(TREE_TYPE_COUNT - 1, view.getUint8(o + 6)),
            size = view.getUint8(o + 7),
            tint = view.getUint8(o + 8) / 255,
            rot = view.getUint8(o + 9)
          const spec = TREE_SPECS[type]
          const width = spec.width * (size / spec.height) * (0.9 + tint * 0.25)
          q.setFromAxisAngle(up, (rot * Math.PI) / 2)
          m4.compose(p.set(x, y, z), q, s.set(width, size, width)).toArray(midM, slot * 16)
          const b = 0.84 + tint * 0.3
          col.setRGB(b * (0.95 + ((rot * 37) % 7) * 0.012), b, b * (0.92 + ((rot * 53) % 5) * 0.02))
          col.toArray(colours, slot * 3)
          layers[slot] = spec.leaf
          perType[type].push(slot)
        })
        const mk = (geo: THREE.BufferGeometry, cnt: number) => {
          const mesh = new THREE.InstancedMesh(geo, res.material, cnt)
          mesh.castShadow = mesh.receiveShadow = true
          mesh.raycast = () => {}
          mesh.matrixAutoUpdate = false
          return mesh
        }
        const midGeo = withInstanceLayer(res.mid, layers),
          farGeo = withInstanceLayer(res.far, layers)
        const mid = mk(midGeo, count),
          far = mk(farGeo, count)
        mid.instanceMatrix = new THREE.InstancedBufferAttribute(midM, 16)
        far.instanceMatrix = mid.instanceMatrix
        mid.instanceColor = new THREE.InstancedBufferAttribute(colours, 3)
        far.instanceColor = mid.instanceColor
        mid.computeBoundingSphere()
        far.boundingSphere = mid.boundingSphere
        const near: THREE.InstancedMesh[] = []
        perType.forEach((slots, type) => {
          if (!slots.length) return
          const mesh = mk(res.near[type], slots.length)
          const spec = TREE_SPECS[type]
          const c3 = new THREE.Color()
          slots.forEach((slot, i) => {
            m4.fromArray(midM, slot * 16)
            m4.decompose(p, q, s)
            const k = s.y / spec.height
            m4.compose(p, q, s.set(k, k, k))
            mesh.setMatrixAt(i, m4)
            mesh.setColorAt(i, c3.fromArray(colours, slot * 3))
          })
          mesh.computeBoundingSphere()
          mesh.visible = false
          near.push(mesh)
          g.add(mesh)
        })
        mid.visible = false
        g.add(mid, far)
        regions.current.push({ cx: (key % 64) * REGION + REGION / 2 + w.minX, cz: Math.floor(key / 64) * REGION + REGION / 2 + w.minZ, near, mid, far, level: 2 })
      }
      runtime.shadowDirty = true
    }
    build()
    const listener = (kind: string) => {
      if (kind === 'instances') build()
    }
    runtime.listeners.add(listener)
    return () => {
      runtime.listeners.delete(listener)
      for (const r of regions.current) {
        r.mid.geometry.dispose()
        r.far.geometry.dispose()
      }
      regions.current = []
      g.clear()
    }
  }, [res])

  useEffect(() => {
    runtime.shadowDirty = true
  }, [visible, perf])

  const frame = useRef(0)
  useFrame(() => {
    if (frame.current++ % 6 !== 0 || !regions.current.length) return
    const exploring = useApp.getState().mode === 'explore'
    const nearR = perf ? 110 : 190,
      midR = perf ? 380 : 700
    const density = perf ? 0.55 : 1
    for (const r of regions.current) {
      const d = Math.max(0, Math.hypot(r.cx - rig.focus.x, r.cz - rig.focus.z) - REGION * 0.6)
      // in orbit modes the camera sits `viewHeight` away, so judge detail by what a tree covers on screen
      const reach = exploring ? d : Math.max(d, rig.viewHeight * 0.8)
      const level = reach < nearR ? 0 : reach < midR ? 1 : 2
      if (level !== r.level) {
        r.level = level
        runtime.shadowDirty = true
      }
      for (const m of r.near) {
        m.visible = level === 0
        m.count = Math.max(1, Math.floor(m.instanceMatrix.count * density))
      }
      r.mid.visible = level === 1
      r.far.visible = level === 2
      r.mid.count = r.far.count = Math.max(1, Math.floor(r.mid.instanceMatrix.count * density))
    }
  })

  return <group ref={group} visible={visible} />
}
