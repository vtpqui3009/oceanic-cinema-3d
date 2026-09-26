import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { taperedTube } from '../../lib/geometry'
import { DIVER_GLSL, diverUniforms } from '../../interaction/diverLight'
import { GLOW_FOG, SWARM_COMMON, makeSwarmMesh } from '../../lib/gpuSwarm'
import { useSceneStore } from '../../state/useSceneStore'
import { useSwarmClock } from './useSwarmClock'
import { useDiscoverable } from '../../interaction/discoverables'

/**
 * Small glowing jellies drifting in the twilight around the crown jelly.
 * Each pulses on its own rhythm (bell squeezes, tentacles trail and sway)
 * and glows at its rim — unlit additive shading, one draw call, no shadows.
 */
function jellyGeometry() {
  const bell = new THREE.LatheGeometry(
    [[0, 0.3], [0.1, 0.29], [0.2, 0.24], [0.27, 0.14], [0.3, 0.03], [0.29, -0.02], [0.24, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)),
    20,
  )
  // aSway: 0 on the bell, growing down each tentacle
  bell.setAttribute('aSway', new THREE.Float32BufferAttribute(new Array(bell.attributes.position.count).fill(0), 1))
  const parts: THREE.BufferGeometry[] = [bell.toNonIndexed()]
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const r = 0.25
    const base = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)
    const len = 0.7 + (k % 3) * 0.15
    const tube = taperedTube(
      new THREE.CatmullRomCurve3([base, base.clone().add(new THREE.Vector3(0, -len * 0.5, 0)), base.clone().add(new THREE.Vector3(0, -len, 0))]),
      10, 3, (t) => 0.008 * (1 - t) + 0.002,
    )
    const sway = new Float32Array(tube.attributes.position.count)
    const uv = tube.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < sway.length; i++) sway[i] = uv.getY(i)
    tube.setAttribute('aSway', new THREE.BufferAttribute(sway, 1))
    parts.push(tube.toNonIndexed())
    tube.dispose()
  }
  bell.dispose()
  parts.forEach((p) => {
    p.deleteAttribute('uv')
    p.deleteAttribute('normal')
  })
  const g = mergeGeometries(parts)!
  parts.forEach((p) => p.dispose())
  g.computeVertexNormals()
  return g
}

const PALETTE = ['#6fb8ff', '#9d7bff', '#ff7bd5', '#5ff0e0']

