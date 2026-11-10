/**
 * Camera rig state shared by every camera mode. Orbit modes (isometric = orthographic,
 * free orbit = perspective) share one pose (target, azimuth, polar angle, distance), so switching
 * projection keeps the same framing. Explorer mode has its own position / yaw / pitch.
 */
import * as THREE from 'three'

export const FOV_ORBIT = 32
export const FOV_EXPLORE = 68
export const POL_MIN = 0.06
export const POL_MAX = 1.52
export const DIST_MIN = 14
export const DIST_MAX = 5200

export interface OrbitPose {
  tx: number
  ty: number
  tz: number
  /** Azimuth around +Y (0 = camera south of the target looking north, i.e. north-up). */
  az: number
  /** Polar angle from straight down (0) to horizontal (π/2). */
  pol: number
  dist: number
}

export interface Tween {
  t: number
  dur: number
  from: OrbitPose
  to: OrbitPose
  /** Extra distance at the midpoint for long hops. */
  lift: number
}
export interface ExploreTween {
  t: number
  dur: number
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromYaw: number
  toYaw: number
  fromPitch: number
  toPitch: number
  thenWalk: boolean
}

export const HOME_AZ = 1.02
export const HOME_POL = 0.93

export function homePose(aspect: number): OrbitPose {
  const viewHeight = Math.max(1750, 2500 / Math.max(0.4, aspect))
  return { tx: 30, ty: 40, tz: 20, az: HOME_AZ, pol: HOME_POL, dist: viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(FOV_ORBIT / 2))) }
}

export const rig = {
  cur: homePose(1.6),
  goal: homePose(1.6),
  tween: null as Tween | null,
  etween: null as ExploreTween | null,
  pos: new THREE.Vector3(0, 200, 400),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.2,
  jump: 0,
  airborne: false,
  /** Touch joystick input (−1…1) and vertical buttons. */
  joy: { x: 0, y: 0 },
  vert: 0,
  /** World units visible vertically at the focus — drives LOD, labels and shadows. */
  viewHeight: 2000,
  focus: new THREE.Vector3(),
  /** Compass heading of the view direction in degrees (0 = north). */
  heading: 0,
  lastInput: 0,
  initialised: false,
}

export const clonePose = (p: OrbitPose): OrbitPose => ({ ...p })
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function orbitOffset(p: OrbitPose, out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(p.pol)
  return out.set(s * Math.sin(p.az), Math.cos(p.pol), s * Math.cos(p.az))
}
