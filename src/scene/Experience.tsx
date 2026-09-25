import { Canvas } from '@react-three/fiber'
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
import { useSceneStore } from '../state/useSceneStore'

export function Experience() {
  const quality = useSceneStore((s) => s.quality)
  return (
    <Canvas
      className="stage"
      // PCF soft shadows. three r182+ removed PCFSoftShadowMap (it now logs a
      // warning and falls back); PCFShadowMap gained Vogel-disk soft filtering
      // driven by `shadow.radius`, which is the soft path we use everywhere.
      shadows={{ enabled: true, type: THREE.PCFShadowMap }}
      dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 6.5, 13], fov: 38, near: 0.05, far: 140 }}
      // tone mapping + grading happen in <PostFX/> (FilmGradeEffect)
      onCreated={({ gl, scene, camera }) => {
        if (import.meta.env.DEV) Object.assign(window, { __three: { gl, scene, camera } })
      }}
    >
      <Atmosphere />
      <DeepEnvironment />
      <CameraRig />
      <ShallowsScene />
      <TwilightScene />
      <MidnightScene />
      <AbyssScene />
      <MarineSnow />
      <PostFX />
    </Canvas>
  )
}
