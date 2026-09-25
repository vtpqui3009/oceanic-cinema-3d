import { Fragment, Suspense, useMemo, useRef } from 'react'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildSquid } from './buildSquid'
import { BioLight } from '../../scene/BioLight'
import { AimedSpot } from '../../scene/AimedLight'
import { CreatureModel } from '../CreatureModel'
import { useProcedural } from '../../lib/useProcedural'
import { CREATURES, userModelUrl } from '../../lib/models'
import { SQUID_PATH, STAGE_P, dive, squidProgress, subjects } from '../../lib/dive'
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
  const motion = useRef({ turn: 0, heading: 0, bank: 0 })

  useFrame(({ clock }, delta) => {
    // reduced motion: hold the squid where the (static) hero shot frames it
    const u = squidProgress(reduced ? STAGE_P[2] : dive.p)
    SQUID_PATH.getPointAt(u, at)
    SQUID_PATH.getPointAt(Math.min(u + 0.01, 1), ahead)
    if (u >= 0.999) ahead.copy(at).add(SQUID_PATH.getTangentAt(1))
    const t = reduced ? 0 : clock.elapsedTime
    at.y += Math.sin(t * 0.8) * 0.05
    group.current.position.set(at.x - zoneOrigin[0], at.y - zoneOrigin[1], at.z - zoneOrigin[2])
    ahead.set(ahead.x - zoneOrigin[0], ahead.y - zoneOrigin[1], ahead.z - zoneOrigin[2])
    // local +Z (mantle tip) leads
    group.current.lookAt(group.current.parent!.localToWorld(ahead.clone()))
    // yaw rate → arms swing out of the turn, body banks into it
    const m = motion.current
    const heading = Math.atan2(ahead.x - group.current.position.x, ahead.z - group.current.position.z)
    const dh = Math.atan2(Math.sin(heading - m.heading), Math.cos(heading - m.heading))
    m.heading = heading
    m.turn = THREE.MathUtils.lerp(m.turn, THREE.MathUtils.clamp(dh / Math.max(delta, 1e-3), -1.5, 1.5), 0.1)
    m.bank = THREE.MathUtils.lerp(m.bank, -m.turn * 0.25, 0.05)
    group.current.rotateZ(m.bank + Math.sin(t * 0.6) * 0.03)
    subjects[2] ??= new THREE.Vector3()
    group.current.getWorldPosition(subjects[2])
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
          <ProceduralSquid motion={motion} />
        )}
      </Suspense>
    </group>
  )
}

/** Jet stroke: the mantle squeezes quickly, then refills slowly. */
const JET = 2.6
function jet(t: number) {
  const ph = (((t % JET) + JET) % JET) / JET
  return ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI * 0.5) : 0.5 + 0.5 * Math.cos(((ph - 0.3) / 0.7) * Math.PI)
}

/**
 * Photophore display: a steady dim glow, broken every ~7 s by a burst of
 * short, bright flashes that alternate between the two organs.
 */
const FLASHES = [0, 0.32, 0.78, 1.05]
function flash(t: number, organ: number) {
  const ph = ((t + 3) % 7) - organ * 0.16
  let f = 0
  for (const at of FLASHES) f = Math.max(f, Math.exp(-Math.pow((ph - at) / 0.05, 2)))
  return 0.55 + f * 3.2
}

interface ArmState {
  ax: number
  ay: number
  vx: number
  vy: number
}

function ProceduralSquid({ motion }: { motion: React.RefObject<{ turn: number }> }) {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const rig = useProcedural(`squid-${quality}`, CREATURES.squid.label, () => buildSquid({ quality }))
  const sim = useMemo(() => rig.arms.map((chain) => chain.map((): ArmState => ({ ax: 0, ay: 0, vx: 0, vy: 0 }))), [rig])
  const time = useRef(0)

  useFrame(({ clock }, delta) => {
    if (reduced) {
      time.current = 1.2
      return
    }
    const t = clock.elapsedTime
    time.current = t
    const dt = Math.min(delta, 1 / 20)
    const j = jet(t)
    const turn = motion.current?.turn ?? 0

    rig.finUniforms.uTime.value = t
    rig.finUniforms.uFinAmp.value = 0.11 + 0.05 * (1 - j)
    // mantle squeeze (bones scale radially; skinning carries it to the skin)
    rig.mantle.forEach((b, i) => {
      const s = 1 - j * (0.035 + i * 0.012)
      b.scale.set(s, s, 1)
    })
    rig.head.rotation.x = Math.sin(t * 0.8) * 0.025

    // arms: springs chasing a tip-ward wave; they gather as the mantle
    // squeezes, spread as it refills, and swing out of turns
    rig.arms.forEach((chain, k) => {
      const phi = ((k + 0.5) / 8) * Math.PI * 2
      const cos = Math.cos(phi), sin = Math.sin(phi)
      chain.forEach((b, i) => {
        if (i === 0) return
        const f = i / (chain.length - 1)
        const lag = jet(t - f * 0.7)
        const spread = (i < 3 ? 0.05 : 0.012) * (1 - lag * 1.8)
        const wave = (0.02 + 0.045 * f) * Math.sin(t * 1.25 - i * 0.6 + k * 0.9)
        const wave2 = (0.015 + 0.035 * f) * Math.sin(t * 0.9 - i * 0.5 + k * 1.7)
        const tx = spread * sin + wave
        const ty = -spread * cos + wave2 - turn * 0.06 * f
        const st = sim[k][i]
        const stiff = 30 - 18 * f
        st.vx += ((tx - st.ax) * stiff - st.vx * 6) * dt
        st.vy += ((ty - st.ay) * stiff - st.vy * 6) * dt
        st.ax += st.vx * dt
        st.ay += st.vy * dt
        b.rotation.set(st.ax, st.ay, 0)
      })
    })
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
              castShadow={i === 0}
              distance={9}
              modulate={() => (reduced ? 0.8 : flash(time.current, i))}
              onPulse={(p) => (ph.material.emissiveIntensity = 0.9 * p)}
            />,
            ph.anchor,
          )}
        </Fragment>
      ))}
    </primitive>
  )
}
