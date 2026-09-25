import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { bioLights } from '../lib/bioluminescence'
import { createRng } from '../lib/noise'
import { useSceneStore } from '../state/useSceneStore'
import { liveAtmosphere } from './Atmosphere'

const MAX_LIGHTS = 4
const EXTENT = new THREE.Vector3(16, 10, 16)

/**
 * Marine snow for the whole dive: a box of drifting dust that wraps around
 * the camera, so it is everywhere without being infinite. GPU points brighten
 * near bioluminescent emitters; a sparse layer of real flakes is lit and
 * receives shadows like any other mesh.
 */
export function MarineSnow({ tint = '#9cc3d2' }: { tint?: THREE.ColorRepresentation }) {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const gl = useThree((s) => s.gl)
  const count = quality === 'high' ? 3200 : 900
  const flakeCount = quality === 'high' ? 320 : 100

  const { geometry, material } = useMemo(() => {
    const rng = createRng(9)
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng() * EXTENT.x
      pos[i * 3 + 1] = rng() * EXTENT.y
      pos[i * 3 + 2] = rng() * EXTENT.z
      seed[i] = rng()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1))
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uExtent: { value: EXTENT },
        uCam: { value: new THREE.Vector3() },
        uPixelRatio: { value: 1 },
        uAmbient: { value: 0.1 },
        uTint: { value: new THREE.Color(tint) },
        uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
        uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color()) },
        uLightCount: { value: 0 },
        uFogDensity: { value: 0.1 },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uPixelRatio, uAmbient;
        uniform vec3 uExtent, uCam;
        uniform vec3 uLightPos[${MAX_LIGHTS}];
        uniform vec3 uLightColor[${MAX_LIGHTS}];
        uniform int uLightCount;
        uniform vec3 uTint;
        varying vec3 vColor;
        varying float vDepth;
        varying float vTwinkle;
        void main() {
          float s = seed * 6.2831;
          vec3 p = position;
          p.y -= uTime * (0.03 + seed * 0.05);
          p.x += sin(uTime * 0.13 + s) * 0.35 + sin(uTime * 0.41 + s * 3.0) * 0.06;
          p.z += cos(uTime * 0.11 + s * 1.7) * 0.35;
          // wrap the box around the camera
          vec3 world = mod(p - uCam + uExtent * 0.5, uExtent) - uExtent * 0.5 + uCam;
          vec3 glow = vec3(0.0);
          for (int i = 0; i < ${MAX_LIGHTS}; i++) {
            if (i >= uLightCount) break;
            float d = distance(world, uLightPos[i]);
            glow += uLightColor[i] / (1.0 + d * d * 6.0);
          }
          vColor = uTint * uAmbient + glow;
          vec4 mv = viewMatrix * vec4(world, 1.0);
          vDepth = -mv.z;
          // fade out at the wrap boundary so particles never pop
          vec3 rel = abs(world - uCam) / (uExtent * 0.5);
          float edge = 1.0 - smoothstep(0.75, 1.0, max(rel.x, max(rel.y, rel.z)));
          vTwinkle = (0.6 + 0.4 * sin(uTime * (1.0 + seed * 3.0) + s)) * edge;
          gl_PointSize = min((1.2 + seed * 2.6) * uPixelRatio * (8.0 / max(vDepth, 0.1)), 14.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFogDensity;
        varying vec3 vColor;
        varying float vDepth;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          gl_FragColor = vec4(vColor * a * vTwinkle * fog, 1.0);
        }`,
    })
    return { geometry, material }
  }, [count, tint])

  const flakes = useRef<THREE.InstancedMesh>(null!)
  const flakeData = useMemo(() => {
    const rng = createRng(31)
    return Array.from({ length: flakeCount }, () => ({
      p: new THREE.Vector3(rng() * EXTENT.x * 0.6, rng() * EXTENT.y * 0.6, rng() * EXTENT.z * 0.6),
      s: 0.006 + rng() * 0.014,
      spin: new THREE.Vector3(rng(), rng(), rng()).multiplyScalar(0.6),
      fall: 0.02 + rng() * 0.03,
      phase: rng() * 10,
    }))
  }, [flakeCount])
  const flakeGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const box = useMemo(() => EXTENT.clone().multiplyScalar(0.6), [])
  const wrap = (x: number, c: number, e: number) => ((((x - c + e / 2) % e) + e) % e) - e / 2 + c

  useFrame(({ clock, camera }) => {
    const t = reduced ? 0 : clock.elapsedTime
    const u = material.uniforms
    u.uTime.value = t
    u.uCam.value.copy(camera.position)
    u.uPixelRatio.value = gl.getPixelRatio()
    u.uAmbient.value = liveAtmosphere.snow
    u.uFogDensity.value = liveAtmosphere.density
    let i = 0
    for (const l of bioLights) {
      if (i >= MAX_LIGHTS) break
      if (l.strength <= 0.001) continue
      l.object.getWorldPosition(u.uLightPos.value[i])
      u.uLightColor.value[i].copy(l.color).multiplyScalar(l.strength * 0.9)
      i++
    }
    u.uLightCount.value = i

    const c = camera.position
    flakeData.forEach((f, k) => {
      tmp.position.set(
        wrap(f.p.x + Math.sin(t * 0.2 + f.phase) * 0.3, c.x, box.x),
        wrap(f.p.y - t * f.fall, c.y, box.y),
        wrap(f.p.z + Math.cos(t * 0.17 + f.phase) * 0.3, c.z, box.z),
      )
      tmp.rotation.set(t * f.spin.x + f.phase, t * f.spin.y, t * f.spin.z)
      // never let a flake sit right in front of the lens
      const near = THREE.MathUtils.smoothstep(tmp.position.distanceTo(c), 2.2, 3.6)
      tmp.scale.set(f.s * near, f.s * 0.35 * near, f.s * 0.8 * near)
      tmp.updateMatrix()
      flakes.current.setMatrixAt(k, tmp.matrix)
    })
    flakes.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <points geometry={geometry} material={material} frustumCulled={false} />
      <instancedMesh ref={flakes} args={[flakeGeo, undefined, flakeCount]} receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#b9c8cc" roughness={0.7} emissive="#0a1a22" emissiveIntensity={0.4} />
      </instancedMesh>
    </group>
  )
}
