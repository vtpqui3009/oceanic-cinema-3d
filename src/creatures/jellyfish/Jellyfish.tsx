import { Suspense, useMemo, useRef } from 'react'
import { useZoneIndex, zoneVisible } from '../../scene/Zone'
import { createPortal, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { buildJellyfish } from './buildJellyfish'
import { BioLight } from '../../scene/BioLight'
import { CreatureModel } from '../CreatureModel'
import { useProcedural } from '../../lib/useProcedural'
import { CREATURES, userModelUrl } from '../../lib/models'
import { useSceneStore } from '../../state/useSceneStore'
import { smoothstep } from '../../lib/noise'
import { subjects } from '../../lib/dive'

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

/** Swimming stroke: a quick contraction, then a long, soft recovery. */
const STROKE = 3.2
function stroke(t: number) {
  const ph = (((t % STROKE) + STROKE) % STROKE) / STROKE
  return ph < 0.28 ? Math.sin((ph / 0.28) * Math.PI * 0.5) : 0.5 + 0.5 * Math.cos(((ph - 0.28) / 0.72) * Math.PI)
}

/** The alarm display: every ~15 s the crown lights up in chasing sweeps. */
function alarm(t: number) {
  const ph = (t + 6) % 15
  return smoothstep(0, 0.6, ph) * (1 - smoothstep(4, 5.2, ph))
}

interface BoneState {
  ax: number
  az: number
  vx: number
  vz: number
}

function ProceduralJellyfish() {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const rig = useProcedural(`jellyfish-${quality}`, CREATURES.jellyfish.label, () => buildJellyfish({ quality }))

  const sim = useMemo(
    () => ({
      y: 0,
      vy: 0,
      lastPulse: 0,
      tentacles: rig.tentacles.map((chain) => chain.map((): BoneState => ({ ax: 0, az: 0, vx: 0, vz: 0 }))),
    }),
    [rig],
  )
  const alarmLevel = useRef(0)

  const zone = useZoneIndex()
  useFrame(({ clock }, delta) => {
    if (!zoneVisible(zone)) return // off screen: no simulation cost
    if (reduced) {
      rig.uniforms.uPulse.value = 0.15
      return
    }
    const t = clock.elapsedTime
    const dt = Math.min(delta, 1 / 20)
    const pulse = stroke(t)
    rig.uniforms.uPulse.value = pulse
    rig.uniforms.uTime.value = t
    alarmLevel.current = alarm(t)
    rig.uniforms.uAlarm.value = alarmLevel.current

    // thrust while the bell closes, then a slow sink; spring keeps it in frame
    const closing = Math.max(0, (pulse - sim.lastPulse) / dt)
    sim.lastPulse = pulse
    sim.vy += (closing * 0.55 - sim.y * 0.6 - sim.vy * 0.9 - 0.05) * dt
    sim.y += sim.vy * dt
    rig.root.position.y = sim.y
    subjects[1] ??= new THREE.Vector3()
    rig.root.getWorldPosition(subjects[1]).y -= 0.5 // frame bell + upper tentacles
    rig.root.rotation.y = t * 0.05
    rig.root.rotation.z = Math.sin(t * 0.21) * 0.05
    rig.organs.scale.set(1 - pulse * 0.08, 1 + pulse * 0.05, 1 - pulse * 0.08)

    // tentacles: damped springs per bone chasing a wave that runs down the
    // chain, plus flare on each stroke and splay when the body sinks
    const splay = THREE.MathUtils.clamp(-sim.vy * 0.8, -0.06, 0.18)
    rig.tentacles.forEach((chain, k) => {
      const root = rig.tentacleRoots[k]
      const long = chain.length > 12
      chain[0].position.set(root.rest.x * (1 - pulse * 0.2), root.rest.y - pulse * 0.035, root.rest.z * (1 - pulse * 0.2))
      const cos = Math.cos(root.theta), sin = Math.sin(root.theta)
      chain.forEach((b, i) => {
        if (i === 0) return
        const f = i / (chain.length - 1)
        const lagged = stroke(t - f * (long ? 1.6 : 0.9))
        const amp = (0.018 + 0.05 * f) * (long ? 1.4 : 1)
        const wx = amp * Math.sin(t * 0.9 - i * 0.55 + k * 0.7)
        const wz = amp * 0.8 * Math.sin(t * 0.67 - i * 0.45 + k * 1.3)
        const flare = (i < 4 ? 0.12 : 0.02) * lagged + splay * (1 - f) * 0.5
        const tx = wx - flare * sin
        const tz = wz + flare * cos
        const s = sim.tentacles[k][i]
        const stiff = 26 - 16 * f
        s.vx += ((tx - s.ax) * stiff - s.vx * 5) * dt
        s.vz += ((tz - s.az) * stiff - s.vz * 5) * dt
        s.ax += s.vx * dt
        s.az += s.vz * dt
        b.rotation.set(s.ax, 0, s.az)
      })
    })
    // oral arms: slow, heavy undulation
    rig.arms.forEach((chain, k) =>
      chain.forEach((b, i) => {
        if (i === 0) return
        b.rotation.x = 0.07 * Math.sin(t * 0.5 - i * 0.6 + k * 1.7)
        b.rotation.z = 0.06 * Math.sin(t * 0.43 - i * 0.5 + k * 2.3)
      }),
    )
  })

  return (
    <primitive object={rig.root}>
      {createPortal(
        <BioLight
          color={GLOW}
          intensity={GLOW_INTENSITY}
          seed={1.7}
          modulate={() => 1 + alarmLevel.current * 0.9}
          onPulse={(p) => (rig.bellMaterial.emissiveIntensity = 0.9 + p * 0.8)}
        />,
        rig.lightAnchor,
      )}
    </primitive>
  )
}
