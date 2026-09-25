import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { bioLights } from '../lib/bioluminescence'
import { createRng } from '../lib/noise'
import { useSceneStore } from '../state/useSceneStore'

const MAX_LIGHTS = 4

interface Props {
  center?: [number, number, number]
  extent?: [number, number, number]
  /** Faint self-visibility with no light around (drops with depth). */
  ambient?: number
  tint?: THREE.ColorRepresentation
}

/**
 * Marine snow: drifting dust (GPU points that brighten near bioluminescent
 * emitters) plus a sparse layer of real flakes that are lit and receive
 * shadows like any other mesh.
 */
export function MarineSnow({ center = [0, 1.5, 0], extent = [14, 6, 14], ambient = 0.05, tint = '#8fb7c9' }: Props) {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const gl = useThree((s) => s.gl)
  const count = quality === 'high' ? 2600 : 800
  const flakeCount = quality === 'high' ? 280 : 90

  const { geometry, material } = useMemo(() => {
    const rng = createRng(9)
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rng() - 0.5) * extent[0]
      pos[i * 3 + 1] = rng() * extent[1]
      pos[i * 3 + 2] = (rng() - 0.5) * extent[2]
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
        uHeight: { value: extent[1] },
        uPixelRatio: { value: 1 },
        uAmbient: { value: ambient },
        uTint: { value: new THREE.Color(tint) },
        uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
        uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color()) },
        uLightCount: { value: 0 },
        uFogDensity: { value: 0.1 },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uHeight, uPixelRatio, uAmbient;
        uniform vec3 uLightPos[${MAX_LIGHTS}];
        uniform vec3 uLightColor[${MAX_LIGHTS}];
        uniform int uLightCount;
        uniform vec3 uTint;
        varying vec3 vColor;
        varying float vDepth;
        varying float vTwinkle;
        void main() {
          vec3 p = position;
          float s = seed * 6.2831;
          p.y = mod(p.y - uTime * (0.03 + seed * 0.05), uHeight);
          p.x += sin(uTime * 0.13 + s) * 0.35 + sin(uTime * 0.41 + s * 3.0) * 0.06;
          p.z += cos(uTime * 0.11 + s * 1.7) * 0.35;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vec3 glow = vec3(0.0);
          for (int i = 0; i < ${MAX_LIGHTS}; i++) {
            if (i >= uLightCount) break;
            float d = distance(world.xyz, uLightPos[i]);
            glow += uLightColor[i] / (1.0 + d * d * 6.0);
          }
          vColor = uTint * uAmbient + glow;
          vec4 mv = viewMatrix * world;
          vDepth = -mv.z;
          vTwinkle = 0.6 + 0.4 * sin(uTime * (1.0 + seed * 3.0) + s);
          gl_PointSize = (1.2 + seed * 2.6) * uPixelRatio * (8.0 / vDepth);
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
  }, [count, extent, ambient, tint])

  const flakes = useRef<THREE.InstancedMesh>(null!)
  const flakeData = useMemo(() => {
    const rng = createRng(31)
    return Array.from({ length: flakeCount }, () => ({
      p: new THREE.Vector3((rng() - 0.5) * extent[0] * 0.7, rng() * extent[1], (rng() - 0.5) * extent[2] * 0.7),
      s: 0.006 + rng() * 0.014,
      spin: new THREE.Vector3(rng(), rng(), rng()).multiplyScalar(0.6),
      fall: 0.02 + rng() * 0.03,
      phase: rng() * 10,
    }))
  }, [flakeCount, extent])
  const flakeGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), [])
  const tmp = useMemo(() => new THREE.Object3D(), [])

  useFrame(({ clock, scene }) => {
    const t = reduced ? 0 : clock.elapsedTime
    const u = material.uniforms
    u.uTime.value = t
    u.uPixelRatio.value = gl.getPixelRatio()
    if (scene.fog instanceof THREE.FogExp2) u.uFogDensity.value = scene.fog.density
    let i = 0
    for (const l of bioLights) {
      if (i >= MAX_LIGHTS) break
      l.object.getWorldPosition(u.uLightPos.value[i])
      u.uLightColor.value[i].copy(l.color).multiplyScalar(l.strength * 0.9)
      i++
    }
    u.uLightCount.value = i

    const H = extent[1]
    flakeData.forEach((f, k) => {
      tmp.position.set(
        f.p.x + Math.sin(t * 0.2 + f.phase) * 0.3,
        (((f.p.y - t * f.fall) % H) + H) % H,
        f.p.z + Math.cos(t * 0.17 + f.phase) * 0.3,
      )
      tmp.rotation.set(t * f.spin.x + f.phase, t * f.spin.y, t * f.spin.z)
      tmp.scale.set(f.s, f.s * 0.35, f.s * 0.8)
      tmp.updateMatrix()
      flakes.current.setMatrixAt(k, tmp.matrix)
    })
    flakes.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group position={center}>
      <points geometry={geometry} material={material} frustumCulled={false} />
      <instancedMesh ref={flakes} args={[flakeGeo, undefined, flakeCount]} receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#b9c8cc" roughness={0.7} emissive="#0a1a22" emissiveIntensity={0.4} />
      </instancedMesh>
    </group>
  )
}
