import { ContactShadows } from '@react-three/drei'
import { Zone } from '../scene/Zone'
import { AimedSpot } from '../scene/AimedLight'
import { Seabed } from '../scene/Seabed'
import { Jellyfish } from '../creatures/jellyfish/Jellyfish'
import { ZONE_Y } from '../lib/dive'
import { useSceneStore } from '../state/useSceneStore'

/**
 * Scene II — the twilight zone (50–500 m). The last blue daylight arrives
 * from straight above as a faint rim; the jellyfish's own glow is the key,
 * casting tentacle shadows across a seamount ledge below it.
 */
export function TwilightScene() {
  const stage = useSceneStore((s) => s.stage)
  const quality = useSceneStore((s) => s.quality)
  return (
    <Zone index={1} position={[0, ZONE_Y[1], 0]}>
      {/* RIM — dying daylight from the surface, straight down */}
      <AimedSpot aim={[0, 0, 0]} position={[0.5, 12, -2]} angle={0.35} penumbra={1} intensity={90} color="#3d86d6" distance={30} decay={2} />
      {/* FILL — cold, low, camera-left */}
      <AimedSpot aim={[0, -1, 0]} position={[-5, -1, 5]} angle={0.6} penumbra={1} intensity={6} color="#1f5c9a" distance={16} decay={2} />

      {/* KEY — inside the bell */}
      <Jellyfish position={[0, 0, 0]} />

      <Seabed position={[0.5, -5.2, -1]} size={36} seed={11} flat={3} relief={2.2} color="#6d8796" rockColor="#26323b" rocks={16} />
      {stage === 1 && (
        <ContactShadows position={[0, -5.15, 0]} scale={9} resolution={quality === 'high' ? 1024 : 512} blur={2.8} far={5.5} opacity={0.6} color="#000814" />
      )}
    </Zone>
  )
}
