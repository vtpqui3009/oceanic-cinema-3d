import { useMemo } from 'react'
import { useZoneIndex, zoneVisible } from '../../scene/Zone'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { liveAtmosphere } from '../../scene/Atmosphere'

/**
 * The ocean surface seen from below: a bright Snell's window straight
 * overhead (the whole sky squeezed into a 97° cone), total internal
 * reflection outside it, rippling and sparkling where the sun sits.
 */
export function WaterSurface({ y = 10, sunDir = [0.3, 1, 0.2] as [number, number, number] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uSun: { value: new THREE.Vector3(...sunDir).normalize() },
          uSky: { value: new THREE.Color('#c9f6ff') },
          uDeep: { value: new THREE.Color('#0b4a5e') },
          uFogColor: { value: new THREE.Color() },
          uFogDensity: { value: 0.03 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uFogDensity;
          uniform vec3 uSun, uSky, uDeep, uFogColor;
          varying vec3 vWorld;
          vec2 ripple(vec2 p, float t) {
            vec2 d = vec2(0.0);
            d += vec2(cos(p.x * 0.9 + t * 1.1), sin(p.y * 0.8 - t * 0.9)) * 0.5;
            d += vec2(cos(p.y * 2.3 - p.x * 0.7 + t * 1.7), sin(p.x * 2.1 + t * 1.3)) * 0.25;
            d += vec2(sin(p.x * 5.7 + p.y * 3.1 + t * 2.9), cos(p.y * 6.3 - t * 2.3)) * 0.1;
            return d;
          }
          void main() {
            vec3 V = normalize(vWorld - cameraPosition);
            vec2 r = ripple(vWorld.xz * 0.6, uTime);
            vec3 N = normalize(vec3(r.x * 0.18, 1.0, r.y * 0.18));
            float cosT = clamp(dot(V, N), 0.0, 1.0);
            float window = smoothstep(0.58, 0.7, cosT);
            float sun = pow(max(dot(normalize(V + vec3(r.x, 0.0, r.y) * 0.03), uSun), 0.0), 60.0);
            float sparkle = pow(max(0.0, sin(dot(vWorld.xz, vec2(3.1, 2.7)) + r.x * 8.0 + uTime * 3.0)), 24.0);
            vec3 col = mix(uDeep * (0.8 + r.x * 0.2), uSky * (1.2 + r.y * 0.25), window);
            col += vec3(1.0, 0.97, 0.9) * (sun * 3.0 + sparkle * window * 0.6);
            float d = distance(vWorld, cameraPosition);
            float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d * 0.55);
            gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [sunDir],
  )

  const zone = useZoneIndex()
  useFrame(({ clock }) => {
    if (!zoneVisible(zone)) return // off screen: no simulation cost
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uFogColor.value.copy(liveAtmosphere.fog)
    material.uniforms.uFogDensity.value = liveAtmosphere.density
  })

  return (
    <mesh position={[0, y, 0]} rotation-x={Math.PI / 2} material={material}>
      <planeGeometry args={[400, 400, 1, 1]} />
    </mesh>
  )
}
