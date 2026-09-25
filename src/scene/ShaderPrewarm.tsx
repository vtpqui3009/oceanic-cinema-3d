import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useLoadingStore } from '../state/useLoadingStore'
import { zoneOverride } from './Zone'

const LABEL = 'shader ánh sáng'

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/**
 * Every zone lights the scene differently (different light counts and
 * shadow casters), which in WebGL means different shader programs. Compiling
 * those lazily froze the page for seconds on the way down. Instead, once all
 * creatures exist, compile all four lighting set-ups while the loader is
 * still up (in parallel where KHR_parallel_shader_compile is available).
 */
export function ShaderPrewarm() {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    const loading = useLoadingStore.getState()
    loading.begin(LABEL)
    let cancelled = false
    ;(async () => {
      // wait for every creature (procedural builds + models) to be in the scene
      for (;;) {
        await nextFrame()
        if (cancelled) return
        const tasks = Object.entries(useLoadingStore.getState().tasks)
        if (tasks.every(([k, done]) => k === LABEL || done)) break
      }
      for (let i = 0; i < 3; i++) await nextFrame() // let zones tag their lights
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
    })().catch(() => {
      zoneOverride.value = -1
      useLoadingStore.getState().end(LABEL)
    })
    return () => {
      cancelled = true
      zoneOverride.value = -1
    }
  }, [gl, scene, camera])

  return null
}
