/**
 * Small original voxel models (trees, lamps, shelters…) built in code as merged box geometry.
 * They are drawn with GPU instancing; trees have three levels of detail.
 */
import * as THREE from 'three'
import { greedy2D } from './mesher'
import { M } from './palette'
import { PROP, TREE } from './world-format'

/** Layer value meaning "use the per-instance leaf layer" (see createModelMaterial). */
export const INSTANCE_LAYER = -1

class Builder {
  pos: number[] = []
  nrm: number[] = []
  uv: number[] = []
  layer: number[] = []
  idx: number[] = []

  private face(p: number[][], n: number[], su: number, sv: number, mat: number) {
    const b = this.pos.length / 3
    const uvs = [
      [0, 0],
      [su, 0],
      [su, sv],
      [0, sv],
    ]
    for (let k = 0; k < 4; k++) {
      this.pos.push(...p[k])
      this.nrm.push(...n)
      this.uv.push(uvs[k][0], uvs[k][1])
      this.layer.push(mat)
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }

  /** Axis-aligned box; `skip` is a string of faces to omit: any of "x X y Y z Z" (lower = min side). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: number, skip = '', capMat = mat): this {
    const dx = x1 - x0,
      dy = y1 - y0,
      dz = z1 - z0
    if (!skip.includes('X'))
      this.face(
        [
          [x1, y0, z1],
          [x1, y0, z0],
          [x1, y1, z0],
          [x1, y1, z1],
        ],
        [1, 0, 0],
        dz,
        dy,
        mat,
      )
    if (!skip.includes('x'))
      this.face(
        [
          [x0, y0, z0],
          [x0, y0, z1],
          [x0, y1, z1],
          [x0, y1, z0],
        ],
        [-1, 0, 0],
        dz,
        dy,
        mat,
      )
    if (!skip.includes('Y'))
      this.face(
        [
          [x0, y1, z1],
          [x1, y1, z1],
          [x1, y1, z0],
          [x0, y1, z0],
        ],
        [0, 1, 0],
        dx,
        dz,
        capMat,
      )
    if (!skip.includes('y'))
      this.face(
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
        ],
        [0, -1, 0],
        dx,
        dz,
        capMat,
      )
    if (!skip.includes('Z'))
      this.face(
        [
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
        [0, 0, 1],
        dx,
        dy,
        mat,
      )
    if (!skip.includes('z'))
      this.face(
        [
          [x1, y0, z0],
          [x0, y0, z0],
          [x0, y1, z0],
          [x1, y1, z0],
        ],
        [0, 0, -1],
        dx,
        dy,
        mat,
      )
    return this
  }

  /**
   * Unit voxels keyed "x,y,z" → material. Hidden faces are culled and coplanar faces of the same
   * material are greedy-merged. Voxel (0,0,0) is centred on the origin in X/Z.
   */
  voxels(v: Map<string, number>): this {
    let x0 = Infinity,
      y0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      z1 = -Infinity
    for (const k of v.keys()) {
      const [x, y, z] = k.split(',').map(Number)
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
      z0 = Math.min(z0, z)
      z1 = Math.max(z1, z)
    }
    const nx = x1 - x0 + 1,
      ny = y1 - y0 + 1,
      nz = z1 - z0 + 1
    const get = (x: number, y: number, z: number) => v.get(`${x},${y},${z}`) ?? 0
    for (const s of [1, -1]) {
      for (let x = x0; x <= x1; x++) {
        const mask = new Uint8Array(nz * ny)
        for (let y = 0; y < ny; y++)
          for (let z = 0; z < nz; z++) {
            const m = get(x, y0 + y, z0 + z)
            if (m && !get(x + s, y0 + y, z0 + z)) mask[y * nz + z] = m
          }
        const px = x + s * 0.5
        greedy2D(mask, nz, ny, (u, w, du, dv, m) => this.box(px, y0 + w, z0 + u - 0.5, px, y0 + w + dv, z0 + u + du - 0.5, m, s > 0 ? 'xyYzZ' : 'XyYzZ'))
      }
      for (let y = y0; y <= y1; y++) {
        const mask = new Uint8Array(nx * nz)
        for (let z = 0; z < nz; z++)
          for (let x = 0; x < nx; x++) {
            const m = get(x0 + x, y, z0 + z)
            if (m && !get(x0 + x, y + s, z0 + z)) mask[z * nx + x] = m
          }
        const py = y + (s > 0 ? 1 : 0)
        greedy2D(mask, nx, nz, (u, w, du, dv, m) => this.box(x0 + u - 0.5, py, z0 + w - 0.5, x0 + u + du - 0.5, py, z0 + w + dv - 0.5, m, s > 0 ? 'xXyzZ' : 'xXYzZ'))
      }
      for (let z = z0; z <= z1; z++) {
        const mask = new Uint8Array(nx * ny)
        for (let y = 0; y < ny; y++)
          for (let x = 0; x < nx; x++) {
            const m = get(x0 + x, y0 + y, z)
            if (m && !get(x0 + x, y0 + y, z + s)) mask[y * nx + x] = m
          }
        const pz = z + s * 0.5
        greedy2D(mask, nx, ny, (u, w, du, dv, m) => this.box(x0 + u - 0.5, y0 + w, pz, x0 + u + du - 0.5, y0 + w + dv, pz, m, s > 0 ? 'xXyYz' : 'xXyYZ'))
      }
    }
    return this
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3))
    g.setAttribute('aUv', new THREE.Float32BufferAttribute(this.uv, 2))
    g.setAttribute('aLayer', new THREE.Float32BufferAttribute(this.layer, 1))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function blob(v: Map<string, number>, cy: number, rx: number, ry: number, mat: number, rnd: () => number, flat = 0.15) {
  const R = Math.ceil(rx),
    RY = Math.ceil(ry)
  for (let y = -RY; y <= RY; y++)
    for (let z = -R; z <= R; z++)
      for (let x = -R; x <= R; x++) {
        const d = (x * x + z * z) / (rx * rx) + (y * y) / (ry * ry)
        if (d > 1 || (d > 0.72 && rnd() < flat)) continue
        v.set(`${x},${Math.round(cy) + y},${z}`, mat)
      }
}

export interface TreeSpec {
  /** Nominal model height in blocks (instances are scaled to their own height). */
  height: number
  leaf: number
  /** Mid/far canopy proportions relative to height. */
  width: number
}

export const TREE_SPECS: Record<number, TreeSpec> = {
  [TREE.BROADLEAF]: { height: 10, leaf: M.LEAVES_A, width: 6.2 },
  [TREE.TALL]: { height: 13, leaf: M.LEAVES_A, width: 5.4 },
  [TREE.BANYAN]: { height: 9, leaf: M.LEAVES_B, width: 8.4 },
  [TREE.SMALL]: { height: 6, leaf: M.LEAVES_C, width: 4.2 },
  [TREE.PALM]: { height: 9, leaf: M.PALM_LEAF, width: 5 },
  [TREE.PINK]: { height: 8, leaf: M.LEAVES_PINK, width: 5.6 },
  [TREE.RED]: { height: 9, leaf: M.LEAVES_RED, width: 6 },
  [TREE.YELLOW]: { height: 9, leaf: M.LEAVES_YELLOW, width: 5.6 },
  [TREE.CONIFER]: { height: 12, leaf: M.LEAVES_B, width: 4.4 },
}

/** Detailed (near) tree for each type. */
export function treeNearGeometry(type: number): THREE.BufferGeometry {
  const rnd = seeded(type * 97 + 5)
  const v = new Map<string, number>()
  const trunk = (h: number, wide = false) => {
    for (let y = 0; y < h; y++) {
      v.set(`0,${y},0`, M.WOOD_LOG)
      if (wide) {
        v.set(`1,${y},0`, M.WOOD_LOG)
        v.set(`0,${y},1`, M.WOOD_LOG)
        v.set(`1,${y},1`, M.WOOD_LOG)
      }
    }
  }
  const spec = TREE_SPECS[type]
  switch (type) {
    case TREE.TALL:
      trunk(9)
      blob(v, 9, 2.7, 3.6, spec.leaf, rnd)
      break
    case TREE.BANYAN:
      trunk(5, true)
      blob(v, 6, 4.3, 2.6, spec.leaf, rnd, 0.2)
      v.set('2,3,0', M.WOOD_LOG)
      v.set('-1,4,1', M.WOOD_LOG)
      break
    case TREE.SMALL:
      trunk(3)
      blob(v, 4, 2.1, 1.9, spec.leaf, rnd)
      break
    case TREE.PALM: {
      trunk(8)
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        v.set(`${dx},8,${dz}`, spec.leaf)
        v.set(`${dx * 2},8,${dz * 2}`, spec.leaf)
        v.set(`${dx * 3},7,${dz * 3}`, spec.leaf)
      }
      for (const [dx, dz] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        v.set(`${dx},8,${dz}`, spec.leaf)
        v.set(`${dx * 2},7,${dz * 2}`, spec.leaf)
      }
      v.set('0,8,0', spec.leaf)
      break
    }
    case TREE.CONIFER: {
      trunk(11)
      const radii = [0, 0, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0]
      radii.forEach((r, y) => {
        for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) if (r && Math.abs(x) + Math.abs(z) <= r + 1 && (x || z)) v.set(`${x},${y},${z}`, spec.leaf)
      })
      v.set('0,11,0', spec.leaf)
      break
    }
    case TREE.PINK:
      trunk(4)
      blob(v, 5, 2.8, 2.3, spec.leaf, rnd)
      break
    case TREE.RED:
      trunk(5)
      blob(v, 6, 3.1, 2.2, spec.leaf, rnd, 0.22)
      break
    case TREE.YELLOW:
      trunk(5)
      blob(v, 6, 2.8, 2.6, spec.leaf, rnd)
      break
    default:
      trunk(5)
      blob(v, 7, 3.2, 2.7, spec.leaf, rnd)
  }
  return new Builder().voxels(v).build()
}

