import { Fragment, Suspense, useRef } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildSquid } from './buildSquid'
import { BioLight } from '../../scene/BioLight'
import { AimedSpot } from '../../scene/AimedLight'
import { CreatureModel } from '../CreatureModel'
import { useProcedural } from '../../lib/useProcedural'
import { CREATURES, userModelUrl } from '../../lib/models'
import { SQUID_PATH, dive, squidProgress } from '../../lib/dive'
import { useSceneStore } from '../../state/useSceneStore'

const FLASH = new THREE.Color('#a9dcff')
const FLASH_INTENSITY = 5

/**
 * The squid swims along SQUID_PATH as the viewer scrolls through scene III;
 * the camera rig uses the same path for its tracking shot. `zoneOrigin` is
 * the world position of the enclosing zone (the path is in world space).
 */
export function Squid({ zoneOrigin }: { zoneOrigin: [number, number, number] }) {
  const group = useRef<THREE.Group>(null!)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const url = userModelUrl('squid')
  const at = new THREE.Vector3()
  const ahead = new THREE.Vector3()

  useFrame(({ clock }) => {
    const u = squidProgress(dive.p)
    SQUID_PATH.getPointAt(u, at)
    SQUID_PATH.getPointAt(Math.min(u + 0.01, 1), ahead)
    if (u >= 0.999) ahead.copy(at).add(SQUID_PATH.getTangentAt(1))
    const t = reduced ? 0 : clock.elapsedTime
    at.y += Math.sin(t * 0.8) * 0.05
    group.current.position.set(at.x - zoneOrigin[0], at.y - zoneOrigin[1], at.z - zoneOrigin[2])
    ahead.set(ahead.x - zoneOrigin[0], ahead.y - zoneOrigin[1], ahead.z - zoneOrigin[2])
    // local +Z (mantle tip) leads
    group.current.lookAt(group.current.parent!.localToWorld(ahead.clone()))
  })

  return (
    <group ref={group}>
      {/* RIM for the tracking shot: rides ahead of the squid, shining back at the lens */}
      <AimedSpot aim={[0, 0, -0.4]} position={[0.6, 2.6, 4.2]} angle={0.55} penumbra={1} intensity={45} color="#3f86d8" distance={12} decay={2} />
      <Suspense fallback={null}>
        {url ? (
          <CreatureModel
            url={url}
            length={3.4}
            fallbackAnchor={[0.3, 0.2, -1.6]}
            anchorChildren={<BioLight color={FLASH} intensity={FLASH_INTENSITY} seed={0.4} />}
          />
        ) : (
          <ProceduralSquid />
        )}
      </Suspense>
    </group>
  )
}

function ProceduralSquid() {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const rig = useProcedural(`squid-${quality}`, CREATURES.squid.label, () => buildSquid({ quality }))

  // gentle idle so it never looks frozen; full swimming cycle is step 3
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime
    rig.arms.forEach((chain, k) =>
      chain.forEach((b, i) => {
        if (i === 0) return
        b.rotation.x = 0.03 * Math.sin(t * 0.9 - i * 0.5 + k)
        b.rotation.y = 0.03 * Math.sin(t * 0.7 - i * 0.4 + k * 1.3)
      }),
    )
  })

  return (
    <primitive object={rig.root}>
      {rig.photophores.map((ph, i) => (
        <Fragment key={i}>
          {createPortal(
          <BioLight
            color={FLASH}
            intensity={FLASH_INTENSITY}
            seed={i * 2.3}
            castShadow={i === 0 || quality === 'high'}
            distance={9}
            onPulse={(p) => (ph.material.emissiveIntensity = 0.9 * p)}
          />,
          ph.anchor,
          )}
        </Fragment>
      ))}
    </primitive>
  )
}
