import * as THREE from 'three'

export interface VertexDeform {
  /** Shared uniforms (same objects are bound to every variant). */
  uniforms: Record<string, THREE.IUniform>
  /** GLSL declarations (attributes, uniforms, functions). */
  head: string
  /** GLSL run after `begin_vertex`; edit `transformed` (and `objectNormal` if needed). */
  body: string
  key: string
}

function inject(shader: THREE.WebGLProgramParametersWithUniforms, d: VertexDeform) {
  Object.assign(shader.uniforms, d.uniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${d.head}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${d.body}`)
}

/**
 * Apply a vertex deformation to a material *and* to matching depth/distance
 * materials, so shadows bend with the animated mesh (directional/spot
 * shadows use customDepthMaterial, point-light shadows customDistanceMaterial).
 */
export function deform(mesh: THREE.Mesh, material: THREE.Material, d: VertexDeform) {
  material.onBeforeCompile = (s) => inject(s, d)
  material.customProgramCacheKey = () => d.key
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  depth.onBeforeCompile = (s) => inject(s, d)
  depth.customProgramCacheKey = () => d.key + '-depth'
  const distance = new THREE.MeshDistanceMaterial()
  distance.onBeforeCompile = (s) => inject(s, d)
  distance.customProgramCacheKey = () => d.key + '-distance'
  mesh.customDepthMaterial = depth
  mesh.customDistanceMaterial = distance
  return { depth, distance }
}
