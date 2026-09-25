import { createContext, useContext, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { dive, zoneWeight } from '../lib/dive'

const ZoneContext = createContext<number | null>(null)

/** Weight (0…1) of the zone this component lives in; 1 outside any zone. */
export function useZoneIndex() {
  return useContext(ZoneContext)
}
export function currentZoneWeight(index: number | null) {
  return index === null ? 1 : zoneWeight(index, dive.stageF)
}

const HIDDEN_LAYER = 31

/**
 * Stop re-rendering a shadow map while its zone is out of view. The map must
 * have been rendered at least once: an unallocated shadow sampler makes the
 * GPU reject every draw that uses it.
 */
export function pauseShadow(shadow: THREE.LightShadow, active: boolean) {
  shadow.autoUpdate = active
  if (!active && !shadow.map) shadow.needsUpdate = true
}

/**
 * One depth zone. Keeps the light count constant (so shaders never
 * recompile mid-dive) while making far zones free:
 *  - lights fade with the zone weight; their shadow maps stop updating;
 *  - meshes move to a hidden layer, which both the camera and the shadow
 *    cameras skip (the scene graph under them, e.g. a portalled light inside
 *    a creature, keeps working).
 * Lights flagged `userData.selfManaged` (bioluminescence) scale themselves.
 */
export function Zone({ index, position, children }: { index: number; position?: [number, number, number]; children: ReactNode }) {
  const group = useRef<THREE.Group>(null!)

  useFrame(() => {
    const w = zoneWeight(index, dive.stageF)
    const active = w > 0
    const mask = active ? 1 : 1 << HIDDEN_LAYER
    // cheap enough to do every frame, and it catches children that mount late (Suspense)
    group.current.traverse((o) => {
      const light = o as THREE.Light & { shadow?: THREE.LightShadow }
      if (light.isLight) {
        if (light.userData.selfManaged) return
        if (light.userData.base === undefined) light.userData.base = light.intensity
        light.intensity = light.userData.base * w
        if (light.castShadow && light.shadow) pauseShadow(light.shadow, active)
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
