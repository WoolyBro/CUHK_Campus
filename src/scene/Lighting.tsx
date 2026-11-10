/**
 * Sun, sky, fog, clouds and shadows. Day / sunset / night presets blend smoothly.
 * The world is static, so the shadow map is only re-rendered when something relevant changes
 * (new chunks, a layer toggle, the sun moving, or the camera focus leaving the covered area).
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { runtime } from '../app/runtime'
import { useApp, type TimeOfDay } from '../app/store'
import { createModelMaterial } from '../lib/voxel/materials'
import { cloudGeometry } from '../lib/voxel/models'
import { rig } from './rig'

interface Preset {
  top: string
  horizon: string
  sun: string
  sunI: number
  hemiSky: string
  hemiGround: string
  hemiI: number
  az: number
  el: number
  night: number
}
const PRESETS: Record<TimeOfDay, Preset> = {
  day: { top: '#5aa6ea', horizon: '#c4e2f6', sun: '#fff3dc', sunI: 2.5, hemiSky: '#d6e9ff', hemiGround: '#8a9477', hemiI: 1.25, az: 2.35, el: 0.92, night: 0 },
  sunset: { top: '#4a5e9e', horizon: '#f7ae78', sun: '#ffb37a', sunI: 2.1, hemiSky: '#e9c9c4', hemiGround: '#5e554c', hemiI: 0.85, az: 4.45, el: 0.3, night: 0.35 },
  night: { top: '#0a1230', horizon: '#1d2d54', sun: '#9fb9ff', sunI: 0.5, hemiSky: '#52699c', hemiGround: '#1b2130', hemiI: 0.42, az: 3.6, el: 0.9, night: 1 },
}

const SKY_VERT = /* glsl */ `varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uNight;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float t = pow(clamp(d.y * 1.15 + 0.08, 0.0, 1.0), 0.6);
  vec3 col = mix(uHorizon, uTop, t);
  // square "voxel" sun / moon
  vec3 s = normalize(uSunDir);
  vec3 r = normalize(cross(s, vec3(0.0, 1.0, 0.0))); vec3 u = cross(r, s);
  vec2 q = vec2(dot(d, r), dot(d, u));
  float disc = step(max(abs(q.x), abs(q.y)), 0.035) * step(0.0, dot(d, s));
  col = mix(col, uSunCol * 1.15, disc);
  col += uSunCol * 0.18 * pow(max(dot(d, s), 0.0), 24.0);
  // blocky stars at night
  vec2 g = floor(vec2(atan(d.z, d.x) * 90.0, d.y * 140.0));
  col += vec3(0.9) * step(0.9975, h21(g)) * uNight * step(0.05, d.y);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function Lighting() {
  const { gl, scene } = useThree()
  const time = useApp((s) => s.time)
  const perf = useApp((s) => s.perf)
  const mode = useApp((s) => s.mode)
  const sun = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const sky = useRef<THREE.Mesh>(null!)
  const clouds = useRef<THREE.InstancedMesh>(null!)
  const cur = useRef({ ...PRESETS.day })
  const colours = useRef({
    top: new THREE.Color(PRESETS.day.top),
    horizon: new THREE.Color(PRESETS.day.horizon),
    sun: new THREE.Color(PRESETS.day.sun),
    hs: new THREE.Color(PRESETS.day.hemiSky),
    hg: new THREE.Color(PRESETS.day.hemiGround),
  })
  const shadowState = useRef({ x: 1e9, z: 1e9, r: 0, t: 0 })
  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 1, 0) },
          uSunCol: { value: new THREE.Color() },
          uNight: { value: 0 },
        },
      }),
    [],
  )
  const cloudRes = useMemo(() => ({ geo: cloudGeometry(), mat: createModelMaterial(runtime.uniforms) }), [])

  useEffect(() => {
    scene.fog = new THREE.Fog('#c4e2f6', 2000, 9000)
    scene.background = new THREE.Color('#9fd0f2')
    gl.shadowMap.type = THREE.PCFShadowMap
    gl.shadowMap.autoUpdate = false
    return () => {
      scene.fog = null
    }
  }, [gl, scene])

  useEffect(() => {
    gl.shadowMap.enabled = !perf
    sun.current.castShadow = !perf
    runtime.shadowDirty = true
    // materials must recompile when shadows are switched on/off
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m) m.needsUpdate = true
    })
  }, [perf, gl, scene])

  useEffect(() => {
    const m = clouds.current
    const mat = new THREE.Matrix4(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3(),
      q = new THREE.Quaternion()
    let seed = 7
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < m.count; i++) {
      p.set((rnd() - 0.5) * 9000, 430 + rnd() * 160, (rnd() - 0.5) * 9000)
      s.set(90 + rnd() * 220, 14 + rnd() * 10, 60 + rnd() * 160)
      m.setMatrixAt(i, mat.compose(p, q, s))
    }
    m.instanceMatrix.needsUpdate = true
  }, [])

  useFrame((state, dt) => {
    const target = PRESETS[time]
    const c = cur.current,
      col = colours.current
    const k = 1 - Math.exp(-Math.min(0.1, dt) * 2.4)
    const moving = Math.abs(c.el - target.el) + Math.abs(c.night - target.night) + Math.abs(c.sunI - target.sunI) > 0.004
    c.sunI += (target.sunI - c.sunI) * k
    c.hemiI += (target.hemiI - c.hemiI) * k
    c.az += (target.az - c.az) * k
    c.el += (target.el - c.el) * k
    c.night += (target.night - c.night) * k
    col.top.lerp(new THREE.Color(target.top), k)
    col.horizon.lerp(new THREE.Color(target.horizon), k)
    col.sun.lerp(new THREE.Color(target.sun), k)
    col.hs.lerp(new THREE.Color(target.hemiSky), k)
    col.hg.lerp(new THREE.Color(target.hemiGround), k)

    const dir = new THREE.Vector3(Math.cos(c.el) * Math.sin(c.az), Math.sin(c.el), -Math.cos(c.el) * Math.cos(c.az))
    sun.current.color.copy(col.sun)
    sun.current.intensity = c.sunI
    hemi.current.color.copy(col.hs)
    hemi.current.groundColor.copy(col.hg)
    hemi.current.intensity = c.hemiI
    runtime.uniforms.uNight.value = c.night
    runtime.uniforms.uTime.value = state.clock.elapsedTime
    const iso = mode === 'iso'
    ;(scene.fog as THREE.Fog).color.copy(col.horizon)
    ;(scene.background as THREE.Color).copy(col.horizon).lerp(col.top, iso ? 0.55 : 0.2)
    sky.current.visible = !iso
    sky.current.position.copy(state.camera.position)
    skyMat.uniforms.uTop.value.copy(col.top)
    skyMat.uniforms.uHorizon.value.copy(col.horizon)
    skyMat.uniforms.uSunDir.value.copy(dir)
    skyMat.uniforms.uSunCol.value.copy(col.sun)
    skyMat.uniforms.uNight.value = c.night
    clouds.current.visible = !iso && !perf
    clouds.current.position.x = ((state.clock.elapsedTime * 6) % 1500) - 750

    // shadow frustum follows the focus in coarse steps and scales with zoom
    if (!perf) {
      const ss = shadowState.current
      const R = Math.min(1650, Math.max(240, rig.viewHeight * 1.05))
      const need = runtime.shadowDirty || moving || Math.hypot(rig.focus.x - ss.x, rig.focus.z - ss.z) > ss.r * 0.22 || Math.abs(R - ss.r) > ss.r * 0.22
      if (need && state.clock.elapsedTime - ss.t > 0.12) {
        const cam = sun.current.shadow.camera
        const texel = (R * 2) / sun.current.shadow.mapSize.x
        const fx = Math.round(rig.focus.x / texel / 16) * texel * 16,
          fz = Math.round(rig.focus.z / texel / 16) * texel * 16
        sun.current.target.position.set(fx, 40, fz)
        sun.current.position.set(fx + dir.x * 3000, 40 + dir.y * 3000, fz + dir.z * 3000)
        sun.current.target.updateMatrixWorld()
        cam.left = -R
        cam.right = R
        cam.top = R
        cam.bottom = -R
        cam.near = 200
        cam.far = 6000
        cam.updateProjectionMatrix()
        sun.current.shadow.normalBias = Math.max(0.35, texel * 1.6)
        gl.shadowMap.needsUpdate = true
        runtime.shadowDirty = false
        Object.assign(ss, { x: rig.focus.x, z: rig.focus.z, r: R, t: state.clock.elapsedTime })
      }
    } else {
      sun.current.position.copy(dir).multiplyScalar(3000)
      sun.current.target.position.set(0, 0, 0)
      sun.current.target.updateMatrixWorld()
    }
  })

  return (
    <>
      <hemisphereLight ref={hemi} intensity={1.2} />
      <directionalLight ref={sun} intensity={2.5} castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0004} />
      <mesh ref={sky} material={skyMat} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[60, 24, 16]} />
      </mesh>
      <instancedMesh ref={clouds} args={[cloudRes.geo, cloudRes.mat, 46]} frustumCulled={false} raycast={() => {}} />
    </>
  )
}
