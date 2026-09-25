import { Environment, Lightformer } from '@react-three/drei'

interface Props {
  /** Overall strength of image-based reflections (drops with depth). */
  intensity?: number
}

/**
 * Procedurally-authored dark deep-blue HDR environment: a faint cold glow from
 * the far-away surface, dim blue-green scatter at the sides and a couple of
 * small hot cyan cards that read as bioluminescent speculars on wet skin.
 * It is rendered once into a cube map (frames=1) and used for reflections
 * only — the visible background stays the fogged water.
 */
export function DeepEnvironment({ intensity = 0.6 }: Props) {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={intensity}>
      <color attach="background" args={['#010409']} />
      {/* distant surface light, straight up */}
      <Lightformer form="circle" color="#2a6fa8" intensity={1.4} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={16} />
      {/* scattered water column */}
      <Lightformer form="rect" color="#0b3550" intensity={0.5} position={[-9, 2, 2]} rotation-y={Math.PI / 2} scale={[14, 5, 1]} />
      <Lightformer form="rect" color="#07303a" intensity={0.35} position={[9, 0, -3]} rotation-y={-Math.PI / 2} scale={[14, 4, 1]} />
      {/* tight cyan speculars */}
      <Lightformer form="ring" color="#6ff4ff" intensity={3} position={[2, 2, 6]} scale={0.8} />
      <Lightformer form="circle" color="#3ac8e0" intensity={1.5} position={[-3, 1, 5]} scale={0.5} />
    </Environment>
  )
}
