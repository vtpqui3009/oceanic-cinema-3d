import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { oceanAudio } from '../audio/OceanAudio'
import { activeZone, dive } from '../lib/dive'
import { DISCOVERY_BY_ID } from '../lib/discoveries'
import { celebration } from '../lib/bioluminescence'
import { damp } from '../lib/smooth'
import { spawnBurst } from '../scene/GlowBursts'
import { useExperienceStore } from '../state/useExperienceStore'
import { useSceneStore } from '../state/useSceneStore'
import { discoverables, hitTest, screenPosition } from './discoverables'
import { diverUniforms } from './diverLight'
import { cursorEl, hotspotEls } from './domRefs'
import { player, useGameStore } from '../game/useGameStore'

const TAP_MOVE = 8
const TAP_MS = 400
/** Elements that own their own clicks (UI), so taps on them never reach the sea. */
const UI_SELECTOR = 'button, a, input, [role="dialog"], .logbook, .card, .endcard, .gauge__nav, .sound'

/**
 * All pointer interaction for the 3D world, without making the canvas
 * capture events (so touch scrolling is never blocked):
 *  - hover: custom cursor + "Khám phá" label over creatures (mouse only);
 *  - tap/click on a creature: discovery card; on open water: glow burst;
 *  - the diver's torch follows the mouse and lights/parts the particles;
 *  - hint rings over undiscovered creatures of the current zone;
 *  - feeds the depth to the score (10×/s) and bubbles on fast dives.
 */
