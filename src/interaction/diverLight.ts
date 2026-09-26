import * as THREE from 'three'

/**
 * The diver's torch: a point that follows the pointer a few metres in front
 * of the camera. It is NOT a three.js light (that would add a shader variant
 * and per-pixel cost to every PBR material) — just two shared uniforms that
 * the custom particle / glow / swarm shaders read to brighten and part.
 */
export const diverUniforms = {
  uDiverPos: { value: new THREE.Vector3(0, -9999, 0) },
  uDiverStrength: { value: 0 },
}

/** GLSL helper: falloff (0…1) of the torch at a world position. */
export const DIVER_GLSL = /* glsl */ `
uniform vec3 uDiverPos;
uniform float uDiverStrength;
float diverFalloff(vec3 w, float k) {
  vec3 d = w - uDiverPos;
  return uDiverStrength * exp(-dot(d, d) * k);
}
vec3 diverPush(vec3 w, float k, float amount) {
  vec3 d = w - uDiverPos;
  float l = max(length(d), 1e-3);
  return d / l * amount * diverFalloff(w, k);
}
`
