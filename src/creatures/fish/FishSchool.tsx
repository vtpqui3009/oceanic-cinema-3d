import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import defaultFishUrl from '../../assets/barramundi.glb?url'
import { createRng } from '../../lib/noise'
import { userModelUrl } from '../../lib/models'
import { BioLight } from '../../scene/BioLight'
import { useSceneStore } from '../../state/useSceneStore'

export const FISH_URL = userModelUrl('fish') ?? defaultFishUrl

interface Props {
  /** Centre the school circles around (zone-local). */
  center?: [number, number, number]
}

/**
 * The school: one GPU-instanced draw call for every fish. The model's first
 * mesh is normalised to unit length facing +Z; each fish keeps its own
 * offset, size and phase.
 */
export function FishSchool(props: Props) {
  return (
    <Suspense fallback={null}>
      <School {...props} />
    </Suspense>
  )
}

function School({ center = [0, 0, 0] }: Props) {
  const quality = useSceneStore((s) => s.quality)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const count = quality === 'high' ? 72 : 30
  const gltf = useGLTF(FISH_URL)
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const shimmer = useRef<THREE.Group>(null!)

  const { geometry, material } = useMemo(() => {
    let src: THREE.Mesh | undefined
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => {
      if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh
    })
    const geometry = src!.geometry.clone().applyMatrix4(src!.matrixWorld)
    geometry.computeBoundingBox()
    const size = geometry.boundingBox!.getSize(new THREE.Vector3())
    const c = geometry.boundingBox!.getCenter(new THREE.Vector3())
    geometry.translate(-c.x, -c.y, -c.z)
    // longest axis becomes the body axis (+Z)
    if (size.x > size.z && size.x > size.y) geometry.rotateY(-Math.PI / 2)
    geometry.scale(1 / Math.max(size.x, size.y, size.z), 1 / Math.max(size.x, size.y, size.z), 1 / Math.max(size.x, size.y, size.z))
    const m = src!.material as THREE.MeshStandardMaterial
    // wet, iridescent scales on top of the model's own PBR maps
    const material = new THREE.MeshPhysicalMaterial({
      map: m.map,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      metalnessMap: m.metalnessMap,
      aoMap: m.aoMap,
      roughness: 0.55,
      metalness: 0.12,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
      iridescence: 0.45,
      iridescenceIOR: 1.5,
      envMapIntensity: 1.2,
    })
    return { geometry, material }
  }, [gltf])

  const fish = useMemo(() => {
    const rng = createRng(21)
    return Array.from({ length: count }, () => {
      // loose lens-shaped school, denser in the middle
      const u = rng(), a = rng() * Math.PI * 2, b = Math.acos(2 * rng() - 1)
      const r = Math.cbrt(u)
      return {
        off: new THREE.Vector3(Math.sin(b) * Math.cos(a) * 3.2 * r, Math.cos(b) * 1.1 * r, Math.sin(b) * Math.sin(a) * 2.2 * r),
        scale: 0.32 + rng() * 0.16,
        phase: rng() * 100,
        yaw: (rng() - 0.5) * 0.25,
      }
    })
  }, [count])

  const tmp = useMemo(() => ({ o: new THREE.Object3D(), c: new THREE.Vector3() }), [])
  const place = (t: number) => {
    // placeholder cruise: the whole school circles slowly (boids come in step 3)
    const R = 4.5
    const ang = t * 0.06
    tmp.c.set(center[0] + Math.cos(ang) * R * 0.4, center[1] + Math.sin(t * 0.2) * 0.3, center[2] + Math.sin(ang) * R * 0.4)
    const heading = -ang
    fish.forEach((f, i) => {
      const o = tmp.o
      o.position.copy(f.off).applyAxisAngle(THREE.Object3D.DEFAULT_UP, heading).add(tmp.c)
      o.position.y += Math.sin(t * 0.7 + f.phase) * 0.06
      o.rotation.set(0, heading + f.yaw + Math.sin(t * 0.5 + f.phase) * 0.08, 0)
      o.scale.setScalar(f.scale)
      o.updateMatrix()
      mesh.current.setMatrixAt(i, o.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    mesh.current.computeBoundingSphere()
    shimmer.current.position.copy(tmp.c)
  }

  useLayoutEffect(() => place(0))
  useFrame(({ clock }) => place(reduced ? 0 : clock.elapsedTime))

  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, material, count]} castShadow receiveShadow />
      {/* sunlight thrown back off silver flanks: a soft light that swims with the school */}
      <group ref={shimmer}>
        <BioLight color="#bff6ff" intensity={6} distance={9} castShadow={false} seed={3} />
      </group>
    </>
  )
}