/** Shared mid-distance tree: trunk + two canopy boxes. Unit height 1; canopy uses the per-instance leaf layer. */
export function treeMidGeometry(): THREE.BufferGeometry {
  return new Builder().box(-0.05, 0, -0.05, 0.05, 0.5, 0.05, M.WOOD_LOG, 'yY').box(-0.5, 0.42, -0.5, 0.5, 0.82, 0.5, INSTANCE_LAYER).box(-0.3, 0.82, -0.3, 0.3, 1, 0.3, INSTANCE_LAYER, 'y').build()
}

/** Shared far tree: one canopy box, no underside. */
export function treeFarGeometry(): THREE.BufferGeometry {
  return new Builder().box(-0.45, 0.35, -0.45, 0.45, 0.95, 0.45, INSTANCE_LAYER, 'y').build()
}

export function propGeometry(type: number): THREE.BufferGeometry {
  const b = new Builder()
  switch (type) {
    case PROP.LAMP:
      b.box(-0.15, 0, -0.15, 0.15, 5, 0.15, M.METAL_DARK, 'y').box(-0.15, 4.7, -0.15, 1.1, 5, 0.15, M.METAL_DARK).box(0.55, 4.35, -0.3, 1.25, 4.7, 0.3, M.LAMP_HEAD)
      break
    case PROP.BUS_SHELTER:
      b.box(-2, 0, -0.9, -1.8, 2.6, -0.7, M.METAL_DARK, 'y')
        .box(1.8, 0, -0.9, 2, 2.6, -0.7, M.METAL_DARK, 'y')
        .box(-2.3, 2.6, -1.1, 2.3, 2.85, 0.9, M.CANOPY)
        .box(-1.8, 0.4, -0.85, 1.8, 2.3, -0.75, M.GLASS_BLUE)
        .box(-1.4, 0.45, -0.6, 1.4, 0.6, -0.1, M.WOOD_PLANK)
        .box(2.5, 0, 0.2, 2.65, 3, 0.35, M.METAL_DARK, 'y')
        .box(2.3, 2.3, 0.15, 2.85, 3, 0.4, M.SIGN_BLUE)
      break
    case PROP.BENCH:
      b.box(-1, 0.45, -0.3, 1, 0.6, 0.3, M.WOOD_PLANK)
        .box(-1, 0.6, 0.2, 1, 1.1, 0.3, M.WOOD_PLANK)
        .box(-0.9, 0, -0.25, -0.75, 0.45, 0.25, M.METAL_DARK, 'y')
        .box(0.75, 0, -0.25, 0.9, 0.45, 0.25, M.METAL_DARK, 'y')
      break
    case PROP.FENCE:
      b.box(-0.1, 0, -0.1, 0.1, 1.3, 0.1, M.METAL_DARK, 'y').box(-1.25, 1.05, -0.05, 1.25, 1.15, 0.05, M.METAL_DARK).box(-1.25, 0.5, -0.05, 1.25, 0.6, 0.05, M.METAL_DARK)
      break
    case PROP.BOLLARD:
      b.box(-0.15, 0, -0.15, 0.15, 0.9, 0.15, M.CONCRETE, 'y')
      break
    case PROP.SIGN:
      b.box(-0.08, 0, -0.08, 0.08, 2.4, 0.08, M.METAL_DARK, 'y').box(-0.6, 1.6, -0.1, 0.6, 2.4, 0.1, M.SIGN_BLUE)
      break
    case PROP.SHRUB:
      b.box(-0.8, 0, -0.8, 0.8, 1, 0.8, M.HEDGE, 'y').box(-0.45, 1, -0.45, 0.45, 1.5, 0.45, M.LEAVES_A, 'y')
      break
    case PROP.FLOWER_SHRUB:
      b.box(-0.7, 0, -0.7, 0.7, 0.9, 0.7, M.LEAVES_PINK, 'y').box(-0.35, 0.9, -0.35, 0.35, 1.3, 0.35, M.LEAVES_YELLOW, 'y')
      break
    default:
      b.box(-0.6, 0, -0.5, 0.6, 0.8, 0.5, M.ROCK, 'y')
  }
  return b.build()
}

/** Blocky cloud puff (unit box, textured as white slab). */
export function cloudGeometry(): THREE.BufferGeometry {
  return new Builder().box(-0.5, 0, -0.5, 0.5, 1, 0.5, M.WALL_WHITE).build()
}
