import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createRng } from '../lib/noise'
import { dive } from '../lib/dive'
import { liveAtmosphere } from '../scene/Atmosphere'
import { SITES, floorAt } from './world'

const PER_VENT = 170

/**
 * The four bubble-vent stations (oxygen + the way to the next zone): rising
 * columns of bubbles, faintly lit so they read even in the abyss.
 *
 * All four columns are ONE points draw call; each bubble's path is a
 * function of time in the vertex shader. Only the current zone's column is
 * drawn (the others collapse to nothing), and the whole thing is switched
 * off in film mode — it stays mounted so its shader is compiled with the
 * rest of the scene behind the loader.
 */
export function BubbleVents() {
  const gl = useThree((s) => s.gl)

  const { points, uniforms } = useMemo(() => {
    const rng = createRng(77)
    const n = PER_VENT * SITES.length
    const vent = new Float32Array(n)
    const seed = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      vent[i] = Math.floor(i / PER_VENT)
      seed[i * 2] = rng()
      seed[i * 2 + 1] = rng()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aVent', new THREE.BufferAttribute(vent, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2))
    const uniforms = {
      uTime: { value: 0 },
      uZone: { value: -1 },
      uBase: { value: SITES.map((s) => new THREE.Vector3(s.vent[0], s.floor, s.vent[1])) },
      uHeight: { value: SITES.map((s) => s.top - s.floor) },
      uColor: { value: new THREE.Color() },
      uPixelRatio: { value: 1 },
      uFogDensity: { value: 0.05 },
    }
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime, uZone, uPixelRatio;
        uniform vec3 uBase[4];
        uniform float uHeight[4];
        attribute float aVent;
        attribute vec2 aSeed;
        varying float vAlpha;
        varying float vDepth;
        varying float vGlow;
        void main() {
          int v = int(aVent + 0.5);
          if (abs(aVent - uZone) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          float H = uHeight[v];
          bool glow = aSeed.x < 0.05;
          vec3 p = uBase[v];
          float size;
          if (glow) {
            // the vent mouth: a few soft, breathing glows on the floor
            float a = aSeed.y * 6.2832;
            p += vec3(cos(a), 0.15, sin(a)) * (0.2 + aSeed.x * 8.0);
            vAlpha = 0.5 + 0.3 * sin(uTime * 1.7 + aSeed.y * 20.0);
            size = 26.0;
            vGlow = 1.0;
          } else {
            float speed = 0.9 + aSeed.y * 0.9;
            float h = mod(aSeed.x * H + uTime * speed, H);
            // the plume widens as it rises, each bubble spiralling a little
            float r = (0.2 + h / H * 1.0) * sqrt(aSeed.y);
            float a = aSeed.y * 40.0 + uTime * (0.8 + aSeed.x);
            p += vec3(cos(a) * r, h, sin(a) * r);
            p.x += sin(uTime * 2.3 + aSeed.x * 60.0) * 0.07;
            vAlpha = smoothstep(0.0, 0.6, h) * (1.0 - smoothstep(H - 1.5, H, h));
            size = 2.5 + aSeed.y * 4.0;
            vGlow = 0.0;
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vDepth = -mv.z;
          gl_PointSize = min(size * uPixelRatio * (6.0 / max(vDepth, 0.1)), 64.0 * uPixelRatio);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uFogDensity;
        varying float vAlpha;
        varying float vDepth;
        varying float vGlow;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          // bubbles: a bright rim and a hollow middle; glows: a soft disc
          float bubble = smoothstep(0.5, 0.36, r) * (0.35 + smoothstep(0.2, 0.42, r));
          float soft = pow(smoothstep(0.5, 0.0, r), 2.0);
          float a = mix(bubble, soft * 0.6, vGlow) * vAlpha;
          // lit bubbles carry further through the murk than the fog allows
          float fog = exp(-uFogDensity * uFogDensity * vDepth * vDepth * 0.45);
          gl_FragColor = vec4(uColor * a * fog, 1.0);
        }`,
    })
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    pts.renderOrder = 3
    return { points: pts, uniforms }
  }, [])

  const colors = useMemo(() => ['#dff8ff', '#7cc8ff', '#7fe4ff', '#5ff0e0'].map((c) => new THREE.Color(c).multiplyScalar(1.6)), [])

  useFrame(({ clock }) => {
    uniforms.uZone.value = dive.game ? Math.round(dive.stageF) : -1
    if (!dive.game) return
    uniforms.uTime.value = clock.elapsedTime
    uniforms.uPixelRatio.value = gl.getPixelRatio()
    uniforms.uFogDensity.value = liveAtmosphere.density
    const z = Math.round(dive.stageF)
    const s = SITES[z]
    // sit the column on the real seabed (the height field registers late)
    const base = uniforms.uBase.value[z]
    base.y = floorAt(z, s.vent[0], s.vent[1]) - 0.2
    uniforms.uHeight.value[z] = s.top - base.y
    uniforms.uColor.value.copy(colors[z])
  })

  return <primitive object={points} />
}
