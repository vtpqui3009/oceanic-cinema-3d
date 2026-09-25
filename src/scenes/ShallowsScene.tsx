import { ContactShadows } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Zone } from '../scene/Zone'
import { SHOW_CAST } from '../creatures/ambient/cast'
import { AimedDirectional, AimedSpot } from '../scene/AimedLight'
import { Seabed } from '../scene/Seabed'
import { FishSchool } from '../creatures/fish/FishSchool'
import { BaitBall } from '../creatures/ambient/BaitBall'
import { MantaRay } from '../creatures/ambient/MantaRay'
import { WaterSurface } from './shallows/WaterSurface'
import { GodRays } from './shallows/GodRays'
import { causticUniforms } from '../lib/caustics'
import { ZONE_Y } from '../lib/dive'
import { useSceneStore } from '../state/useSceneStore'

const SUN: [number, number, number] = [0.3, 1, 0.2]

/**
 * Scene I — the sunlit shallows (0–50 m). The sun is the key here: it throws
 * god rays and caustics and casts the school's shadow onto the sand. The
 * school carries its own soft "shimmer" light (sun bounced off silver
 * flanks) so the creature is still a light source.
 */
export function ShallowsScene() {
  const quality = useSceneStore((s) => s.quality)
  const stage = useSceneStore((s) => s.stage)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const sunMap = quality === 'high' ? 1024 : 512

  useFrame(({ clock }) => {
    causticUniforms.uCausticTime.value = reduced ? 3 : clock.elapsedTime
  })

  return (
    <Zone index={0} position={[0, ZONE_Y[0], 0]}>
      <WaterSurface y={10} sunDir={SUN} />
      <GodRays top={10} sunDir={SUN} />

      {/* KEY — sun through the surface */}
      <AimedDirectional
        aim={[0, -2, 0]}
        position={[SUN[0] * 30, 30, SUN[2] * 30]}
        intensity={3.4}
        color="#dff8ff"
        castShadow
        shadow-mapSize={[sunMap, sunMap]}
        shadow-radius={4}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={5}
        shadow-camera-far={60}
      />
      {/* FILL — scattered light from the open water, camera side */}
      <AimedSpot aim={[0, 0, 0]} position={[8, 0, 10]} angle={0.8} penumbra={1} intensity={30} color="#3fb6d4" distance={30} decay={2} />
      {/* RIM — bright surface glare behind the school */}
      <AimedSpot aim={[0, 0, 0]} position={[-4, 8, -10]} angle={0.6} penumbra={1} intensity={80} color="#b9f2ff" distance={30} decay={2} />

      <FishSchool center={[0, 0.3, 0]} />
      {/* supporting cast: GPU-animated, one draw call each */}
      {SHOW_CAST && <BaitBall />}
      {SHOW_CAST && <MantaRay />}

      <Seabed position={[0, -6, 0]} seed={3} flat={6} relief={1.1} color="#d9cfb2" rockColor="#5b6a63" rocks={18} caustics />
      {stage === 0 && (
        <ContactShadows
          position={[0, -5.9, 0]}
          scale={16}
          resolution={512}
          blur={3}
          far={7}
          opacity={0.35}
          color="#062a33"
        />
      )}
    </Zone>
  )
}
