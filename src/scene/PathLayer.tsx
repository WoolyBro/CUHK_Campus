/**
 * Pedestrian network: pavements, plazas, woodland paths and stairs, baked into the terrain
 * surface like roads. Toggling the layer remaps those blocks to grass in the shader.
 */
import { useEffect } from 'react'
import { runtime } from '../app/runtime'
import { useApp } from '../app/store'
import { M, PATH_MATERIALS } from '../lib/voxel/palette'

export function PathLayer() {
  const on = useApp((s) => s.layers.paths)
  useEffect(() => {
    for (const m of PATH_MATERIALS) runtime.uniforms.uSwap.value[m] = on ? m : M.GRASS
  }, [on])
  return null
}
