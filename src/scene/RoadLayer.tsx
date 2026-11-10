/**
 * Roads are rasterised into the terrain surface at build time (asphalt, kerbs, rail ballast,
 * car parks). This layer owns their visibility: when switched off the road blocks are drawn as
 * grass by remapping their texture layer in the shared shader uniforms — no re-meshing needed.
 */
import { useEffect } from 'react'
import { runtime } from '../app/runtime'
import { useApp } from '../app/store'
import { M, ROAD_MATERIALS } from '../lib/voxel/palette'

export function RoadLayer() {
  const on = useApp((s) => s.layers.roads)
  useEffect(() => {
    for (const m of ROAD_MATERIALS) runtime.uniforms.uSwap.value[m] = on ? m : M.GRASS
  }, [on])
  return null
}
