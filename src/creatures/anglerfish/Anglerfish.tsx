import { Suspense, useMemo } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildAnglerfish } from './buildAnglerfish'
import { BioLight } from '../../scene/BioLight'
import { CreatureModel } from '../CreatureModel'
import { useProcedural } from '../../lib/useProcedural'
import { CREATURES, userModelUrl } from '../../lib/models'
import { useSceneStore } from '../../state/useSceneStore'

const LURE_COLOR = new THREE.Color('#62f2ff')
const LURE_INTENSITY = 10

type GroupProps = { position?: [number, number, number]; rotation?: [number, number, number] }

export function Anglerfish(props: GroupProps) {
  const url = userModelUrl('anglerfish')
  return (
    <group {...props}>
      <Suspense fallback={null}>
        {url ? (
          <CreatureModel
            url={url}
            length={1.9}
            fallbackAnchor={[0, 0.8, 1.05]}
            anchorChildren={<BioLight color={LURE_COLOR} intensity={LURE_INTENSITY} />}
          />
        ) : (
          <ProceduralAnglerfish />
        )}
      </Suspense>
    </group>
  )
}

function ProceduralAnglerfish() {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const rig = useProcedural(`anglerfish-${quality}`, CREATURES.anglerfish.label, () => buildAnglerfish({ quality }))

  const coreBase = useMemo(() => rig.coreMaterial.color.clone(), [rig])

  useFrame(({ clock }) => {
    // reduced motion: hold a composed, slightly-open-mouthed pose
    const t = reduced ? 2.2 : clock.elapsedTime
    const swim = 1.5
    rig.spine.forEach((b, i) => {
      b.rotation.y = (0.025 + i * 0.03) * Math.sin(t * swim - i * 0.75)
    })
    rig.head.rotation.y = 0.02 * Math.sin(t * swim + 0.6)
    rig.jaw.rotation.x = 0.1 + 0.06 * Math.sin(t * 0.8) + 0.02 * Math.sin(t * 2.3)
    rig.finR.rotation.x = 0.25 * Math.sin(t * 2.2)
    rig.finL.rotation.x = 0.25 * Math.sin(t * 2.2 + 0.4)
    rig.lurePivot.rotation.x = 0.07 * Math.sin(t * 0.7)
    rig.lurePivot.rotation.z = 0.05 * Math.sin(t * 0.53 + 1)
    rig.lureJoint.rotation.x = 0.12 * Math.sin(t * 0.7 - 0.9)
    rig.lureJoint.rotation.z = 0.08 * Math.sin(t * 0.53 + 0.2)
    rig.root.position.y = 0.05 * Math.sin(t * 0.6)
    rig.root.rotation.x = 0.03 * Math.sin(t * 0.6 + 1.2)
  })

  const onPulse = (p: number) => {
    rig.bulbMaterial.emissiveIntensity = 1.5 * p
    rig.coreMaterial.color.copy(coreBase).multiplyScalar(0.7 + 0.5 * p)
    ;(rig.halo.material as THREE.SpriteMaterial).opacity = 0.35 + 0.3 * (p - 0.7)
    rig.halo.scale.setScalar(0.8 + 0.25 * p)
  }

  return (
    <primitive object={rig.root}>
      {createPortal(<BioLight color={LURE_COLOR} intensity={LURE_INTENSITY} onPulse={onPulse} />, rig.lureAnchor)}
    </primitive>
  )
}
