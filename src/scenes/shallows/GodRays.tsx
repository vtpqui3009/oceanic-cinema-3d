import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createRng } from '../../lib/noise'
import { liveAtmosphere } from '../../scene/Atmosphere'
import { useSceneStore } from '../../state/useSceneStore'

/**
 * Light shafts: soft additive cones hanging from the surface, slanted along
 * the sun direction. Brightness follows the view angle (a cone seen edge-on
 * fades out), the height (they die off with depth) and a slow flicker from
 * the waves passing overhead.
 */
export function GodRays({ top = 10, count = 14, spread = 9, sunDir = [0.3, 1, 0.2] as [number, number, number] }) {
  const quality = useSceneStore((s) => s.quality)
  const n = quality === 'high' ? count : Math.ceil(count * 0.6)

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#aef3ff') },
          uStrength: { value: 0.16 },
          uFogDensity: { value: 0.03 },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          varying float vH;
          varying float vSeed;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vH = uv.y;
            vSeed = aSeed;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uStrength, uFogDensity;
          uniform vec3 uColor;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          varying float vH;
          varying float vSeed;
          void main() {
            vec3 V = normalize(cameraPosition - vWorld);
            float facing = pow(abs(dot(vNormalW, V)), 2.2);
            float height = smoothstep(0.0, 0.85, vH) * (0.55 + 0.45 * vH);
            float flicker = 0.55 + 0.45 * sin(uTime * (0.4 + vSeed * 0.5) + vSeed * 40.0 + vWorld.y * 0.15);
            float d = distance(vWorld, cameraPosition);
            float fog = exp(-uFogDensity * uFogDensity * d * d * 0.7);
            float near = smoothstep(0.5, 3.0, d);
            gl_FragColor = vec4(uColor * facing * height * flicker * uStrength * fog * near, 1.0);
          }`,
      }),
    [],
  )

  const rays = useMemo(() => {
    const rng = createRng(4)
    const dir = new THREE.Vector3(...sunDir).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    return Array.from({ length: n }, (_, i) => {
      const len = 16 + rng() * 8
      const g = new THREE.CylinderGeometry(0.35 + rng() * 0.5, 1.2 + rng() * 1.6, len, 24, 1, true)
      g.translate(0, -len / 2, 0) // hang from the top
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(i / n + rng() * 0.1), 1))
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * spread
      return { g, pos: [Math.cos(a) * r, top, Math.sin(a) * r - 1] as [number, number, number], q }
    })
  }, [n, spread, top, sunDir])

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uFogDensity.value = liveAtmosphere.density
  })

  return (
    <group>
      {rays.map((r, i) => (
        <mesh key={i} geometry={r.g} material={material} position={r.pos} quaternion={r.q} frustumCulled={false} renderOrder={2} />
      ))}
    </group>
  )
}
