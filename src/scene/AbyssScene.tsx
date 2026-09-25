import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Anglerfish } from '../creatures/anglerfish/Anglerfish'
import { DeepEnvironment } from './DeepEnvironment'
import { Seabed } from './Seabed'
import { MarineSnow } from './MarineSnow'
import { useSceneStore } from '../state/useSceneStore'

const FISH_POS: [number, number, number] = [0, 0.85, 0]

/**
 * Scene IV — the abyss (1000 m+). Near-total darkness; the anglerfish's lure
 * is the key light. Fill and rim are kept at the edge of perception, only
 * there to separate the silhouette from the black water — like a night
 * documentary shot with a single practical light.
 */
export function AbyssScene() {
  const { fill, rim, contact } = useSceneStore((s) => s.lights)
  const autoRotate = useSceneStore((s) => s.autoRotate)
  const quality = useSceneStore((s) => s.quality)
  const rimMap = quality === 'high' ? 2048 : 1024

  return (
    <>
      <color attach="background" args={['#010308']} />
      <fogExp2 attach="fog" args={['#010610', 0.085]} />
      <DeepEnvironment intensity={0.22} />

      {/* ambient: the last traces of sunlight, cold and almost gone */}
      <hemisphereLight args={['#0d2c4a', '#000000', 0.12]} />

      {/* FILL — cold, low, from camera-left; no shadow */}
      {fill && <spotLight position={[-4, 1.6, 3.5]} angle={0.55} penumbra={1} intensity={2.2} color="#1c4f78" distance={14} decay={2} />}

      {/* RIM — deep-blue back light from above/behind, carves the silhouette */}
      {rim && (
        <spotLight
          position={[-1.5, 5.5, -4.5]}
          angle={0.42}
          penumbra={0.9}
          intensity={26}
          color="#2f6fb8"
          distance={16}
          decay={2}
          castShadow
          shadow-mapSize={[rimMap, rimMap]}
          shadow-radius={6}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          target-position={FISH_POS}
        />
      )}

      {/* KEY — the esca's bioluminescence lives inside <Anglerfish/> */}
      <Anglerfish position={FISH_POS} rotation={[0, -0.25, 0]} />

      <Seabed />
      {contact && (
        <ContactShadows
          position={[0, 0.02, 0]}
          scale={6}
          resolution={quality === 'high' ? 1024 : 512}
          blur={2.6}
          far={2.2}
          opacity={0.75}
          color="#000000"
          frames={quality === 'high' ? Infinity : 30}
        />
      )}
      <MarineSnow center={[0, 0, 0]} extent={[14, 6, 14]} ambient={0.04} />

      <OrbitControls
        makeDefault
        target={[0.2, 0.95, 0.3]}
        enableDamping
        dampingFactor={0.06}
        enablePan={false}
        minDistance={1.6}
        maxDistance={9}
        maxPolarAngle={1.62}
        autoRotate={autoRotate}
        autoRotateSpeed={0.35}
      />
    </>
  )
}
