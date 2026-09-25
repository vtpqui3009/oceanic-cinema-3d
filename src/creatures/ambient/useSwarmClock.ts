import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSceneStore } from '../../state/useSceneStore'
import { liveAtmosphere } from '../../scene/Atmosphere'

/**
 * Shared per-swarm uniforms: the clock (frozen for reduced motion) and the
 * current fog density for glow shaders. One uniform write per frame.
 */
export function useSwarmClock(freezeAt = 4) {
  const reduced = useSceneStore((s) => s.reducedMotion)
  const u = useMemo(() => ({ uTime: { value: freezeAt } as THREE.IUniform<number>, uFogDensity: { value: 0.05 } as THREE.IUniform<number> }), [freezeAt])
  useFrame(({ clock }) => {
    u.uTime.value = reduced ? freezeAt : clock.elapsedTime
    u.uFogDensity.value = liveAtmosphere.density
  })
  return u
}
