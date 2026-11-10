/**
 * Terrain chunks: block-stepped ground, roads, paths and water, streamed from the loader worker.
 * Every chunk exists at two levels of detail (1 m and 2 m columns); distant chunks — and the
 * whole campus when zoomed out — draw the coarse one.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { runtime, type ChunkMsg } from '../app/runtime'
import { useApp } from '../app/store'
import { createQuadDepthMaterial, createQuadGeometry, createQuadMaterial } from '../lib/voxel/materials'
import { rig } from './rig'

interface Slot {
  fine?: THREE.Mesh
  coarse?: THREE.Mesh
  x: number
  z: number
  useFine: boolean
}

export function TerrainLayer() {
  const group = useRef<THREE.Group>(null!)
  const visible = useApp((s) => s.layers.terrain)
  const perf = useApp((s) => s.perf)
  const slots = useRef(new Map<number, Slot>())
  const mats = useMemo(() => ({ main: createQuadMaterial(runtime.uniforms, false), depth: createQuadDepthMaterial() }), [])

  useEffect(() => {
    const g = group.current
    const map = slots.current
    const add = (c: ChunkMsg) => {
      const w = runtime.world
      if (!w || !c.count) return
      const chunk = w.meta.world.chunk
      const span = c.lod === 0 ? chunk : chunk / 2
      const geo = createQuadGeometry(runtime.quadBase, c.origin, c.quad, null, c.count)
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, c.minY, 0), new THREE.Vector3(span, c.maxY, span))
      geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere())
      const mesh = new THREE.Mesh(geo, mats.main)
      mesh.customDepthMaterial = mats.depth
      mesh.position.set(w.minX + c.cx * chunk, -w.bias, w.minZ + c.cz * chunk)
      if (c.lod === 1) mesh.scale.set(2, 1, 2)
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      mesh.castShadow = mesh.receiveShadow = true
      mesh.raycast = () => {}
      const key = c.cz * 64 + c.cx
      let slot = map.get(key)
      if (!slot) {
        slot = { x: w.minX + (c.cx + 0.5) * chunk, z: w.minZ + (c.cz + 0.5) * chunk, useFine: false }
        map.set(key, slot)
      }
      if (c.lod === 0) {
        slot.fine = mesh
        mesh.visible = false
      } else slot.coarse = mesh
      g.add(mesh)
    }
    for (const c of runtime.chunks) add(c)
    const listener = (kind: string, payload?: ChunkMsg) => {
      if (kind === 'chunk' && payload) add(payload)
    }
    runtime.listeners.add(listener)
    return () => {
      runtime.listeners.delete(listener)
      for (const m of [...g.children] as THREE.Mesh[]) {
        m.geometry.dispose()
        g.remove(m)
      }
      map.clear()
    }
  }, [mats])

  useEffect(() => {
    runtime.shadowDirty = true
  }, [visible])

  const frame = useRef(0)
  useFrame(() => {
    if (frame.current++ % 5 !== 0) return
    const exploring = useApp.getState().mode === 'explore'
    const fineR = perf ? 300 : 620
    for (const s of slots.current.values()) {
      const d = Math.max(0, Math.hypot(s.x - rig.focus.x, s.z - rig.focus.z) - 90)
      const reach = exploring ? d : Math.max(d, rig.viewHeight * 0.75)
      // hysteresis so chunks do not flicker at the threshold
      const want = s.useFine ? reach < fineR * 1.12 : reach < fineR
      const fine = want && !!s.fine
      if (fine !== s.useFine) {
        s.useFine = fine
        runtime.shadowDirty = true
      }
      if (s.fine) s.fine.visible = fine
      if (s.coarse) s.coarse.visible = !fine
    }
  })

  return <group ref={group} visible={visible} />
}