export function DriftJellies({ count: wanted = 18, radius = [6, 14] as [number, number] }) {
  const quality = useSceneStore((s) => s.quality)
  const count = quality === 'high' ? wanted : Math.ceil(wanted * 0.45)
  const { uTime, uFogDensity } = useSwarmClock()

  const mesh = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime, uFogDensity, ...diverUniforms },
      vertexShader: /* glsl */ `
        ${SWARM_COMMON}
        ${DIVER_GLSL}
        varying float vTorch;
        attribute float aSway;
        attribute vec3 aColor;
        varying vec3 vN;
        varying vec3 vView;
        varying float vSway;
        varying vec3 vColor;
        varying float vDist;
        void main() {
          float ph = aMotion.y + uTime * aMotion.x;
          float pulse = pow(0.5 + 0.5 * sin(ph), 3.0);          // quick squeeze, slow release
          vec3 lp = position;
          float rim = smoothstep(0.3, 0.0, lp.y) * (1.0 - aSway);
          lp.xz *= 1.0 - pulse * 0.28 * rim;
          lp.y += pulse * 0.05 * (1.0 - rim) * (1.0 - aSway);
          // tentacles trail and sway, lagging the stroke
          float s = aSway;
          lp.x += sin(uTime * 0.9 + aMotion.w * 20.0 - s * 3.0) * 0.12 * s * s;
          lp.z += cos(uTime * 0.7 + aMotion.w * 13.0 - s * 2.5) * 0.1 * s * s;
          lp.y += pulse * 0.08 * s;
          lp *= aMotion.z;
          // slow drift + a lift on every stroke
          vec3 P = aOrbit.xyz + vec3(sin(uTime * 0.05 + aMotion.w * 30.0) * 0.8,
                                     sin(uTime * 0.11 + aMotion.w * 17.0) * 0.5 + sin(ph - 0.8) * 0.06,
                                     cos(uTime * 0.04 + aMotion.w * 11.0) * 0.8);
          float tilt = sin(uTime * 0.2 + aMotion.w * 9.0) * 0.25;
          mat3 R = mat3(cos(tilt), sin(tilt), 0.0, -sin(tilt), cos(tilt), 0.0, 0.0, 0.0, 1.0);
          vec4 world = modelMatrix * vec4(R * lp + P, 1.0);
          world.xyz += diverPush(world.xyz, 0.3, 0.7); // drift away from the torch
          vTorch = diverFalloff(world.xyz, 0.25);
          vN = normalize(mat3(modelMatrix) * (R * normal));
          vView = cameraPosition - world.xyz;
          vDist = length(vView);
          vSway = s;
          vColor = aColor * (0.75 + pulse * 0.6);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        ${GLOW_FOG}
        varying float vTorch;
        varying vec3 vN;
        varying vec3 vView;
        varying float vSway;
        varying vec3 vColor;
        varying float vDist;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.2);
          float body = mix(0.12 + fres * 1.4, 0.55 * (1.0 - vSway), step(0.001, vSway));
          gl_FragColor = vec4(vColor * body * (1.0 + vTorch * 1.8) * glowFog(vDist), 1.0);
        }`,
    })
    const m = makeSwarmMesh(jellyGeometry(), material, count, (_, o, mo, rng) => {
      // keep the camera side (+z) clear so none drift into the lens
      const a = Math.PI * (1.05 + rng() * 0.9) + (rng() < 0.3 ? Math.PI * 0.75 * (rng() < 0.5 ? -1 : 1) : 0)
      const r = radius[0] + rng() * (radius[1] - radius[0])
      o[0] = Math.cos(a) * r
      o[1] = -3 + rng() * 6.5
      o[2] = Math.sin(a) * r - 2
      o[3] = 0
      mo[0] = 1.4 + rng() * 1.2 // stroke rate
      mo[1] = rng() * 10
      mo[2] = 0.4 + rng() * 0.5
      mo[3] = rng()
    }, 77)
    const colors = new Float32Array(count * 3)
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      c.set(PALETTE[i % PALETTE.length])
      colors.set([c.r, c.g, c.b], i * 3)
    }
    m.geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
    return m
  }, [count, radius, uTime, uFogDensity])

  // CPU mirror of the shader's drift, evaluated only on pointer events
  const p = useMemo(() => new THREE.Vector3(), [])
  useDiscoverable(
    'driftjelly',
    useMemo(
      () => ({
        zone: 1,
        sample: (emit: (c: THREE.Vector3, r: number) => void) => {
          const o = (mesh.geometry.attributes.aOrbit as THREE.InstancedBufferAttribute).array
          const m = (mesh.geometry.attributes.aMotion as THREE.InstancedBufferAttribute).array
          const t = uTime.value
          for (let i = 0; i < mesh.count; i++) {
            const w = m[i * 4 + 3]
            p.set(
              o[i * 4] + Math.sin(t * 0.05 + w * 30) * 0.8,
              o[i * 4 + 1] + Math.sin(t * 0.11 + w * 17) * 0.5 - 0.15 * m[i * 4 + 2],
              o[i * 4 + 2] + Math.cos(t * 0.04 + w * 11) * 0.8,
            )
            emit(mesh.localToWorld(p), 0.45 * m[i * 4 + 2])
          }
        },
      }),
      [mesh, p, uTime],
    ),
  )

  return <primitive object={mesh} />
}
