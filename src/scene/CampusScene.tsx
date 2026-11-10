/** Scene root: one connected, geographically aligned block world. */
import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { paintFeatureOverlay, runtime } from '../app/runtime'
import { useApp } from '../app/store'
import { ZONE_COLOURS } from '../lib/voxel/palette'
import { BuildingLayer } from './BuildingLayer'
import { CameraController } from './CameraController'
import { Lighting } from './Lighting'
import { PathLayer } from './PathLayer'
import { PoiLayer } from './PoiLayer'
import { RoadLayer } from './RoadLayer'
import { rig } from './rig'
import { TerrainLayer } from './TerrainLayer'
import { VegetationLayer } from './VegetationLayer'

/** Confidence classes: colour + pattern code (solid / stripes / checker) so they never rely on colour alone. */
export const CONFIDENCE_STYLE = {
  verified: { colour: '#2f9e6b', code: 0.34, label: 'Verified geometry', pattern: 'solid' },
  inferred: { colour: '#e0a526', code: 0.67, label: 'Inferred geometry', pattern: 'diagonal stripes' },
  approximate: { colour: '#d4553f', code: 1.0, label: 'Stylised / approximate', pattern: 'checker' },
} as const

function Overlays() {
  const zones = useApp((s) => s.layers.zones)
  const confidence = useApp((s) => s.layers.confidence)
  const loaded = useApp((s) => s.loadProgress > 0)
  useEffect(() => {
    if (!runtime.world) return
    if (confidence) paintFeatureOverlay((f) => (f.kind === 'building' ? [CONFIDENCE_STYLE[f.geom].colour, CONFIDENCE_STYLE[f.geom].code] : null))
    else if (zones) paintFeatureOverlay((f) => (f.kind === 'building' && f.zone ? [ZONE_COLOURS[f.zone], 0.34] : null))
  }, [zones, confidence, loaded])
  useFrame((_, dt) => {
    const u = runtime.uniforms
    const k = 1 - Math.exp(-dt * 8)
    u.uOverlayMix.value += ((confidence ? 1 : zones ? 0.8 : 0) - u.uOverlayMix.value) * k
    u.uZoneMix.value += ((zones && !confidence ? 1 : 0) - u.uZoneMix.value) * k
  })
  return null
}

export function CampusScene() {
  const { invalidate, gl, get } = useThree()
  useEffect(() => {
    runtime.invalidate = invalidate
    // debugging / end-to-end test hook (read-only handles; no behaviour depends on it)
    ;(window as unknown as { __cuhk?: unknown }).__cuhk = { runtime, rig, store: useApp, gl, three: get }
    return () => {
      runtime.invalidate = () => {}
    }
  }, [invalidate, gl, get])
  return (
    <>
      <CameraController />
      <Lighting />
      <TerrainLayer />
      <RoadLayer />
      <PathLayer />
      <BuildingLayer />
      <VegetationLayer />
      <PoiLayer />
      <Overlays />
    </>
  )
}
