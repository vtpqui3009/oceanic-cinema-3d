import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createRng } from '../lib/noise'
import { useSceneStore } from '../state/useSceneStore'
import { liveAtmosphere } from './Atmosphere'

const SLOTS = 8
const PER_BURST = 140
const LIFE = 3.2

/** Colour and drift per zone: silver bubbles up top, plankton light below. */
const ZONE_STYLE: { color: THREE.Color; gravity: number }[] = [
  { color: new THREE.Color('#e8fbff').multiplyScalar(2.4), gravity: 0.7 }, // bubbles rise
  { color: new THREE.Color('#5fb4ff').multiplyScalar(3.2), gravity: -0.08 },
  { color: new THREE.Color('#9a7bff').multiplyScalar(3.2), gravity: -0.06 },
  { color: new THREE.Color('#4ff2e6').multiplyScalar(3.6), gravity: -0.05 },
]

const uniforms = {
  uTime: { value: 0 },
  uOrigin: { value: Array.from({ length: SLOTS }, () => new THREE.Vector3(0, -9999, 0)) },
  uStart: { value: new Array(SLOTS).fill(-100) as number[] },
  uColor: { value: Array.from({ length: SLOTS }, () => new THREE.Color()) },
  uGravity: { value: new Array(SLOTS).fill(0) as number[] },
  uScale: { value: new Array(SLOTS).fill(1) as number[] },
  uPixelRatio: { value: 1 },
  uFogDensity: { value: 0.05 },
}
let slot = 0

/**
 * Spawn a burst of bioluminescence (or bubbles in the shallows). No
 * allocation and no buffer upload: it only writes one slot of uniforms.
 */
export function spawnBurst(at: THREE.Vector3, zone: number, scale = 1) {
  const s = ZONE_STYLE[Math.max(0, Math.min(3, zone))]
  uniforms.uOrigin.value[slot].copy(at)
  uniforms.uStart.value[slot] = uniforms.uTime.value
  uniforms.uColor.value[slot].copy(s.color)
  uniforms.uGravity.value[slot] = s.gravity
  uniforms.uScale.value[slot] = scale
  slot = (slot + 1) % SLOTS
}

/**
 * A fixed pool of 8 bursts × 140 particles in ONE points draw call; every
 * particle's motion is a function of time since its slot was triggered.
 */
export function GlowBursts() {
  const gl = useThree((s) => s.gl)
  const reduced = useSceneStore((s) => s.reducedMotion)

  const points = useMemo(() => {
    const rng = createRng(123)
    const n = SLOTS * PER_BURST
    const slotAttr = new Float32Array(n)
    const dir = new Float32Array(n * 3)
    const seed = new Float32Array(n)
    const v = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      slotAttr[i] = Math.floor(i / PER_BURST)
      v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      while (v.lengthSq() > 1 || v.lengthSq() < 0.01) v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1)
      v.normalize().multiplyScalar(0.3 + Math.pow(rng(), 0.6) * 0.9)
      dir.set([v.x, v.y, v.z], i * 3)
      seed[i] = rng()
    }
    const g = new THREE.BufferGeometry()
    // positions are computed in the shader; the attribute only sets the count
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aSlot', new THREE.BufferAttribute(slotAttr, 1))
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: /* glsl */ `
        #define SLOTS ${SLOTS}
        uniform float uTime, uPixelRatio;
        uniform vec3 uOrigin[SLOTS];
        uniform float uStart[SLOTS];
        uniform vec3 uColor[SLOTS];
        uniform float uGravity[SLOTS];
        uniform float uScale[SLOTS];
        attribute float aSlot, aSeed;
        attribute vec3 aDir;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        void main() {
          int s = int(aSlot + 0.5);
          float age = uTime - uStart[s] - aSeed * 0.25;
          if (age < 0.0 || age > ${LIFE.toFixed(1)}) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          float spread = 1.0 - exp(-age * 2.4);
          vec3 d = aDir * uScale[s];
          // a slow spiral as the cloud blooms outwards
          float a = age * (0.6 + aSeed) ;
          vec3 swirl = vec3(cos(a + aSeed * 30.0), 0.0, sin(a + aSeed * 30.0)) * 0.12 * spread;
          vec3 p = uOrigin[s] + d * spread * 0.55 + swirl * 0.5 + vec3(0.0, uGravity[s] * age * (0.6 + aSeed), 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          float flicker = 0.65 + 0.35 * sin(age * (9.0 + aSeed * 14.0) + aSeed * 40.0);
          // a bright flash at the heart, then the cloud lingers and fades
          float flash = aSeed < 0.06 ? 3.0 * exp(-age * 5.0) : 0.0;
          vAlpha = (exp(-age * 1.1) * flicker + flash) * smoothstep(0.0, 0.05, age);
          vColor = uColor[s];
          float big = aSeed < 0.06 ? 5.0 : 1.0;
          gl_PointSize = min((2.0 + aSeed * 3.5) * big * uPixelRatio * (8.0 / max(vDepth, 0.1)), 40.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFogDensity;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.5, 0.0, r);
          float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth);
          gl_FragColor = vec4(vColor * core * core * vAlpha * fog, 1.0);
        }`,
    })
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    pts.renderOrder = 3
    return pts
  }, [])

  useFrame(({ clock }) => {
    // reduced motion: bursts bloom at a third of the speed
    uniforms.uTime.value = reduced ? clock.elapsedTime * 0.35 : clock.elapsedTime
    uniforms.uPixelRatio.value = gl.getPixelRatio()
    uniforms.uFogDensity.value = liveAtmosphere.density
  })

  return <primitive object={points} />
}
