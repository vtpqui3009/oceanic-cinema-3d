import { Suspense } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildJellyfish } from './buildJellyfish'
import { BioLight } from '../../scene/BioLight'
import { CreatureModel } from '../CreatureModel'
import { useProcedural } from '../../lib/useProcedural'
import { CREATURES, userModelUrl } from '../../lib/models'
import { useSceneStore } from '../../state/useSceneStore'

const GLOW = new THREE.Color('#4aa8ff')
const GLOW_INTENSITY = 7

type GroupProps = { position?: [number, number, number]; rotation?: [number, number, number] }

export function Jellyfish(props: GroupProps) {
  const url = userModelUrl('jellyfish')
  return (
    <group {...props}>
      <Suspense fallback={null}>
        {url ? (
          <CreatureModel
            url={url}
            length={1.7}
            fallbackAnchor={[0, 0.1, 0]}
            anchorChildren={<BioLight color={GLOW} intensity={GLOW_INTENSITY} seed={1.7} />}
          />
        ) : (
          <ProceduralJellyfish />
        )}
      </Suspense>
    </group>
  )
}

function ProceduralJellyfish() {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const rig = useProcedural(`jellyfish-${quality}`, CREATURES.jellyfish.label, () => buildJellyfish({ quality }))

  // idle drift only; the swimming pulse and tentacle physics come in step 3
  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.elapsedTime
    rig.root.position.y = Math.sin(t * 0.35) * 0.12
    rig.root.rotation.y = t * 0.05
  })

  return (
    <primitive object={rig.root}>
      {createPortal(
        <BioLight
          color={GLOW}
          intensity={GLOW_INTENSITY}
          seed={1.7}
          onPulse={(p) => (rig.bellMaterial.emissiveIntensity = 0.9 + p * 0.8)}
        />,
        rig.lightAnchor,
      )}
    </primitive>
  )
}
