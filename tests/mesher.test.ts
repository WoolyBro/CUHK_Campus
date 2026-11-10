import { describe, expect, it } from 'vitest'
import { DIR, QuadSink, Volume, greedy2D, meshTerrainChunk, meshVolume } from '../src/lib/voxel/mesher'
import { M } from '../src/lib/voxel/palette'

describe('greedy meshing', () => {
  it('merges a uniform mask into one rectangle', () => {
    const out: number[][] = []
    greedy2D(new Uint8Array(16).fill(3), 4, 4, (u, v, du, dv, val) => out.push([u, v, du, dv, val]))
    expect(out).toEqual([[0, 0, 4, 4, 3]])
  })
  it('splits by value and skips empty cells', () => {
    const out: number[][] = []
    greedy2D(Uint8Array.from([1, 1, 0, 2, 1, 1, 0, 2]), 4, 2, (u, v, du, dv, val) => out.push([u, v, du, dv, val]))
    expect(out).toEqual([
      [0, 0, 2, 2, 1],
      [3, 0, 1, 2, 2],
    ])
  })

  it('meshes a flat terrain chunk as one top quad plus the four slab walls', () => {
    const w = 8,
      d = 8
    const sink = meshTerrainChunk({ w, d, height: new Uint16Array(w * d).fill(12), surface: new Uint8Array(w * d).fill(M.GRASS) }, 0, 0, 8)
    const tops: number[] = [],
      sides: number[] = []
    for (let q = 0; q < sink.count; q++) (sink.quad[q * 4 + 2] === DIR.PY ? tops : sides).push(q)
    expect(tops).toHaveLength(1)
    expect([sink.quad[tops[0] * 4], sink.quad[tops[0] * 4 + 1], sink.origin[tops[0] * 3 + 1]]).toEqual([8, 8, 12])
    // grass fringe, dirt, stone bands on each of the 4 edges
    expect(sides).toHaveLength(12)
    const area = sides.reduce((a, q) => a + sink.quad[q * 4] * sink.quad[q * 4 + 1], 0)
    expect(area).toBe(4 * 8 * 12)
  })

  it('emits a step face where neighbouring columns differ in height', () => {
    const w = 4,
      d = 1
    const sink = meshTerrainChunk({ w, d, height: Uint16Array.from([5, 5, 7, 7]), surface: new Uint8Array(4).fill(M.GRASS) }, 0, 0, 4)
    let stepArea = 0
    for (let q = 0; q < sink.count; q++) if (sink.quad[q * 4 + 2] === DIR.NX && sink.origin[q * 3] === 2) stepArea += sink.quad[q * 4] * sink.quad[q * 4 + 1]
    expect(stepArea).toBe(2)
  })

  it('meshes a single voxel as six faces and hides faces buried in terrain', () => {
    const vol = new Volume(10, 20, 10, 1, 1, 1)
    vol.set(10, 20, 10, M.WALL_WHITE)
    const free = new QuadSink(16, true)
    meshVolume(vol, free, 7, () => 0)
    expect(free.count).toBe(6)
    expect(Array.from(free.feature!.slice(0, 6))).toEqual([7, 7, 7, 7, 7, 7])
    const buried = new QuadSink(16, true)
    meshVolume(vol, buried, 7, () => 30)
    expect(buried.count).toBe(0)
  })
})
