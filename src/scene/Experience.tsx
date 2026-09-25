import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { AbyssScene } from './AbyssScene'
import { useSceneStore } from '../state/useSceneStore'

export function Experience() {
  const quality = useSceneStore((s) => s.quality)
  return (
    <Canvas
      // PCF soft shadows. three r182+ removed PCFSoftShadowMap (it now logs a
      // warning and falls back); PCFShadowMap gained Vogel-disk soft filtering
      // driven by `shadow.radius`, which is the soft path we use everywhere.
      shadows={{ enabled: true, type: THREE.PCFShadowMap }}
      dpr={quality === 'high' ? [1, 2] : [1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [3.3, 1.25, 4.6], fov: 30, near: 0.05, far: 80 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <AbyssScene />
    </Canvas>
  )
}
