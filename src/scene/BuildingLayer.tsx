/** Buildings, bridges, covered walkways and other block structures (pre-meshed at build time). */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { runtime } from '../app/runtime'
import { useApp } from '../app/store'
import { createQuadDepthMaterial, createQuadGeometry, createQuadMaterial } from '../lib/voxel/materials'

export function BuildingLayer() {
  const group = useRef<THREE.Group>(null!)
  const visible = useApp((s) => s.layers.buildings)
  const mats = useMemo(() => ({ main: createQuadMaterial(runtime.uniforms, true), depth: createQuadDepthMaterial() }), [])

  useEffect(() => {
    const g = group.current
    const build = () => {
      const w = runtime.world,
        s = runtime.structures
      if (!w || !s || g.children.length) return
      for (const grp of w.meta.structures.groups) {
        const a = grp.start,
          b = grp.start + grp.count
        const geo = createQuadGeometry(runtime.quadBase, s.origin.subarray(a * 3, b * 3), s.quad.subarray(a * 4, b * 4), s.feature.subarray(a, b), grp.count)
        geo.boundingBox = new THREE.Box3(new THREE.Vector3(...grp.min), new THREE.Vector3(...grp.max))
        geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere())
        const mesh = new THREE.Mesh(geo, mats.main)
        mesh.customDepthMaterial = mats.depth
        mesh.position.set(w.minX, -w.bias, w.minZ)
        mesh.matrixAutoUpdate = false
        mesh.updateMatrix()
        mesh.castShadow = mesh.receiveShadow = true
        mesh.raycast = () => {}
        g.add(mesh)
      }
    }
    build()
    const listener = (kind: string) => {
      if (kind === 'structures') build()
    }
    runtime.listeners.add(listener)
    return () => {
      runtime.listeners.delete(listener)
      for (const m of [...g.children] as THREE.Mesh[]) {
        m.geometry.dispose()
        g.remove(m)
      }
    }
  }, [mats])

  useEffect(() => {
    runtime.shadowDirty = true
  }, [visible])
  return <group ref={group} visible={visible} />
}
