import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { dive } from '../lib/dive'
import { useLoadingStore } from '../state/useLoadingStore'
import { zoneOverride } from './Zone'

const LABEL = 'ánh sáng các vùng biển'
const TOUR_LABEL = 'chuyến lặn thử'
/**
 * Points of the dive visited behind the loader: dense enough to hit every
 * hand-over between zones (meshes of one zone still visible under the next
 * zone's lights are their own shader variants).
 */
const TOUR = Array.from({ length: 26 }, (_, i) => i / 25)
const FRAMES_PER_STOP = 2

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/**
 * Nothing may be created lazily during the dive — every first time a zone
 * appeared used to compile shaders, upload textures and allocate render
 * targets mid-scroll (measured: +62 programs, +20 textures, +69 geometries
 * over one dive), which is exactly the stutter viewers felt.
 *
 * So, while the loader still covers the screen:
 *  1. compile all four lighting set-ups (compileAsync, parallel if the
 *     driver supports KHR_parallel_shader_compile);
 *  2. upload every texture in the scene (initTexture);
 *  3. take the real camera on a quick tour of the whole dive, rendering a
 *     few genuine frames at each stop — shadow passes, contact shadows,
 *     transmission, post-processing all get created at their real sizes.
 * Then hand the camera back to the scroll.
 */
export function ShaderPrewarm() {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    const loading = useLoadingStore.getState()
    loading.begin(LABEL)
    loading.begin(TOUR_LABEL)
    let cancelled = false
    const finish = () => {
      zoneOverride.value = -1
      dive.override = -1
      useLoadingStore.getState().end(LABEL)
      useLoadingStore.getState().end(TOUR_LABEL)
    }
    ;(async () => {
      // wait for every creature (procedural builds + models) to be in the scene
      for (;;) {
        await nextFrame()
        if (cancelled) return
        const tasks = Object.entries(useLoadingStore.getState().tasks)
        if (tasks.every(([k, done]) => k === LABEL || k === TOUR_LABEL || done)) break
      }
      for (let i = 0; i < 3; i++) await nextFrame() // let zones tag their lights

      // 1. programs, per lighting set-up
      for (const z of [0, 1, 2, 3]) {
        if (cancelled) return
        zoneOverride.value = z
        scene.traverse((o) => {
          if ((o as THREE.Light).isLight && o.userData.zone !== undefined) o.visible = o.userData.zone === z
        })
        await gl.compileAsync(scene, camera)
      }
      zoneOverride.value = -1
      useLoadingStore.getState().end(LABEL)

      // 2. textures
      const seen = new Set<THREE.Texture>()
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!m) return
        for (const mat of Array.isArray(m) ? m : [m]) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture && !seen.has(v)) seen.add(v)
          const u = (mat as THREE.ShaderMaterial).uniforms
          if (u) for (const { value } of Object.values(u)) if (value instanceof THREE.Texture) seen.add(value)
        }
      })
      seen.forEach((t) => gl.initTexture(t))

      // 3. the tour: real frames at every stop of the dive
      for (const p of TOUR) {
        if (cancelled) return
        dive.override = p
        for (let i = 0; i < FRAMES_PER_STOP; i++) await nextFrame()
      }
      dive.override = -1
      await nextFrame()
      await nextFrame()
      finish()
    })().catch(finish)
    return () => {
      cancelled = true
      zoneOverride.value = -1
      dive.override = -1
    }
  }, [gl, scene, camera])

  return null
}
