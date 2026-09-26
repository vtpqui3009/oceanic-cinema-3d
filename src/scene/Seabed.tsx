import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Noise3D, createRng, smoothstep } from '../lib/noise'
import { bakeSediment } from '../lib/textures'
import { withCaustics } from '../lib/caustics'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useSceneStore } from '../state/useSceneStore'
import { ZONE_Y } from '../lib/dive'
import { useZoneIndex } from './Zone'

/**
 * World-space floor height per zone (the same noise as the mesh), so the
 * explore-mode submarine can hover over the dunes without raycasts.
 */
export const seabedHeight: (((x: number, z: number) => number) | undefined)[] = []

function heightField(n: Noise3D, size: number, flat: number, relief: number) {
  return (x: number, z: number) => {
    const r = Math.hypot(x, z)
    const dunes = n.fbm(x * 0.12, 0, z * 0.12, 4) * relief
    const detail = n.fbm(x * 0.9, 3, z * 0.9, 3) * 0.08
    const rise = smoothstep(size * 0.13, size * 0.43, r) * relief * 1.2 * (0.5 + n.noise(x * 0.05, 7, z * 0.05))
    return dunes * smoothstep(flat, flat * 3.5, r) + detail + rise
  }
}

interface Props {
  position?: [number, number, number]
  rotation?: [number, number, number]
  size?: number
  seed?: number
  /** Radius of the flat "stage" in the centre. */
  flat?: number
  /** Dune height outside the stage. */
  relief?: number
  color?: THREE.ColorRepresentation
  rockColor?: THREE.ColorRepresentation
  rocks?: number
  caustics?: boolean
  /** Keep boulders out of these [x, z, radius] circles (e.g. in front of the lens). */
  clearings?: [number, number, number][]
}

/** Displaced sediment floor with a flat stage in the middle and scattered boulders. */
export function Seabed({
  position = [0, 0, 0],
  rotation,
  size = 60,
  seed = 5,
  flat = 2.5,
  relief = 1.4,
  color = '#b4c6cc',
  rockColor = '#28323a',
  rocks: rockCount = 14,
  caustics = false,
  clearings,
}: Props) {
  const quality = useSceneStore((s) => s.quality)
  const zone = useZoneIndex()
  const [px, py, pz] = position
  useEffect(() => {
    if (zone === null || rotation) return
    const h = heightField(new Noise3D(seed), size, flat, relief)
    const base = ZONE_Y[zone] + py
    seabedHeight[zone] = (x, z) => base + h(x - px, z - pz)
    return () => void (seabedHeight[zone] = undefined)
  }, [zone, rotation, seed, size, flat, relief, px, py, pz])

  const { floor, rocks, rockMat, floorMat } = useMemo(() => {
    const n = new Noise3D(seed)
    const height = heightField(n, size, flat, relief)
    const segs = quality === 'high' ? 140 : 80
    const floor = new THREE.PlaneGeometry(size, size, segs, segs)
    floor.rotateX(-Math.PI / 2)
    const p = floor.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, height(p.getX(i), p.getZ(i)))
    floor.computeVertexNormals()

    const tex = bakeSediment(seed + 16)
    tex.map.repeat.set(size / 3, size / 3)
    tex.normalMap.repeat.set(size / 3, size / 3)
    const floorMat = new THREE.MeshStandardMaterial({
      map: tex.map,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.96,
      color,
    })

    // procedural boulders: noisy icosahedra, flattened, half-buried
    const rng = createRng(seed * 13 + 1)
    const rocks: { geo: THREE.BufferGeometry; pos: [number, number, number]; rot: number }[] = []
    const count = quality === 'high' ? rockCount : Math.ceil(rockCount * 0.55)
    for (let k = 0; k < count; k++) {
      // icosahedra come unindexed (faceted); weld so normals come out smooth
      // detail 3 = 1 280 triangles (detail 5 was 20 480 per boulder); the
      // sediment normal map carries the fine surface
      const ico = new THREE.IcosahedronGeometry(1, quality === 'high' ? 3 : 2)
      ico.deleteAttribute('normal')
      ico.deleteAttribute('uv')
      const geo = mergeVertices(ico)
      ico.dispose()
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
      const r = flat + 0.2 + rng() * size * 0.14
      const s = 0.25 + rng() * 0.8
      geo.scale(s * (0.8 + rng() * 0.6), s, s)
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 1.5
      if (clearings?.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + s)) {
        geo.dispose()
        continue
      }
      rocks.push({ geo, pos: [x, s * 0.1, z], rot: rng() * 6 })
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: rockColor, roughness: 0.85, normalMap: tex.normalMap })
    if (caustics) {
      withCaustics(floorMat)
      withCaustics(rockMat)
    }
    return { floor, rocks, rockMat, floorMat }
  }, [quality, size, seed, flat, relief, color, rockColor, rockCount, caustics, clearings])

  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={floor} material={floorMat} receiveShadow />
      {rocks.map((r, i) => (
        <mesh key={i} geometry={r.geo} material={rockMat} position={r.pos} rotation-y={r.rot} castShadow receiveShadow />
      ))}
    </group>
  )
}
