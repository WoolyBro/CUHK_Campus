/** Tiny command bus between the UI and the camera controller. */
import type { FeatureRecord } from '../lib/voxel/world-format'

export type CameraCommand =
  | { type: 'flyTo'; feature: FeatureRecord }
  | { type: 'flyToPoint'; x: number; z: number; dist?: number }
  | { type: 'reset' }
  | { type: 'north' }
  | { type: 'street' }
  | { type: 'zoom'; factor: number }
  | { type: 'rotate'; delta: number }
  | { type: 'cancel' }

type Fn = (c: CameraCommand) => void
const listeners = new Set<Fn>()
export const bus = {
  on(fn: Fn) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  emit(c: CameraCommand) {
    for (const l of listeners) l(c)
  },
}
