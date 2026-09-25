import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { Atmosphere } from './Atmosphere'
import { CameraRig } from './CameraRig'
import { DeepEnvironment } from './DeepEnvironment'
import { MarineSnow } from './MarineSnow'
import { ShallowsScene } from '../scenes/ShallowsScene'
import { TwilightScene } from '../scenes/TwilightScene'
import { MidnightScene } from '../scenes/MidnightScene'
import { AbyssScene } from '../scenes/AbyssScene'
import { PostFX } from './PostFX'
import { ShaderPrewarm } from './ShaderPrewarm'
import { useSceneStore } from '../state/useSceneStore'

export function Experience() {
  const quality = useSceneStore((s) => s.quality)
  const setDegraded = useSceneStore((s) => s.setDegraded)
  // resolution follows the measured frame rate between these bounds
  // everything is post-processed at full screen size, so resolution is the
  // main cost: cap it, start low and let the monitor raise it if there's room
  const maxDpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, quality === 'high' ? 1.5 : 1.25)
  const minDpr = quality === 'high' ? 0.85 : 0.65
  const [dpr, setDpr] = useState(Math.min(maxDpr, 1))
  return (
    <Canvas
      className="stage"
      // purely cinematic: let every touch/scroll gesture reach the page
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      // PCF soft shadows. three r182+ removed PCFSoftShadowMap (it now logs a
      // warning and falls back); PCFShadowMap gained Vogel-disk soft filtering
      // driven by `shadow.radius`, which is the soft path we use everywhere.
      shadows={{ enabled: true, type: THREE.PCFShadowMap }}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 6.5, 13], fov: 38, near: 0.05, far: 140 }}
      // tone mapping + grading happen in <PostFX/> (FilmGradeEffect)
      onCreated={({ gl, scene, camera }) => {
        // skip per-program error queries in production (faster compiles, and no
        // noise from harmless driver warnings such as D3D's X4122)
        gl.debug.checkShaderErrors = import.meta.env.DEV
        // the jelly bell's refraction doesn't need a full-resolution copy of the scene
        gl.transmissionResolutionScale = 0.5
        if (import.meta.env.DEV) Object.assign(window, { __three: { gl, scene, camera } })
      }}
    >
      <PerformanceMonitor
        flipflops={4}
        onChange={({ factor }) => setDpr(Math.round((minDpr + (maxDpr - minDpr) * factor) * 10) / 10)}
        onFallback={() => {
          setDpr(minDpr)
          setDegraded(true)
        }}
      />
      <Atmosphere />
      <DeepEnvironment />
      <CameraRig />
      <ShallowsScene />
      <TwilightScene />
      <MidnightScene />
      <AbyssScene />
      <MarineSnow />
      <PostFX />
      <ShaderPrewarm />
    </Canvas>
  )
}
