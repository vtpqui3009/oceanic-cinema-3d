import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { bioLights, bioPulse, type BioLightEntry } from '../lib/bioluminescence'
import { useSceneStore } from '../state/useSceneStore'
import { currentLightWeight, useZoneIndex } from './Zone'

interface Props {
  color: THREE.ColorRepresentation
  intensity: number
  distance?: number
  castShadow?: boolean
  seed?: number
  /** Called every frame with the current pulse, to sync emissive materials. */
  onPulse?: (pulse: number) => void
  /** Extra multiplier sampled every frame (flashes, alarm displays…). */
  modulate?: () => number
}

/**
 * Bioluminescent key light. Lives *inside* the glowing organ (portal it into
 * the mesh), pulses organically and casts soft shadows.
 */
export function BioLight({ color, intensity, distance = 8, castShadow = true, seed = 0, onPulse, modulate }: Props) {
  const light = useRef<THREE.PointLight>(null!)
  const frame = useRef(0)
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const zone = useZoneIndex()
  const entry = useMemo<BioLightEntry>(
    () => ({ object: new THREE.Object3D(), color: new THREE.Color(color), strength: 1 }),
    [color],
  )

  useEffect(() => {
    entry.object = light.current
    light.current.userData.selfManaged = true
    light.current.shadow.autoUpdate = false
    bioLights.add(entry)
    return () => void bioLights.delete(entry)
  }, [entry])

  useFrame(({ clock }) => {
    // reduced motion: a much slower, shallower breath
    const t = reduced ? clock.elapsedTime * 0.25 : clock.elapsedTime
    const p = (reduced ? 0.95 + (bioPulse(t, seed) - 0.9) * 0.3 : bioPulse(t, seed)) * (modulate?.() ?? 1)
    const w = currentLightWeight(zone)
    light.current.intensity = intensity * p * w
    // cube shadow maps are six renders each: refresh them at half rate
    if (castShadow) light.current.shadow.needsUpdate = (frame.current++ & 1) === 0
    entry.strength = p * w
    onPulse?.(p)
  })

  const mapSize = quality === 'high' ? 512 : 256
  return (
    <pointLight
      ref={light}
      color={color}
      intensity={intensity}
      distance={distance}
      decay={2}
      castShadow={castShadow}
      shadow-mapSize={[mapSize, mapSize]}
      shadow-radius={quality === 'high' ? 5 : 2}
      shadow-bias={-0.0008}
      shadow-normalBias={0.015}
      shadow-camera-near={0.04}
      shadow-camera-far={distance}
    />
  )
}
