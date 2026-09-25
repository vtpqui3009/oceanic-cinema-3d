import { useMemo } from 'react'
import * as THREE from 'three'
import { Noise3D, createRng, smoothstep } from '../lib/noise'
import { bakeSediment } from '../lib/textures'
import { useSceneStore } from '../state/useSceneStore'

/** Displaced sediment floor with a flat "stage" in the middle and scattered rocks. */
export function Seabed({ y = 0, size = 60 }: { y?: number; size?: number }) {
  const quality = useSceneStore((s) => s.quality)
  const { floor, rocks, rockMat, floorMat } = useMemo(() => {
    const n = new Noise3D(5)
    const segs = quality === 'high' ? 220 : 110
    const floor = new THREE.PlaneGeometry(size, size, segs, segs)
    floor.rotateX(-Math.PI / 2)
    const p = floor.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      const r = Math.hypot(x, z)
      const dunes = n.fbm(x * 0.12, 0, z * 0.12, 4) * 1.4
      const detail = n.fbm(x * 0.9, 3, z * 0.9, 3) * 0.08
      const h = dunes * smoothstep(2.5, 9, r) + detail + smoothstep(8, 26, r) * 1.6 * (0.5 + n.noise(x * 0.05, 7, z * 0.05))
      p.setY(i, h)
    }
    floor.computeVertexNormals()

    const tex = bakeSediment()
    tex.map.repeat.set(size / 3, size / 3)
    tex.normalMap.repeat.set(size / 3, size / 3)
    const floorMat = new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.96,
      color: '#b4c6cc',
    })

    // procedural boulders: noisy icosahedra, flattened, half-buried
    const rng = createRng(77)
    const rocks: { geo: THREE.BufferGeometry; pos: [number, number, number]; rot: number }[] = []
    const count = quality === 'high' ? 14 : 8
    for (let k = 0; k < count; k++) {
      const geo = new THREE.IcosahedronGeometry(1, quality === 'high' ? 5 : 3)
      const gp = geo.attributes.position as THREE.BufferAttribute
      const v = new THREE.Vector3()
      const off = rng() * 100
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i)
        const d = 1 + n.fbm(v.x * 1.3 + off, v.y * 1.3, v.z * 1.3, 4) * 0.45 - n.ridged(v.x * 3 + off, v.y * 3, v.z * 3, 3) * 0.12
        v.multiplyScalar(d)
        gp.setXYZ(i, v.x, v.y * 0.62, v.z)
      }
      geo.computeVertexNormals()
      const a = rng() * Math.PI * 2
      const r = 2.6 + rng() * 7
      const s = 0.25 + rng() * 0.75
      geo.scale(s * (0.8 + rng() * 0.6), s, s)
      rocks.push({ geo, pos: [Math.cos(a) * r, s * 0.1, Math.sin(a) * r - 1.5], rot: rng() * 6 })
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: '#28323a', roughness: 0.85, normalMap: tex.normalMap })
    return { floor, rocks, rockMat, floorMat }
  }, [quality, size])

  return (
    <group position={[0, y, 0]}>
      <mesh geometry={floor} material={floorMat} receiveShadow />
      {rocks.map((r, i) => (
        <mesh key={i} geometry={r.geo} material={rockMat} position={r.pos} rotation-y={r.rot} castShadow receiveShadow />
      ))}
    </group>
  )
}
