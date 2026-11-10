/**
 * GPU materials for the block world.
 *
 *  - "quad" materials draw terrain and structures: every instance is one merged rectangle of block
 *    faces (see mesher.ts), expanded in the vertex shader from a unit quad.
 *  - "model" materials draw instanced voxel props (trees, lamps…) built as ordinary geometry.
 *
 * Both sample one texture array of original procedural 16×16 tiles and share uniforms for
 * night lighting, layer toggles, selection highlight and the zone / confidence overlays.
 * They are three.js Lambert materials patched in onBeforeCompile so lights, shadows and fog
 * keep working.
 */
import * as THREE from 'three'
import { EMISSIVE, MATERIAL_COUNT, ZONE_COLOURS } from './palette'
import { TILE, buildAtlasData } from './textures'

export interface VoxelUniforms {
  uAtlas: { value: THREE.DataArrayTexture }
  uSwap: { value: Float32Array }
  uEmit: { value: Float32Array }
  uNight: { value: number }
  uTime: { value: number }
  uSelected: { value: number }
  uHovered: { value: number }
  uFeatureTex: { value: THREE.DataTexture }
  uOverlayMix: { value: number }
  uZoneTex: { value: THREE.DataTexture }
  uZoneMix: { value: number }
  uZoneCol: { value: THREE.Color[] }
  uWorldMin: { value: THREE.Vector2 }
  uWorldSize: { value: THREE.Vector2 }
}

export const FEATURE_TEX_WIDTH = 1024

export function createAtlasTexture(): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(buildAtlasData(), TILE, TILE, MATERIAL_COUNT)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestMipmapLinearFilter
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

export function createUniforms(): VoxelUniforms {
  const swap = new Float32Array(MATERIAL_COUNT)
  const emit = new Float32Array(MATERIAL_COUNT)
  for (let i = 0; i < MATERIAL_COUNT; i++) {
    swap[i] = i
    emit[i] = EMISSIVE[i] ?? 0
  }
  const blank = new THREE.DataTexture(new Uint8Array(FEATURE_TEX_WIDTH * 4), FEATURE_TEX_WIDTH, 1)
  blank.needsUpdate = true
  const zone = new THREE.DataTexture(new Uint8Array(4), 1, 1)
  zone.needsUpdate = true
  return {
    uAtlas: { value: createAtlasTexture() },
    uSwap: { value: swap },
    uEmit: { value: emit },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uSelected: { value: -1 },
    uHovered: { value: -1 },
    uFeatureTex: { value: blank },
    uOverlayMix: { value: 0 },
    uZoneTex: { value: zone },
    uZoneMix: { value: 0 },
    uZoneCol: {
      value: ZONE_COLOURS.concat(new Array(16 - ZONE_COLOURS.length).fill('#000000'))
        .slice(0, 16)
        .map((c) => new THREE.Color(c)),
    },
    uWorldMin: { value: new THREE.Vector2() },
    uWorldSize: { value: new THREE.Vector2(1, 1) },
  }
}

const VARYINGS = /* glsl */ `
varying vec2 vQUv;
varying float vLayer;
varying vec3 vWPos;
varying vec3 vQN;
varying float vEmit;
varying float vFeat;
`

const QUAD_VERTEX_HEAD = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aQuad;
#ifdef QUAD_FEATURE
attribute float aFeature;
#endif
uniform float uSwap[${MATERIAL_COUNT}];
uniform float uEmit[${MATERIAL_COUNT}];
${VARYINGS}
void quadVertex(out vec3 qPos, out vec3 qNormal) {
  vec2 c = position.xy;
  int d = int(aQuad.z + 0.5);
  if (d == 0 || d == 2 || d == 5) c.x = 1.0 - c.x;
  vec2 s = c * aQuad.xy;
  qPos = aOrigin;
  if (d < 2) { qPos.z += s.x; qPos.y += s.y; qNormal = vec3(d == 0 ? 1.0 : -1.0, 0.0, 0.0); vQUv = vec2(qPos.z, qPos.y); }
  else if (d < 4) { qPos.x += s.x; qPos.z += s.y; qNormal = vec3(0.0, d == 2 ? 1.0 : -1.0, 0.0); vQUv = vec2(qPos.x, qPos.z); }
  else { qPos.x += s.x; qPos.y += s.y; qNormal = vec3(0.0, 0.0, d == 4 ? 1.0 : -1.0); vQUv = vec2(qPos.x, qPos.y); }
}
`

const MODEL_VERTEX_HEAD = /* glsl */ `
attribute float aLayer;
attribute float aILayer;
attribute vec2 aUv;
uniform float uEmit[${MATERIAL_COUNT}];
${VARYINGS}
`

const FRAGMENT_HEAD = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray uAtlas;
uniform float uNight;
uniform float uTime;
uniform float uSelected;
uniform float uHovered;
uniform sampler2D uFeatureTex;
uniform float uOverlayMix;
uniform sampler2D uZoneTex;
uniform float uZoneMix;
uniform vec3 uZoneCol[16];
uniform vec2 uWorldMin;
uniform vec2 uWorldSize;
${VARYINGS}
float vhash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`

