import { useMemo } from 'react'
import * as THREE from 'three'
import { makeSwarmMesh, patchSwarmMaterial, smallFishGeometry } from '../../lib/gpuSwarm'
import { useSceneStore } from '../../state/useSceneStore'
import { useSwarmClock } from './useSwarmClock'

/**
 * Lanternfish — the most numerous vertebrates on Earth — cruising through
 * the midnight zone as a loose school: each follows a delayed copy of the
 * leader's path, and rows of photophores glow along their bellies (lit
 * standard material + shader emissive, so they bloom). One draw call.
 */
export function Lanternfish({ position = [1.5, 0.2, -9] as [number, number, number] }) {
  const quality = useSceneStore((s) => s.quality)
  const count = quality === 'high' ? 120 : 45
  const { uTime } = useSwarmClock()

  const mesh = useMemo(() => {
    const material = patchSwarmMaterial(
      new THREE.MeshStandardMaterial({ color: '#1b242c', metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }),
      {
        key: 'lanternfish',
        head: 'varying vec3 vLocal;',
        path: /* glsl */ `
          float tt = t - aMotion.w * 1.6;                 // later fish follow the leader's wake
          vec3 lead = vec3(sin(tt * 0.13) * 5.5, sin(tt * 0.29) * 0.9, sin(tt * 0.1 + 1.0) * 5.0);
          vec3 wobble = vec3(sin(t * 1.3 + aMotion.w * 40.0), sin(t * 0.9 + aMotion.w * 17.0) * 0.6, cos(t * 1.1 + aMotion.w * 23.0)) * 0.12;
          return aOrbit.xyz + lead + wobble;`,
        local: /* glsl */ `
          vLocal = lp / aMotion.z;
          float tailW = smoothstep(0.2, -0.55, vLocal.z);
          lp.x += sin(uTime * (10.0 + aMotion.w * 5.0) + vLocal.z * 8.0 + aMotion.w * 30.0) * 0.07 * aMotion.z * tailW;`,
        fragHead: 'varying vec3 vLocal;',
        // ventral photophore rows + one by the eye
        fragEmissive: /* glsl */ `
          float belly = smoothstep(-0.02, -0.075, vLocal.y) * step(-0.42, vLocal.z) * step(vLocal.z, 0.34);
          float dots = pow(max(0.0, sin(vLocal.z * 95.0)), 8.0);
          float eye = smoothstep(0.035, 0.0, length(vec2(vLocal.y - 0.015, vLocal.z - 0.36)));
          totalEmissiveRadiance += vec3(0.35, 0.75, 1.0) * (belly * dots * 6.0 + eye * 3.0);`,
      },
      uTime,
    )
    return makeSwarmMesh(smallFishGeometry(), material, count, (_, o, m, rng) => {
      o[0] = (rng() - 0.5) * 3.2
      o[1] = (rng() - 0.5) * 1.6
      o[2] = (rng() - 0.5) * 3.2
      m[0] = 0
      m[1] = 0
      m[2] = 0.13 + rng() * 0.05
      m[3] = rng()
    }, 93)
  }, [count, uTime])

  return <primitive object={mesh} position={position} />
}
