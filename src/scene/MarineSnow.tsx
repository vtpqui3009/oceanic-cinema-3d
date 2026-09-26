import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { bioLights } from '../lib/bioluminescence'
import { createRng } from '../lib/noise'
import { useSceneStore } from '../state/useSceneStore'
import { liveAtmosphere } from './Atmosphere'
import { DIVER_GLSL, diverUniforms } from '../interaction/diverLight'
import { dive } from '../lib/dive'

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
        uBubbles: { value: 1 },
        ...diverUniforms,
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uPixelRatio, uAmbient;
        uniform vec3 uExtent, uCam;
        uniform vec3 uLightPos[${MAX_LIGHTS}];
        uniform vec3 uLightColor[${MAX_LIGHTS}];
        uniform int uLightCount;
        uniform vec3 uTint;
        uniform float uBubbles;
        ${DIVER_GLSL}
        varying vec3 vColor;
        varying float vDepth;
        varying float vTwinkle;
        void main() {
          float s = seed * 6.2831;
          vec3 p = position;
          // near the surface ~7% of the motes are rising air bubbles instead
          float bub = step(seed, 0.07) * uBubbles;
          p.y += mix(-uTime * (0.03 + seed * 0.05), uTime * (0.5 + seed * 6.0), bub);
          p.x += bub * sin(uTime * 3.0 + s * 9.0) * 0.05;
          p.x += sin(uTime * 0.13 + s) * 0.35 + sin(uTime * 0.41 + s * 3.0) * 0.06;
          p.z += cos(uTime * 0.11 + s * 1.7) * 0.35;
          // wrap the box around the camera
          vec3 world = mod(p - uCam + uExtent * 0.5, uExtent) - uExtent * 0.5 + uCam;
          // the diver's torch lights the motes and gently parts them
          world += diverPush(world, 0.9, 0.35);
          vec3 glow = vec3(0.55, 0.85, 1.0) * diverFalloff(world, 0.7) * 1.3 + vec3(0.6, 0.8, 0.9) * bub * 0.5;
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

  // real, lit flakes — placed, spun and wrapped around the camera entirely in
  // the vertex shader (no per-flake CPU work, no matrix upload per frame)
  const flakes = useMemo(() => {
    const rng = createRng(31)
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const a = new Float32Array(flakeCount * 4)
    const b = new Float32Array(flakeCount * 4)
    for (let k = 0; k < flakeCount; k++) {
      a.set([rng() * EXTENT.x, rng() * EXTENT.y, rng() * EXTENT.z, 0.006 + rng() * 0.014], k * 4)
      b.set([0.02 + rng() * 0.03, rng() * 10, rng() * 0.6, rng() * 0.6], k * 4)
    }
    geo.setAttribute('aFlakeA', new THREE.InstancedBufferAttribute(a, 4))
    geo.setAttribute('aFlakeB', new THREE.InstancedBufferAttribute(b, 4))
    const mat = new THREE.MeshStandardMaterial({ color: '#b9c8cc', roughness: 0.7, emissive: '#0a1a22', emissiveIntensity: 0.4 })
    const box = EXTENT.clone().multiplyScalar(0.6)
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = material.uniforms.uTime
      shader.uniforms.uCam = material.uniforms.uCam
      shader.uniforms.uBox = { value: box }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          uniform float uTime; uniform vec3 uCam; uniform vec3 uBox;
          attribute vec4 aFlakeA; attribute vec4 aFlakeB;
          mat3 flakeRot() {
            vec3 r = vec3(uTime * aFlakeB.z + aFlakeB.y, uTime * aFlakeB.w, uTime * 0.3);
            float cx = cos(r.x), sx = sin(r.x), cy = cos(r.y), sy = sin(r.y), cz = cos(r.z), sz = sin(r.z);
            return mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy) * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx) * mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0);
          }`,
        )
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = flakeRot() * objectNormal;')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          {
            vec3 p = aFlakeA.xyz * 0.6 + vec3(sin(uTime * 0.2 + aFlakeB.y) * 0.3, -uTime * aFlakeB.x, cos(uTime * 0.17 + aFlakeB.y) * 0.3);
            vec3 w = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
            // never let a flake sit right in front of the lens
            float near = smoothstep(2.2, 3.6, distance(w, uCam));
            transformed = flakeRot() * (transformed * vec3(1.0, 0.35, 0.8) * aFlakeA.w * near) + w;
          }`,
        )
    }
    mat.customProgramCacheKey = () => 'marine-flakes'
    const mesh = new THREE.InstancedMesh(geo, mat, flakeCount)
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    return mesh
  }, [flakeCount, material])

  useFrame(({ clock, camera }) => {
    const t = reduced ? 0 : clock.elapsedTime
    const u = material.uniforms
    u.uTime.value = t
    u.uCam.value.copy(camera.position)
    u.uPixelRatio.value = gl.getPixelRatio()
    u.uAmbient.value = liveAtmosphere.snow
    u.uFogDensity.value = liveAtmosphere.density
    u.uBubbles.value = Math.max(0, 1 - dive.stageF * 1.6)
    let i = 0
    for (const l of bioLights) {
      if (i >= MAX_LIGHTS) break
      if (l.strength <= 0.001) continue
      l.object.getWorldPosition(u.uLightPos.value[i])
      u.uLightColor.value[i].copy(l.color).multiplyScalar(l.strength * 0.9)
      i++
    }
    u.uLightCount.value = i

  })

  return (
    <group>
      <points geometry={geometry} material={material} frustumCulled={false} />
      <primitive object={flakes} />
    </group>
  )
}