export function Interaction() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const reduced = useSceneStore((s) => s.reducedMotion)

  const st = useMemo(
    () => ({
      x: -1, y: -1, moved: false, lastMove: -10, mouse: false,
      downX: 0, downY: 0, downT: 0, downId: -1,
      ray: new THREE.Vector3(), target: new THREE.Vector3(0, -9999, 0), torch: 0,
      audioTick: 0, lastP: 0, lastBubble: 0, pos: { x: 0, y: 0 },
    }),
    [],
  )

  // dev-only handles for the automated interaction tests
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __explore: { discoverables, hitTest, audio: oceanAudio, camera } })
  }, [camera])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      st.x = e.clientX
      st.y = e.clientY
      st.mouse = e.pointerType === 'mouse'
      st.moved = true
      st.lastMove = performance.now() / 1000
      const c = cursorEl.current
      if (st.mouse && c) {
        c.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`
        if (c.style.opacity !== '1') c.style.opacity = '1'
      }
    }
    const onDown = (e: PointerEvent) => {
      st.downX = e.clientX
      st.downY = e.clientY
      st.downT = performance.now()
      st.downId = e.pointerId
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== st.downId) return
      st.downId = -1
      const isTap = Math.hypot(e.clientX - st.downX, e.clientY - st.downY) < TAP_MOVE && performance.now() - st.downT < TAP_MS
      if (!isTap || e.button > 0) return
      if (useExperienceStore.getState().mode === 'game') return // the shutter owns clicks
      if ((e.target as Element | null)?.closest?.(UI_SELECTOR)) return
      tap(e.clientX, e.clientY, e.pointerType !== 'mouse')
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size])

  /** A point in the water `dist` in front of the camera, under the pointer. */
  const pointOnRay = (x: number, y: number, dist: number, out: THREE.Vector3) => {
    out.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize()
    return out.multiplyScalar(dist).add(camera.position)
  }

  const tap = (x: number, y: number, touch: boolean) => {
    const exp = useExperienceStore.getState()
    if (!exp.started) return
    // a tap outside an open card just closes it
    if (exp.open || exp.logbook) {
      exp.setOpen(null)
      oceanAudio.ui(false)
      return
    }
    const zone = activeZone(dive.stageF)
    const hit = hitTest(x, y, camera, size.width, size.height, zone, performance.now() / 1000)
    if (hit) {
      const isNew = exp.discover(hit.id)
      exp.setOpen(hit.id)
      if (isNew) oceanAudio.discover()
      else oceanAudio.revisit()
      spawnBurst(hit.world, DISCOVERY_BY_ID[hit.id].zone, 0.9)
      if (useExperienceStore.getState().found.length === Object.keys(DISCOVERY_BY_ID).length && isNew) {
        window.setTimeout(() => {
          celebration.start = performance.now() / 1000
          for (let i = 0; i < 6; i++) spawnBurst(pointOnRay(size.width * (0.2 + i * 0.12), size.height * (0.35 + (i % 2) * 0.25), 3.5, new THREE.Vector3()), zone, 1.3)
          oceanAudio.complete()
          useExperienceStore.getState().setLogbook(true)
        }, 1600)
      }
      return
    }
    // open water: a bloom of plankton light (bubbles in the shallows)
    const at = pointOnRay(x, y, 3.2, st.ray)
    spawnBurst(at, zone, reduced ? 0.6 : 1)
    if (zone === 0) oceanAudio.bubbles(5)
    else oceanAudio.sparkle(zone)
    if (touch && !reduced) {
      try {
        navigator.vibrate?.(8)
      } catch {
        /* not supported */
      }
    }
  }

  useFrame((_, delta) => {
    const exp = useExperienceStore.getState()
    const now = performance.now() / 1000
    const dt = Math.min(delta, 0.1)
    const zone = activeZone(dive.stageF)
    const game = exp.mode === 'game'

    // --- torch: mouse only, fades out when the pointer rests ------------
    // (explore mode: the submarine's lamp, driven by the player controller)
    if (!game) {
      const alive = st.mouse && now - st.lastMove < 2.5 && exp.started && !exp.open && !exp.logbook
      st.torch = damp(st.torch, alive ? 1 : 0, alive ? 4 : 1.2, dt)
      diverUniforms.uDiverStrength.value = st.torch
      if (st.torch > 0.001 && st.x >= 0) {
        pointOnRay(st.x, st.y, 4, st.ray)
        if (st.target.y < -9000) st.target.copy(st.ray)
        st.target.lerp(st.ray, 1 - Math.exp(-12 * dt))
        diverUniforms.uDiverPos.value.copy(st.target)
      }
    }

    // --- hover (only when the pointer moved) -----------------------------
    if (st.moved && st.mouse && !game) {
      st.moved = false
      const hit = exp.started && !exp.open && !exp.logbook ? hitTest(st.x, st.y, camera, size.width, size.height, zone, now) : null
      const id = hit?.id ?? null
      if (id !== exp.hover) exp.setHover(id)
    }

    // --- hint rings over undiscovered creatures in view --------------------
    // explore mode: only while the sonar pulse lasts, for species not yet photographed
    const showHints = exp.started && !exp.open && !exp.logbook && (game ? now < player.sonarUntil : dive.p > 0.035)
    const photos = game ? useGameStore.getState().photos : null
    let used = 0
    if (showHints) {
      for (const [id, d] of discoverables) {
        if (used >= hotspotEls.length) break
        if (photos ? photos[id] : exp.found.includes(id)) continue
        if (d.zone !== null && d.zone !== zone) continue
        if (d.active && !d.active()) continue
        if (!screenPosition(d, camera, size.width, size.height, now, st.pos)) continue
        const el = hotspotEls[used++]
        if (!el) continue
        el.style.transform = `translate3d(${st.pos.x}px, ${st.pos.y}px, 0)`
        el.style.opacity = '1'
      }
    }
    for (let i = used; i < hotspotEls.length; i++) {
      const el = hotspotEls[i]
      if (el && el.style.opacity !== '0') el.style.opacity = '0'
    }

    // --- score follows the depth (10×/s); bubbles on a fast descent -------
    st.audioTick += dt
    if (st.audioTick > 0.1) {
      const speed = Math.abs(dive.p - st.lastP) / st.audioTick
      st.lastP = dive.p
      st.audioTick = 0
      oceanAudio.setDepth(dive.stageF)
      if (!game && speed > 0.05 && dive.stageF < 0.6 && now - st.lastBubble > 0.7) {
        st.lastBubble = now
        oceanAudio.bubbles(3)
      }
    }

    const ending = !game && dive.p > 0.965
    if (ending !== exp.ending) exp.setEnding(ending)
  })

  return null
}
