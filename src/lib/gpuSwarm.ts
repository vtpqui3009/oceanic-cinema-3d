import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createRng } from './noise'

/**
 * GPU-driven crowds. Every instance's path, heading, tail beat or pulse is a
 * pure function of (uTime, per-instance attributes) evaluated in the vertex
 * shader, so a swarm of hundreds costs one draw call and zero per-frame CPU
 * work — the only thing updated each frame is the shared `uTime` uniform.
 */

export const SWARM_COMMON = /* glsl */ `
uniform float uTime;
attribute vec4 aOrbit;   // xyz: anchor, w: radius / spread
attribute vec4 aMotion;  // x: speed, y: phase, z: scale, w: seed (0..1)
mat3 swLookBasis(vec3 f) {
  f = normalize(f);
  vec3 up = abs(f.y) > 0.98 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 x = normalize(cross(up, f));
  return mat3(x, cross(f, x), f);
}
`

export interface SwarmPatch {
  key: string
  uniforms?: Record<string, THREE.IUniform>
  /** Extra declarations (varyings, functions). */
  head?: string
  /** Body of `vec3 swarmPos(float t)` — the instance's position at time t. */
  path: string
  /** Optional: override orientation; default faces along the path. Sets `mat3 M`. */
  orient?: string
  /** Edit the local-space vertex `lp` (tail wag, pulse…) before placement. */
  local?: string
  /** Fragment injections for lit materials: declarations and code after emissivemap. */
  fragHead?: string
  fragEmissive?: string
}

/**
 * Patch a built-in (lit or unlit) material so each instance is placed by the
 * swarm path. Normals are rotated with the instance so lighting stays right.
 */
export function patchSwarmMaterial<T extends THREE.Material>(material: T, p: SwarmPatch, uTime: THREE.IUniform<number>): T {
  const frame = /* glsl */ `
    vec3 swarmPos(float t) { ${p.path} }
    void swarmFrame(out vec3 P, out mat3 M) {
      P = swarmPos(uTime);
      vec3 ahead = swarmPos(uTime + 0.04) - P;
      M = swLookBasis(ahead + vec3(0.0, 0.0, 1e-4));
      ${p.orient ?? ''}
    }`
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    Object.assign(shader.uniforms, p.uniforms ?? {})
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SWARM_COMMON}\n${p.head ?? ''}\n${frame}`)
      // evaluate the path once per vertex and share it between the normal and
      // position stages (depth/distance shaders have no normal stage)
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nvec3 swP; mat3 swM; swarmFrame(swP, swM);\n#define SW_FRAME\nobjectNormal = swM * objectNormal;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifndef SW_FRAME
        vec3 swP; mat3 swM; swarmFrame(swP, swM);
        #endif
        {
          vec3 lp = transformed * aMotion.z;
          ${p.local ?? ''}
          transformed = swM * lp + swP;
        }`,
      )
    if (p.fragHead) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${p.fragHead}`)
    if (p.fragEmissive)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${p.fragEmissive}`,
      )
  }
  material.customProgramCacheKey = () => p.key
  return material
}

/** Instanced mesh whose instances are positioned purely in the shader. */
export function makeSwarmMesh(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, fill: (i: number, orbit: number[], motion: number[], rng: () => number) => void, seed = 1) {
  const rng = createRng(seed)
  const orbit = new Float32Array(count * 4)
  const motion = new Float32Array(count * 4)
  const o = [0, 0, 0, 0], m = [0, 0, 0, 0]
  for (let i = 0; i < count; i++) {
    fill(i, o, m, rng)
    orbit.set(o, i * 4)
    motion.set(m, i * 4)
  }
  const geo = geometry.clone()
  geo.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(orbit, 4))
  geo.setAttribute('aMotion', new THREE.InstancedBufferAttribute(motion, 4))
  const mesh = new THREE.InstancedMesh(geo, material, count)
  // instance matrices stay identity (placement happens in the shader), so the
  // default bounds would be wrong: skip culling; far zones are layer-hidden
  mesh.frustumCulled = false
  return mesh
}

/** Fog for custom additive shaders: fades glow out with distance (no fog colour needed). */
export const GLOW_FOG = /* glsl */ `
uniform float uFogDensity;
float glowFog(float dist) { return exp(-uFogDensity * uFogDensity * dist * dist); }
`

/**
 * A small generic fish (~70 triangles): laterally compressed spindle with a
 * forked tail, nose at +Z, length 1.
 */
export function smallFishGeometry() {
  const profile = [
    [0, -0.5], [0.05, -0.43], [0.085, -0.25], [0.105, -0.02], [0.095, 0.2], [0.06, 0.38], [0.02, 0.48], [0, 0.5],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const body = new THREE.LatheGeometry(profile, 8)
  body.rotateX(Math.PI / 2) // length along +Z (nose)
  body.scale(0.55, 1.15, 1)
  body.translate(0, 0, 0.02)
  const tail = new THREE.BufferGeometry()
  const tp = [0, 0, -0.44, 0, 0.19, -0.7, 0, 0.02, -0.6, 0, 0, -0.44, 0, -0.02, -0.6, 0, -0.19, -0.7]
  tail.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3))
  tail.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2))
  tail.computeVertexNormals()
  const nonIndexedBody = body.toNonIndexed()
  body.dispose()
  nonIndexedBody.deleteAttribute('normal')
  const merged = mergeGeometries([nonIndexedBody, tail.deleteAttribute('normal')])!
  nonIndexedBody.dispose()
  tail.dispose()
  // weld shared corners: ~5× fewer vertex-shader runs per fish than unindexed
  merged.deleteAttribute('uv')
  const g = mergeVertices(merged)
  merged.dispose()
  g.computeVertexNormals()
  return g
}