const FRAGMENT_MAP = /* glsl */ `
  vec4 texel = texture(uAtlas, vec3(vQUv, floor(vLayer + 0.5)));
  vec3 bp = floor(vWPos - vQN * 0.5 + 0.0005);
  #ifdef VOXEL_MODEL
    float jit = 0.5;
  #else
    float jit = vhash(bp);
  #endif
  texel.rgb *= 0.93 + 0.12 * jit;
  float isWater = step(21.5, vLayer) * step(vLayer, 24.5);
  texel.rgb *= 1.0 + isWater * 0.07 * sin(vWPos.x * 0.7 + uTime * 1.3) * sin(vWPos.z * 0.6 - uTime);
  diffuseColor *= texel;
  #ifndef VOXEL_MODEL
  if (uZoneMix > 0.0) {
    float zid = floor(texture(uZoneTex, (vWPos.xz - uWorldMin) / uWorldSize).r * 255.0 + 0.5);
    if (zid > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uZoneCol[int(zid)], uZoneMix * 0.45);
  }
  if (vFeat > 0.5) {
    if (uOverlayMix > 0.0) {
      int fi = int(vFeat + 0.5);
      vec4 ov = texelFetch(uFeatureTex, ivec2(fi % ${FEATURE_TEX_WIDTH}, fi / ${FEATURE_TEX_WIDTH}), 0);
      float pat = 1.0;
      if (ov.a > 0.8) pat = mod(bp.x + bp.y + bp.z, 2.0) < 0.5 ? 1.0 : 0.3;
      else if (ov.a > 0.5) pat = fract((vWPos.x + vWPos.y + vWPos.z) * 0.25) < 0.5 ? 1.0 : 0.35;
      if (ov.a > 0.1) diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, uOverlayMix * 0.75 * pat);
    }
    if (abs(vFeat - uSelected) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.22), 0.34 + 0.2 * sin(uTime * 4.0));
    else if (abs(vFeat - uHovered) < 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.24);
  }
  #endif
`

const FRAGMENT_EMISSIVE = /* glsl */ `
  float litRnd = step(0.4, vhash(vec3(bp.x, floor(bp.y * 0.5), bp.z) + 17.0));
  totalEmissiveRadiance += diffuseColor.rgb * vec3(1.6, 1.25, 0.75) * vEmit * uNight * (vEmit > 1.5 ? 1.0 : litRnd);
  #ifndef VOXEL_MODEL
  if (vFeat > 0.5 && abs(vFeat - uSelected) < 0.5) totalEmissiveRadiance += vec3(0.22, 0.16, 0.03) * (0.6 + 0.4 * sin(uTime * 4.0));
  #endif
`

function patchFragment(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
    .replace('#include <map_fragment>', FRAGMENT_MAP)
    .replace('#include <emissivemap_fragment>', FRAGMENT_EMISSIVE)
}

/** Lambert material for instanced block quads (terrain, structures). */
export function createQuadMaterial(uniforms: VoxelUniforms, withFeature: boolean): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${withFeature ? '#define QUAD_FEATURE\n' : ''}${QUAD_VERTEX_HEAD}`)
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        vec3 qPos; vec3 qNormal; quadVertex(qPos, qNormal);
        vec3 objectNormal = qNormal;
        int qLayer = int(aQuad.w + 0.5);
        vLayer = uSwap[qLayer];
        vEmit = uEmit[qLayer];
        vQN = qNormal;
        #ifdef QUAD_FEATURE
          vFeat = aFeature;
        #else
          vFeat = 0.0;
        #endif
        `,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = qPos;\n vWPos = (modelMatrix * vec4(qPos, 1.0)).xyz;')
    patchFragment(shader)
  }
  mat.customProgramCacheKey = () => `voxel-quad-${withFeature ? 'f' : 't'}`
  return mat
}

/** Depth material so instanced quads cast shadows. */
export function createQuadDepthMaterial(): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${QUAD_VERTEX_HEAD.replace(/uniform float u(Swap|Emit)\[\d+\];/g, '')}`)
      .replace('#include <begin_vertex>', 'vec3 qPos; vec3 qNormal; quadVertex(qPos, qNormal);\n vec3 transformed = qPos;')
  }
  mat.customProgramCacheKey = () => 'voxel-quad-depth'
  return mat
}

/** Lambert material for instanced voxel models (geometry carries aUv + aLayer). */
export function createModelMaterial(uniforms: VoxelUniforms): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff })
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${MODEL_VERTEX_HEAD}`).replace(
      '#include <begin_vertex>',
      /* glsl */ `
        vec3 transformed = vec3(position);
        float mLayer = aLayer < -0.5 ? aILayer : aLayer;
        vLayer = mLayer;
        vEmit = uEmit[int(mLayer + 0.5)];
        vQUv = aUv;
        vFeat = 0.0;
        vQN = normal;
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif
        `,
    )
    shader.fragmentShader = `#define VOXEL_MODEL\n${shader.fragmentShader}`
    patchFragment(shader)
  }
  mat.customProgramCacheKey = () => 'voxel-model'
  return mat
}

/** Shared unit quad that every block-quad instance expands from. */
export function createQuadBase(): { position: THREE.BufferAttribute; index: THREE.BufferAttribute } {
  return {
    position: new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3),
    index: new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1),
  }
}

export function createQuadGeometry(
  base: { position: THREE.BufferAttribute; index: THREE.BufferAttribute },
  origin: Uint16Array,
  quad: Uint8Array,
  feature: Uint16Array | null,
  count: number,
): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', base.position)
  g.setIndex(base.index)
  g.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3))
  g.setAttribute('aQuad', new THREE.InstancedBufferAttribute(quad, 4))
  if (feature) g.setAttribute('aFeature', new THREE.InstancedBufferAttribute(feature, 1))
  g.instanceCount = count
  return g
}
