import { useMemo } from 'react'
import { SearchIndex } from '../features/search/search'
import { runtime } from './runtime'
import { useApp } from './store'

/** The world catalogue (features, zones, stats) once world.json + features.json have arrived. */
export function useWorld() {
  const ready = useApp((s) => s.catalogReady)
  return ready ? runtime.world : null
}

export function useSearchIndex() {
  const world = useWorld()
  return useMemo(() => (world ? new SearchIndex(world.features, world.meta.zones) : null), [world])
}

export function resolveRef(ref: string) {
  const w = runtime.world
  if (!w) return undefined
  return w.byKey.get(ref) ?? w.features.find((f) => f.name === ref) ?? w.features.find((f) => f.name.startsWith(ref))
}
