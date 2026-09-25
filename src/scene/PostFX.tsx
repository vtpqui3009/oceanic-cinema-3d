import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, ChromaticAberration, EffectComposer, FXAA, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction, DepthOfFieldEffect, Effect, VignetteEffect } from 'postprocessing'
import * as THREE from 'three'
import { dive, subjects } from '../lib/dive'
import { smoothstep } from '../lib/noise'
import { useSceneStore } from '../state/useSceneStore'
import { liveAtmosphere } from './Atmosphere'

/**
 * Exposure + filmic tone mapping + depth-aware colour grade in one pass.
 * The composer renders linear HDR (renderer tone mapping is off), so bloom
 * sees real over-bright bioluminescence before we compress it here.
 *
 * Grade: split-toning towards a deep blue-green in the shadows and a cool
 * aqua in the highlights; with depth, saturation and lift fall away so the
 * abyss settles into near-black with only the creatures' light left.
 */
const gradeFragment = /* glsl */ `
uniform float uExposure;
uniform float uDepth;

vec3 acesFitted(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = acesFitted(inputColor.rgb * uExposure);

  // work on a perceptual curve for the grade
  vec3 g = pow(c, vec3(1.0 / 2.2));
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));

  // split toning: teal-green shadows, cool aqua highlights
  vec3 shadowTint = mix(vec3(0.02, 0.06, 0.07), vec3(0.0, 0.015, 0.035), uDepth);
  vec3 highTint = vec3(-0.02, 0.015, 0.03);
  g += shadowTint * (1.0 - smoothstep(0.0, 0.55, l));
  g += highTint * smoothstep(0.45, 1.0, l);

  // contrast S-curve, stronger in the deep
  float k = mix(1.06, 1.18, uDepth);
  g = clamp((g - 0.5) * k + 0.5, 0.0, 1.0);

  // saturation falls with depth (the eye loses colour in the dark), except
  // for the brightest bioluminescent cores
  float sat = mix(1.02, 0.78, uDepth) + smoothstep(0.6, 1.0, l) * 0.2 * uDepth;
  g = mix(vec3(l), g, sat);

  // crush the blacks towards ink in the abyss
  g = max(g - 0.015 * uDepth, 0.0) / (1.0 - 0.015 * uDepth);

  outputColor = vec4(pow(g, vec3(2.2)), inputColor.a);
}
`

/** `?fx=0` renders without post-processing (profiling). */
const NO_FX = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fx') === '0'

class FilmGradeEffect extends Effect {
  constructor() {
    super('FilmGradeEffect', gradeFragment, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(1)],
        ['uDepth', new THREE.Uniform(0)],
      ]),
    })
  }
}

/**
 * The lens and the lab: bloom so bioluminescence actually blooms, depth of
 * field locked onto the current creature, vignette that tightens with
 * depth, a hair of chromatic aberration and fine film grain.
 */
export function PostFX() {
  const quality = useSceneStore((s) => s.quality)
  const camera = useThree((s) => s.camera)
  const degraded = useSceneStore((s) => s.degraded)
  const hi = quality === 'high' && !degraded

  const grade = useMemo(() => new FilmGradeEffect(), [])
  const focus = useMemo(() => new THREE.Vector3(), [])
  const dof = useMemo(() => {
    if (!hi) return null
    // CoC = smoothstep(0, focusRange, |distance − focus|) in world units: a wide
    // range keeps the whole creature sharp and only melts the far water
    const e = new DepthOfFieldEffect(camera, { focusRange: 6.5, bokehScale: 2.2, resolutionScale: 0.4 })
    e.target = focus
    return e
  }, [camera, hi, focus])
  const vignette = useMemo(() => ({ current: null as VignetteEffect | null }), [])
  const want = useMemo(() => new THREE.Vector3(), [])
  const dir = useMemo(() => new THREE.Vector3(), [])
  const bloomRef = useMemo(() => ({ current: null as { intensity: number } | null }), [])

  useFrame((_, delta) => {
    const s = dive.stageF
    const depth = s / 3
    grade.uniforms.get('uExposure')!.value = liveAtmosphere.exposure
    grade.uniforms.get('uDepth')!.value = smoothstep(0, 1, depth)

    // bioluminescence matters more the darker it gets
    if (bloomRef.current) bloomRef.current.intensity = THREE.MathUtils.lerp(0.5, 1.15, smoothstep(0.3, 3, s))
    if (vignette.current) vignette.current.darkness = THREE.MathUtils.lerp(0.42, 0.82, smoothstep(0, 3, s))

    // pull focus onto the nearest stage's subject; open water between stages
    const subject = subjects[Math.round(s)]
    if (subject) want.copy(subject)
    else want.copy(camera.position).add(camera.getWorldDirection(dir).multiplyScalar(6))
    // rack focus smoothly, but cut straight to it after a big jump (new zone)
    if (focus.distanceToSquared(want) > 16) focus.copy(want)
    else focus.lerp(want, 1 - Math.exp(-5 * Math.min(delta, 0.1)))
  })

  if (NO_FX) return null
  return (
    // no MSAA on the half-float HDR target (costly resolve); FXAA at the end of
    // the merged effect pass is nearly free
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {dof ? <primitive object={dof} dispose={null} /> : <></>}
      <Bloom
        ref={(b: unknown) => void (bloomRef.current = b as { intensity: number } | null)}
        mipmapBlur
        luminanceThreshold={0.9}
        luminanceSmoothing={0.2}
        intensity={1}
        radius={0.78}
        levels={hi ? 6 : 5}
      />
      <primitive object={grade} dispose={null} />
      {/* anti-alias before grain/aberration so they stay crisp */}
      <FXAA />
      <ChromaticAberration
        offset={new THREE.Vector2(0.0007, 0.0005)}
        radialModulation
        modulationOffset={0.35}
        blendFunction={BlendFunction.NORMAL}
      />
      <Vignette ref={(v: unknown) => void (vignette.current = v as VignetteEffect | null)} offset={0.28} darkness={0.5} />
      <Noise blendFunction={BlendFunction.OVERLAY} opacity={0.09} />
    </EffectComposer>
  )
}
