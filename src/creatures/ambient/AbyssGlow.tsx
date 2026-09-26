import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { taperedTube } from '../../lib/geometry'
import { DIVER_GLSL, diverUniforms } from '../../interaction/diverLight'
import { GLOW_FOG, SWARM_COMMON, makeSwarmMesh } from '../../lib/gpuSwarm'
import { useSceneStore } from '../../state/useSceneStore'
import { useSwarmClock } from './useSwarmClock'
import { useDiscoverable } from '../../interaction/discoverables'

const glowMaterial = (vertex: string, fragment: string, uniforms: Record<string, THREE.IUniform>) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
  })

/**
 * Comb jellies (ctenophores): eight rows of beating cilia diffract any light
 * into running rainbows, over a faint blue bioluminescent body. Drifting,
 * slowly spinning; unlit additive, one draw call.
 */
export function CombJellies({ count: wanted = 7 }) {
  const quality = useSceneStore((s) => s.quality)
  const count = quality === 'high' ? wanted : 3
  const { uTime, uFogDensity } = useSwarmClock()

  const mesh = useMemo(() => {
    const body = new THREE.LatheGeometry(
      [[0, -0.24], [0.08, -0.22], [0.14, -0.12], [0.16, 0.02], [0.13, 0.15], [0.07, 0.23], [0, 0.25]].map(([x, y]) => new THREE.Vector2(x, y)),
      32,
    )
    const material = glowMaterial(
      /* glsl */ `
        ${SWARM_COMMON}
        ${DIVER_GLSL}
        varying float vTorch;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vView;
        varying float vDist;
        void main() {
          float spin = uTime * 0.3 + aMotion.w * 6.28;
          mat3 R = mat3(cos(spin), 0.0, -sin(spin), 0.0, 1.0, 0.0, sin(spin), 0.0, cos(spin));
          vec3 P = aOrbit.xyz + vec3(sin(uTime * 0.07 + aMotion.w * 20.0) * 0.7, sin(uTime * 0.19 + aMotion.w * 9.0) * 0.35, cos(uTime * 0.06 + aMotion.w * 13.0) * 0.7);
          vec4 world = modelMatrix * vec4(R * (position * aMotion.z) + P, 1.0);
          world.xyz += diverPush(world.xyz, 0.3, 0.5);
          vTorch = diverFalloff(world.xyz, 0.25);
          vUv = uv;
          vN = normalize(mat3(modelMatrix) * (R * normal));
          vView = cameraPosition - world.xyz;
          vDist = length(vView);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      /* glsl */ `
        ${GLOW_FOG}
        varying float vTorch;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vView;
        varying float vDist;
        vec3 rainbow(float h) { return 0.5 + 0.5 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67))); }
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
          float rows = pow(abs(cos(vUv.x * 3.14159 * 8.0)), 60.0) * smoothstep(0.08, 0.25, vUv.y) * smoothstep(0.95, 0.75, vUv.y);
          float beat = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(vUv.y * 46.0 - uTime * 9.0), 3.0);
          vec3 comb = rainbow(fract(vUv.y * 1.6 - uTime * 0.35 + vUv.x * 2.0)) * rows * beat * 2.2;
          vec3 glow = vec3(0.25, 0.55, 1.0) * (0.05 + fres * 0.6);
          gl_FragColor = vec4((comb + glow) * (1.0 + vTorch * 1.6) * glowFog(vDist), 1.0);
        }`,
      { uTime, uFogDensity, ...diverUniforms },
    )
    return makeSwarmMesh(body, material, count, (i, o, m, rng) => {
      // a loose ring behind and around the anglerfish, never in the lens
      const a = Math.PI * (0.95 + (i / Math.max(count - 1, 1)) * 1.1) + (rng() - 0.5) * 0.3
      const r = 3.5 + rng() * 4
      o[0] = Math.cos(a) * r
      o[1] = 0.6 + rng() * 2.4
      o[2] = Math.sin(a) * r - 1.5
      m[2] = 0.5 + rng() * 0.5
      m[3] = rng()
    }, 31)
  }, [count, uTime, uFogDensity])

  const p = useMemo(() => new THREE.Vector3(), [])
  useDiscoverable(
    'combjelly',
    useMemo(
      () => ({
        zone: 3,
        sample: (emit: (c: THREE.Vector3, r: number) => void) => {
          const o = (mesh.geometry.attributes.aOrbit as THREE.InstancedBufferAttribute).array
          const m = (mesh.geometry.attributes.aMotion as THREE.InstancedBufferAttribute).array
          const t = uTime.value
          for (let i = 0; i < mesh.count; i++) {
            const w = m[i * 4 + 3]
            p.set(o[i * 4] + Math.sin(t * 0.07 + w * 20) * 0.7, o[i * 4 + 1] + Math.sin(t * 0.19 + w * 9) * 0.35, o[i * 4 + 2] + Math.cos(t * 0.06 + w * 13) * 0.7)
            emit(mesh.localToWorld(p), 0.3 * m[i * 4 + 2])
          }
        },
      }),
      [mesh, p, uTime],
    ),
  )

  return <primitive object={mesh} />
}

/**
 * Sea pens on the abyssal floor: feathery colonies whose polyps flash in
 * waves that run up the stalk. They sway in the slow current. Unlit
 * additive, one draw call.
 */
function seaPenGeometry() {
  const parts: THREE.BufferGeometry[] = []
  const withH = (g: THREE.BufferGeometry, h: (y: number) => number) => {
    const p = g.attributes.position as THREE.BufferAttribute
    const a = new Float32Array(p.count)
    for (let i = 0; i < p.count; i++) a[i] = h(p.getY(i))
    g.setAttribute('aH', new THREE.BufferAttribute(a, 1))
    g.deleteAttribute('uv')
    g.deleteAttribute('normal')
    return g.index ? g.toNonIndexed() : g
  }
  const H = 0.9
  parts.push(withH(taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, H * 0.5, 0), new THREE.Vector3(0, H, 0.02)]), 12, 5, (t) => 0.018 * (1 - t * 0.6)), (y) => y / H))
  // feather: paired leaves climbing the stalk
  for (let k = 0; k < 11; k++) {
    const y = 0.22 + (k / 11) * (H - 0.26)
    const len = 0.1 + 0.08 * Math.sin((k / 11) * Math.PI)
    for (const side of [1, -1]) {
      const leaf = new THREE.BufferGeometry()
      leaf.setAttribute('position', new THREE.Float32BufferAttribute([
        0, y, 0, side * len, y + 0.05, 0.02, side * len * 0.9, y + 0.09, -0.01,
        0, y, 0, side * len * 0.9, y + 0.09, -0.01, 0, y + 0.06, 0,
      ], 3))
      parts.push(withH(leaf, (yy) => yy / H))
    }
  }
  const g = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  g.computeVertexNormals()
  return g
}

export function SeaPens({ clearings = [] as [number, number, number][] }) {
  const quality = useSceneStore((s) => s.quality)
  const count = quality === 'high' ? 22 : 9
  const { uTime, uFogDensity } = useSwarmClock()

  const mesh = useMemo(() => {
    const material = glowMaterial(
      /* glsl */ `
        ${SWARM_COMMON}
        ${DIVER_GLSL}
        varying float vTorch;
        attribute float aH;
        varying float vH;
        varying float vSeed;
        varying float vDist;
        void main() {
          vec3 lp = position * aMotion.z;
          float bend = aH * aH;
          lp.x += sin(uTime * 0.45 + aMotion.w * 12.0) * 0.13 * bend * aMotion.z;
          lp.z += cos(uTime * 0.37 + aMotion.w * 7.0) * 0.08 * bend * aMotion.z;
          float yaw = aMotion.w * 6.28;
          lp.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * lp.xz;
          vec4 world = modelMatrix * vec4(lp + aOrbit.xyz, 1.0);
          vTorch = diverFalloff(world.xyz, 0.3);
          vH = aH;
          vSeed = aMotion.w;
          vDist = distance(world.xyz, cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      /* glsl */ `
        ${GLOW_FOG}
        varying float vTorch;
        uniform float uTime;
        varying float vH;
        varying float vSeed;
        varying float vDist;
        void main() {
          // polyps flash in waves running up the colony, every few seconds
          float wave = pow(0.5 + 0.5 * sin(vH * 11.0 - uTime * 2.4 + vSeed * 40.0), 7.0);
          float burst = smoothstep(0.7, 1.0, sin(uTime * 0.35 + vSeed * 20.0));
          float glow = 0.03 + wave * (0.12 + max(burst, vTorch) * 0.55) + vTorch * 0.25;
          vec3 col = mix(vec3(0.15, 0.9, 0.75), vec3(0.4, 0.7, 1.0), vH);
          gl_FragColor = vec4(col * glow * glowFog(vDist), 1.0);
        }`,
      { uTime, uFogDensity, ...diverUniforms },
    )
    return makeSwarmMesh(seaPenGeometry(), material, count, (_, o, m, rng) => {
      let x = 0, z = 0
      for (let tries = 0; tries < 20; tries++) {
        const a = rng() * Math.PI * 2
        const r = 3 + rng() * 7
        x = Math.cos(a) * r
        z = Math.sin(a) * r - 1.5
        if (!clearings.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) break
      }
      o[0] = x
      o[1] = -0.05
      o[2] = z
      m[2] = 0.45 + rng() * 0.5
      m[3] = rng()
    }, 64)
  }, [count, uTime, uFogDensity, clearings])

  const p = useMemo(() => new THREE.Vector3(), [])
  useDiscoverable(
    'seapen',
    useMemo(
      () => ({
        zone: 3,
        sample: (emit: (c: THREE.Vector3, r: number) => void) => {
          const o = (mesh.geometry.attributes.aOrbit as THREE.InstancedBufferAttribute).array
          const m = (mesh.geometry.attributes.aMotion as THREE.InstancedBufferAttribute).array
          for (let i = 0; i < mesh.count; i++) {
            p.set(o[i * 4], o[i * 4 + 1] + 0.45 * m[i * 4 + 2], o[i * 4 + 2])
            emit(mesh.localToWorld(p), 0.4 * m[i * 4 + 2])
          }
        },
      }),
      [mesh, p],
    ),
  )

  return <primitive object={mesh} />
}
