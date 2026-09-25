import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { activeZone, dive, lightWeight, zoneWeight } from '../lib/dive'

const ZoneContext = createContext<number | null>(null)

export function useZoneIndex() {
  return useContext(ZoneContext)
}

/**
 * Forces one zone's lights on (and every mesh visible) regardless of the
 * camera — used once at start-up to pre-compile each lighting set-up.
 */
export const zoneOverride = { value: -1 }

/**
 * True while a zone can be seen (or is being pre-compiled). Creatures bail
 * out of their per-frame simulation when their zone is hidden: nothing off
 * screen costs CPU.
 */
export function zoneVisible(index: number | null) {
  if (index === null || zoneOverride.value >= 0) return true
  return zoneWeight(index, dive.stageF) > 0
}

/** Light strength (0…1) for lights inside a zone; 1 outside any zone. */
export function currentLightWeight(index: number | null) {
  if (index === null) return 1
  if (zoneOverride.value >= 0) return zoneOverride.value === index ? 1 : 0
  return lightWeight(index, dive.stageF)
}

const HIDDEN_LAYER = 31

/**
 * One depth zone.
 *
 * Lights: only the active zone's lights are *visible*. Invisible lights are
 * skipped entirely by three.js — no per-pixel cost and no shadow maps — so
 * every fragment evaluates ~5 lights instead of all 16. Each zone is a
 * different lighting set-up (a different shader variant); all four are
 * compiled up front by <ShaderPrewarm/>, so the swaps never stall.
 *
 * Meshes: far zones move to a hidden layer, skipped by the camera and by
 * every shadow camera (the graph below them, e.g. a light portalled into a
 * creature, keeps working).
 *
 * Lights flagged `userData.selfManaged` (bioluminescence) set their own
 * intensity from `currentLightWeight`.
 */
export function Zone({ index, position, children }: { index: number; position?: [number, number, number]; children: ReactNode }) {
  const group = useRef<THREE.Group>(null!)

  useFrame(() => {
    const forced = zoneOverride.value >= 0
    const lit = forced ? zoneOverride.value === index : activeZone(dive.stageF) === index
    const w = currentLightWeight(index)
    const visible = zoneVisible(index)
    const mask = visible ? 1 : 1 << HIDDEN_LAYER
    // hidden zones (hundreds of bones) skip the scene-wide matrix update;
    // they are refreshed the moment they come back into view
    group.current.matrixWorldAutoUpdate = visible
    // walk every frame, hidden or not: creatures mount late (Suspense) and
    // their lights/meshes must be switched off even in zones out of view
    group.current.traverse((o) => {
      const light = o as THREE.Light
      if (light.isLight) {
        light.userData.zone = index
        light.visible = lit
        if (light.userData.selfManaged) return
        if (light.userData.base === undefined) light.userData.base = light.intensity
        light.intensity = light.userData.base * w
      } else if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
        o.layers.mask = mask
      }
    })
  })

  return (
    <ZoneContext.Provider value={index}>
      <group ref={group} position={position}>
        {children}
      </group>
    </ZoneContext.Provider>
  )
}
