import { useState, type ComponentProps } from 'react'
import * as THREE from 'three'

type V3 = [number, number, number]

/**
 * three.js only tracks a light's target if the target is in the scene
 * graph; otherwise it silently aims at the world origin. These wrappers
 * mount the target next to the light, so `aim` is in the same (zone-local)
 * space as `position`.
 */
export function AimedSpot({ aim, ...props }: { aim: V3 } & Omit<ComponentProps<'spotLight'>, 'target'>) {
  const [target] = useState(() => new THREE.Object3D())
  return (
    <>
      <primitive object={target} position={aim} />
      <spotLight target={target} {...props} />
    </>
  )
}

export function AimedDirectional({ aim, ...props }: { aim: V3 } & Omit<ComponentProps<'directionalLight'>, 'target'>) {
  const [target] = useState(() => new THREE.Object3D())
  return (
    <>
      <primitive object={target} position={aim} />
      <directionalLight target={target} {...props} />
    </>
  )
}
