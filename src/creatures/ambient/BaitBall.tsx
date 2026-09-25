import { useMemo, useRef } from 'react'
import { useZoneIndex, zoneVisible } from '../../scene/Zone'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeSwarmMesh, patchSwarmMaterial, smallFishGeometry } from '../../lib/gpuSwarm'
import { useSceneStore } from '../../state/useSceneStore'
import { useSwarmClock } from './useSwarmClock'

/**
 * A bait ball: hundreds of silversides milling in a rotating column, inner
 * fish lapping faster than outer ones. Mirror-bright flanks flash as they
 * turn through the sunlight. Entirely GPU-animated: one draw call.
 */
export function BaitBall({ position = [-7, 1.2, -8] as [number, number, number] }) {
  const quality = useSceneStore((s) => s.quality)
  const count = quality === 'high' ? 180 : 70
  const { uTime } = useSwarmClock()
  const group = useRef<THREE.Group>(null!)

  const mesh = useMemo(() => {
    const material = patchSwarmMaterial(
      new THREE.MeshStandardMaterial({ color: '#d4e2e8', metalness: 0.85, roughness: 0.26, envMapIntensity: 1.4, side: THREE.DoubleSide }),
      {
        key: 'baitball',
        path: /* glsl */ `
          float th = aMotion.y + t * aMotion.x;
          float h = (aMotion.w - 0.5) * 2.6 + sin(th * 2.0 + aMotion.w * 20.0) * 0.22;
          float r = aOrbit.w * (1.0 - 0.35 * abs(aMotion.w - 0.5)); // rounder at the poles
          return aOrbit.xyz + vec3(cos(th) * r, h, sin(th) * r);`,
        // a quick, shallow tail beat; stiff head
        local: /* glsl */ `
          float tailW = smoothstep(0.2, -0.55, lp.z / max(aMotion.z, 1e-3));
          lp.x += sin(uTime * (13.0 + aMotion.w * 6.0) + lp.z / aMotion.z * 9.0 + aMotion.w * 40.0) * 0.06 * aMotion.z * tailW;`,
      },
      uTime,
    )
    return makeSwarmMesh(smallFishGeometry(), material, count, (_, o, m, rng) => {
      const r = 0.5 + Math.pow(rng(), 0.7) * 1.9
      o[0] = (rng() - 0.5) * 0.4
      o[1] = (rng() - 0.5) * 0.3
      o[2] = (rng() - 0.5) * 0.4
      o[3] = r
      m[0] = (1.1 / r) * (0.85 + rng() * 0.3) // angular speed: inner laps faster
      m[1] = rng() * Math.PI * 2
      m[2] = 0.17 + rng() * 0.07
      m[3] = rng()
    }, 51)
  }, [count, uTime])

  // the whole ball drifts slowly (one transform per frame)
  const zone = useZoneIndex()
  useFrame(({ clock }) => {
    if (!zoneVisible(zone)) return // off screen: no simulation cost
    const t = clock.elapsedTime
    group.current.position.set(position[0] + Math.sin(t * 0.05) * 1.5, position[1] + Math.sin(t * 0.13) * 0.4, position[2] + Math.cos(t * 0.04) * 1.2)
  })

  return (
    <group ref={group} position={position}>
      <primitive object={mesh} />
    </group>
  )
}
