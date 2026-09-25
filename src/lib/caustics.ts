import * as THREE from 'three'

/** Shared clock for every caustic-receiving material. */
export const causticUniforms = {
  uCausticTime: { value: 0 },
  uCausticStrength: { value: 1 },
}

const GLSL = /* glsl */ `
uniform float uCausticTime;
uniform float uCausticStrength;
varying vec3 vCausticWorld;
// iterative domain-warp water caustic (after Dave Hoskins / joltz0r)
float causticPattern(vec2 uv, float time) {
  vec2 p = mod(uv * 6.2831, 6.2831) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
float caustic(vec3 w) {
  float a = causticPattern(w.xz * 0.16, uCausticTime * 0.5);
  float b = causticPattern(w.xz * 0.23 + 0.37, uCausticTime * 0.38 + 3.1);
  return min(a + b * 0.6, 2.5);
}
`

/**
 * Sunlight caustics: modulates the *directional* light only (after its shadow
 * term), so the dancing pattern disappears inside shadows, like the real thing.
 */
export function withCaustics<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, causticUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCausticWorld;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvCausticWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace(
        'getDirectionalLightInfo( directionalLight, directLight );',
        'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= mix(1.0, 0.45 + caustic(vCausticWorld) * 2.2, uCausticStrength);',
      )
  }
  material.customProgramCacheKey = () => 'caustics'
  return material
}
