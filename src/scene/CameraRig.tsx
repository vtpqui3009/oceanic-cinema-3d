import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  SQUID_PATH, ZONE_Y, depthFromP, dive, holdWeight, scrollProxy, squidProgress, stageFromP, subjects, trackingWeight,
} from '../lib/dive'
import { useSceneStore } from '../state/useSceneStore'

gsap.registerPlugin(ScrollTrigger)

/** `?p=0.65` pins the dive at a point (review links, screenshots). */
const PINNED_P = (() => {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('p')
  return v === null ? null : Math.min(1, Math.max(0, Number(v)))
})()

type V3 = [number, number, number]
interface Key {
  p: number
  pos: V3
  target: V3
  fov: number
  /** Camera settles (eases to a stop) on this key — a held shot. */
  hold?: boolean
  /** Stage whose hero shot this is (used for reduced-motion cuts). */
  stage?: number
}

const [, Y1, Y2, Y3] = ZONE_Y

/**
 * The shot list. Held keys are the "hero" framings of each creature; the keys
 * between them are the descent through open water.
 */
const KEYS: Key[] = [
  { p: 0.0, pos: [0, 6.5, 13], target: [0, 2.5, 0], fov: 38, hold: true },
  { p: 0.1, pos: [5.2, 0.9, 7.5], target: [0, 0.4, 0], fov: 34, hold: true, stage: 0 },
  { p: 0.2, pos: [-3.2, -3.2, 6.4], target: [0, -1.2, 0], fov: 36 },
  { p: 0.29, pos: [-0.8, Y1 + 24, 9], target: [0, Y1 + 4, 0], fov: 40 },
  { p: 0.4, pos: [2.4, Y1 + 0.2, 5.4], target: [0, Y1 - 0.5, 0], fov: 32, hold: true, stage: 1 },
  { p: 0.47, pos: [-3.2, Y1 - 3.4, 3.2], target: [0, Y1 - 0.9, 0], fov: 34 },
  { p: 0.53, pos: [2.2, Y2 + 4.5, 11.5], target: [0.4, Y2 + 2, 5], fov: 36 },
  { p: 0.65, pos: [1.8, Y2 + 1.8, 0.5], target: [0.5, Y2 + 0.7, -7], fov: 34, stage: 2 },
  { p: 0.77, pos: [1.2, Y2 + 0.4, -12], target: [0, Y2 - 0.6, -19], fov: 34 },
  { p: 0.84, pos: [2.5, Y3 + 14, 8], target: [0.2, Y3 + 1, 0], fov: 38 },
  { p: 0.92, pos: [3.3, Y3 + 1.25, 4.6], target: [0.2, Y3 + 0.95, 0.3], fov: 30, hold: true, stage: 3 },
  { p: 1.0, pos: [1.7, Y3 + 1.15, 2.7], target: [0, Y3 + 1.2, 0.8], fov: 28, hold: true },
]

const easeIn = (s: number) => 1 - Math.cos((s * Math.PI) / 2)
const easeOut = (s: number) => Math.sin((s * Math.PI) / 2)
const easeInOut = (s: number) => -(Math.cos(Math.PI * s) - 1) / 2

const v = (a: V3) => new THREE.Vector3(...a)
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => v(k.pos)), false, 'centripetal')
const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => v(k.target)), false, 'centripetal')

function samplePath(p: number, pos: THREE.Vector3, tgt: THREE.Vector3) {
  let i = 0
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++
  const a = KEYS[i], b = KEYS[i + 1]
  let s = THREE.MathUtils.clamp((p - a.p) / (b.p - a.p), 0, 1)
  s = a.hold && b.hold ? easeInOut(s) : b.hold ? easeOut(s) : a.hold ? easeIn(s) : s
  const u = (i + s) / (KEYS.length - 1)
  posCurve.getPoint(u, pos)
  tgtCurve.getPoint(u, tgt)
  return THREE.MathUtils.lerp(a.fov, b.fov, s)
}

