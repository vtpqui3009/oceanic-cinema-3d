import * as THREE from 'three'

/**
 * Skip shadow-map lookups where a light contributes nothing.
 *
 * three.js samples every point / spot shadow for every lit fragment, even
 * outside the light's `distance` or cone, where its colour has already been
 * attenuated to exactly zero. Our soft shadows are many-tap filters (and a
 * point light's is a cube map), so a seabed filling the screen paid for the
 * jellyfish's shadow across its whole surface. Guarding the lookup with the
 * light's attenuated colour removes that cost without changing a pixel: a
 * shadow on zero light is still zero.
 *
 * Patched once at start-up, before any program is compiled (so the loader's
 * pre-compilation covers it).
 */
const chunk = THREE.ShaderChunk.lights_fragment_begin
const guard = '( directLight.visible && receiveShadow && dot( directLight.color, vec3( 1.0 ) ) > 0.0 ) ? get'
const patched = chunk
  .replace('( directLight.visible && receiveShadow ) ? getPointShadow', guard + 'PointShadow')
  .replace('( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap', guard + 'Shadow( spotShadowMap')
if (patched !== chunk) THREE.ShaderChunk.lights_fragment_begin = patched
else if (import.meta.env.DEV) console.warn('shadowCull: lights_fragment_begin changed, patch not applied')
