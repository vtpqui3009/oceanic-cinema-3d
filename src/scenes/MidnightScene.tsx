import { useRef } from 'react'
import { ContactShadows } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Zone } from '../scene/Zone'
import { AimedDirectional, AimedSpot } from '../scene/AimedLight'
import { Seabed } from '../scene/Seabed'
import { Squid } from '../creatures/squid/Squid'
import { SQUID_PATH, ZONE_Y, dive, squidProgress } from '../lib/dive'
import { useSceneStore } from '../state/useSceneStore'

const ORIGIN: [number, number, number] = [0, ZONE_Y[2], 0]
const FLOOR = -5

/**
 * Scene III — the midnight zone (500–1000 m). A tracking shot: the squid
 * swims over a dark canyon floor and the camera follows from behind. Its
 * two arm-tip photophores are the key lights; soft shadows travel with it.
 */
export function MidnightScene() {
  const stage = useSceneStore((s) => s.stage)
  const shadow = useRef<THREE.Group>(null!)
  const at = new THREE.Vector3()

  useFrame(() => {
    if (!shadow.current) return
    SQUID_PATH.getPointAt(squidProgress(dive.p), at)
    shadow.current.position.set(at.x, FLOOR + 0.06, at.z)
  })

  return (
    <Zone index={2} position={ORIGIN}>
      {/* RIM — faint blue from far above-behind */}
      <AimedDirectional aim={[0, 0, -6]} position={[-2, 10, -12]} intensity={1.6} color="#2f63ad" />
      {/* FILL — the barest cold lift on the camera side */}
      <AimedSpot aim={[0, 0, -4]} position={[5, 3, 10]} angle={0.7} penumbra={1} intensity={10} color="#1a4a80" distance={24} decay={2} />

      {/* KEY — the photophores */}
      <Squid zoneOrigin={ORIGIN} />

      <Seabed position={[0, FLOOR, -6]} size={56} seed={29} flat={10} relief={0.8} color="#4d5c68" rockColor="#1c242b" rocks={20} />
      {stage === 2 && (
        <group ref={shadow}>
          <ContactShadows scale={7} resolution={512} blur={3} far={7} opacity={0.5} color="#000000" />
        </group>
      )}
    </Zone>
  )
}