/** Tracking shot: behind, above and off to the side of the swimming squid. */
function sampleTracking(p: number, pos: THREE.Vector3, tgt: THREE.Vector3) {
  const u = squidProgress(p)
  const at = SQUID_PATH.getPointAt(u)
  const fwd = SQUID_PATH.getTangentAt(u).normalize()
  const side = new THREE.Vector3().crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize()
  pos.copy(at).addScaledVector(fwd, -5.2).addScaledVector(side, 2.3).add(new THREE.Vector3(0, 1.4, 0))
  tgt.copy(at).addScaledVector(fwd, 0.6)
}

/**
 * Scroll → camera. GSAP ScrollTrigger scrubs a proxy value (the first layer
 * of easing); the rig then follows the sampled path with critically-damped
 * smoothing and a slow "breathing" drift, so it feels like floating, never
 * like a dolly on rails.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const reduced = useSceneStore((s) => s.reducedMotion)
  const setStage = useSceneStore((s) => s.setStage)
  const setIntro = useSceneStore((s) => s.setIntro)

  const tmp = useMemo(
    () => ({
      pos: new THREE.Vector3(), tgt: new THREE.Vector3(), tPos: new THREE.Vector3(), tTgt: new THREE.Vector3(),
      curTgt: new THREE.Vector3(), started: false,
    }),
    [],
  )

  useEffect(() => {
    const tween = gsap.to(scrollProxy, {
      p: 1,
      ease: 'none',
      scrollTrigger: { trigger: '.dive', start: 'top top', end: 'bottom bottom', scrub: reduced ? true : 1.4 },
    })
    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [reduced])

  useFrame(({ clock }, dt) => {
    const pinned = PINNED_P !== null
    const p = pinned ? PINNED_P : scrollProxy.p
    dive.p = p
    dive.stageF = stageFromP(p)
    dive.depth = depthFromP(p)

    const stage = Math.round(dive.stageF)
    const store = useSceneStore.getState()
    if (store.stage !== stage) setStage(stage)
    const intro = p < 0.035
    if (store.intro !== intro) setIntro(intro)

    let fov: number
    if (reduced) {
      // no camera travel: hard cut to each creature's hero shot
      const key = KEYS.find((k) => k.stage === stage)!
      tmp.pos.set(...key.pos)
      tmp.tgt.set(...key.target)
      fov = key.fov
      camera.position.copy(tmp.pos)
      tmp.curTgt.copy(tmp.tgt)
    } else {
      fov = samplePath(p, tmp.pos, tmp.tgt)
      const w = trackingWeight(p)
      if (w > 0) {
        sampleTracking(p, tmp.tPos, tmp.tTgt)
        tmp.pos.lerp(tmp.tPos, w)
        tmp.tgt.lerp(tmp.tTgt, w)
      }
      // keep living subjects framed: aim (and drift a little) towards them
      for (const i of [0, 1]) {
        const s = subjects[i]
        const h = s ? holdWeight(i, p) : 0
        if (h <= 0 || !s) continue
        tmp.tTgt.copy(s).sub(tmp.tgt)
        tmp.tgt.addScaledVector(tmp.tTgt, h * 0.75)
        tmp.pos.addScaledVector(tmp.tTgt, h * 0.35)
      }
      // slow, non-repeating drift — a diver's breathing, not a tripod
      const t = clock.elapsedTime
      tmp.pos.x += Math.sin(t * 0.31) * 0.08 + Math.sin(t * 0.73 + 1) * 0.03
      tmp.pos.y += Math.sin(t * 0.23 + 2) * 0.07
      tmp.tgt.x += Math.sin(t * 0.19 + 4) * 0.04

      if (!tmp.started || pinned) {
        camera.position.copy(tmp.pos)
        tmp.curTgt.copy(tmp.tgt)
        tmp.started = true
      }
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 2.6)
      camera.position.lerp(tmp.pos, k)
      tmp.curTgt.lerp(tmp.tgt, k)
    }
    camera.lookAt(tmp.curTgt)
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * (reduced ? 1 : 0.08)
      camera.updateProjectionMatrix()
    }
  })

  return null
}

