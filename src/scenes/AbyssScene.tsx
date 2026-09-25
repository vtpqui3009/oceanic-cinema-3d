import { ContactShadows } from '@react-three/drei'
import * as THREE from 'three'
import { Anglerfish } from '../creatures/anglerfish/Anglerfish'
import { Zone } from '../scene/Zone'
import { AimedSpot } from '../scene/AimedLight'
import { Seabed } from '../scene/Seabed'
import { ZONE_Y, subjects } from '../lib/dive'
import { useSceneStore } from '../state/useSceneStore'

const FISH_POS: [number, number, number] = [0, 0.85, 0]
// keep boulders out of the camera's final push-in
// focus point for the depth of field: the face, between lure and teeth
subjects[3] = new THREE.Vector3(0.12, ZONE_Y[3] + FISH_POS[1] + 0.3, 0.5)

const CLEARINGS: [number, number, number][] = [[3.3, 4.6, 2.2], [2, 2.8, 1.8], [1, 1, 1.4]]

/**
 * Scene IV — the abyss (1000 m+). Near-total darkness; the anglerfish's lure
 * is the key light. Fill and rim sit at the edge of perception, only there
 * to separate the silhouette from the black water — like a night
 * documentary shot with a single practical light.
 */
export function AbyssScene() {
  const quality = useSceneStore((s) => s.quality)
  const stage = useSceneStore((s) => s.stage)
  const rimMap = quality === 'high' ? 2048 : 1024

  return (
    <Zone index={3} position={[0, ZONE_Y[3], 0]}>
      {/* FILL — cold, low, from camera-left; no shadow */}
      <AimedSpot aim={FISH_POS} position={[-4, 1.6, 3.5]} angle={0.55} penumbra={1} intensity={2.2} color="#1c4f78" distance={14} decay={2} />
      {/* RIM — deep-blue back light from above/behind, carves the silhouette */}
      <AimedSpot
        aim={FISH_POS}
        position={[-1.5, 5.5, -4.5]}
        angle={0.42}
        penumbra={0.9}
        intensity={26}
        color="#2f6fb8"
        distance={16}
        decay={2}
        castShadow={quality === 'high'}
        shadow-mapSize={[rimMap, rimMap]}
        shadow-radius={6}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      {/* KEY — the esca's bioluminescence lives inside <Anglerfish/> */}
      <Anglerfish position={FISH_POS} rotation={[0, -0.25, 0]} />

      <Seabed clearings={CLEARINGS} />
      {stage === 3 && (
        <ContactShadows
          position={[0, 0.02, 0]}
          scale={6}
          resolution={quality === 'high' ? 1024 : 512}
          blur={2.6}
          far={2.2}
          opacity={0.75}
          color="#000000"
        />
      )}
    </Zone>
  )
}
