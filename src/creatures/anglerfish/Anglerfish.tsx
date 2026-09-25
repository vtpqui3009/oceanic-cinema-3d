import { Suspense, useMemo } from 'react'
import { useZoneIndex, zoneVisible } from '../../scene/Zone'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildAnglerfish } from './buildAnglerfish'
import { BioLight } from '../../scene/BioLight'
import { CreatureModel } from '../CreatureModel'
import { useProcedural } from '../../lib/useProcedural'
import { CREATURES, userModelUrl } from '../../lib/models'
import { useSceneStore } from '../../state/useSceneStore'
import { sampleKeys } from '../../lib/keyframes'
import { smoothstep } from '../../lib/noise'

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

/**
 * Ambush strike, as keyframes [t, gape, lunge, tailBoost]: the jaw creeps
 * open, the body draws back, then the mouth snaps shut as it lunges.
 */
const STRIKE_PERIOD = 16
const STRIKE = [
  [0, 0, 0, 0],
  [0.7, 0.34, -0.05, 0],
  [0.9, 0.4, -0.07, 0.2],
  [1.0, 0.0, 0.16, 1],
  [1.6, 0.04, 0.09, 0.4],
  [3.5, 0, 0, 0],
] as const
const keyOut: number[] = []

function ProceduralAnglerfish() {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const rig = useProcedural(`anglerfish-${quality}`, CREATURES.anglerfish.label, () => buildAnglerfish({ quality }))

  const coreBase = useMemo(() => rig.coreMaterial.color.clone(), [rig])

  const zone = useZoneIndex()
  useFrame(({ clock }) => {
    if (!zoneVisible(zone)) return // off screen: no simulation cost
    // reduced motion: hold a composed, slightly-open-mouthed pose
    const t = reduced ? 2.2 : clock.elapsedTime
    // strike cycle: [jaw gape, body lunge, tail boost] keyed over time
    const [gape, lunge, boost] = reduced ? [0, 0, 0] : sampleKeys(STRIKE, (t + 9) % STRIKE_PERIOD, keyOut)
    // the lure is jigged in the seconds before a strike
    const jigWin = reduced ? 0 : smoothstep(STRIKE_PERIOD - 3.2, STRIKE_PERIOD - 2.2, (t + 9) % STRIKE_PERIOD)
    const jig = jigWin * (Math.sin(t * 9) * 0.07 + Math.sin(t * 15.3) * 0.03)

    const swim = 1.5 + boost * 3
    rig.spine.forEach((b, i) => {
      b.rotation.y = (0.025 + i * 0.03) * (1 + boost * 1.5) * Math.sin(t * swim - i * 0.75)
    })
    rig.head.rotation.y = 0.02 * Math.sin(t * swim + 0.6)
    rig.head.rotation.x = -gape * 0.12
    rig.jaw.rotation.x = 0.1 + 0.06 * Math.sin(t * 0.8) + 0.02 * Math.sin(t * 2.3) + gape
    rig.finR.rotation.x = 0.25 * Math.sin(t * 2.2) + boost * 0.4
    rig.finL.rotation.x = 0.25 * Math.sin(t * 2.2 + 0.4) + boost * 0.4
    rig.lurePivot.rotation.x = 0.07 * Math.sin(t * 0.7) + jig
    rig.lurePivot.rotation.z = 0.05 * Math.sin(t * 0.53 + 1) + jig * 0.6
    rig.lureJoint.rotation.x = 0.12 * Math.sin(t * 0.7 - 0.9) - jig * 1.4
    rig.lureJoint.rotation.z = 0.08 * Math.sin(t * 0.53 + 0.2)
    rig.root.position.y = 0.05 * Math.sin(t * 0.6)
    rig.root.position.z = lunge
    rig.root.rotation.x = 0.03 * Math.sin(t * 0.6 + 1.2) - lunge * 0.3
    rig.root.rotation.y = 0.1 * Math.sin(t * 0.13)
  })

  const onPulse = (p: number) => {
    rig.bulbMaterial.emissiveIntensity = 1.5 * p
    rig.coreMaterial.color.copy(coreBase).multiplyScalar(0.7 + 0.5 * p)
    ;(rig.halo.material as THREE.SpriteMaterial).opacity = 0.16 + 0.14 * (p - 0.7)
    rig.halo.scale.setScalar(0.7 + 0.2 * p)
  }

  return (
    <primitive object={rig.root}>
      {createPortal(<BioLight color={LURE_COLOR} intensity={LURE_INTENSITY} onPulse={onPulse} />, rig.lureAnchor)}
    </primitive>
  )
}
