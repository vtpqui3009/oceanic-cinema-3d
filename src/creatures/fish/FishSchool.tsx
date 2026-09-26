import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { useZoneIndex, zoneVisible } from '../../scene/Zone'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import defaultFishUrl from '../../assets/barramundi.glb?url'
import { DEFAULT_FLOCK, createFlock, stepFlock, type Avoid, type FlockParams } from '../../lib/boids'
import { diverUniforms } from '../../interaction/diverLight'
import { deform } from '../../lib/deform'
import { damp } from '../../lib/smooth'
import { subjects } from '../../lib/dive'
import { CREATURES, userModelUrl } from '../../lib/models'
import { useSafeGLTF } from '../../lib/loadGLTF'
import { BioLight } from '../../scene/BioLight'
import { useSceneStore } from '../../state/useSceneStore'

export const FISH_URL = userModelUrl('fish') ?? defaultFishUrl

interface Props {
  /** Centre the school roams around (zone-local). */
  center?: [number, number, number]
}

/**
 * The school: one GPU-instanced draw call for every fish. The model's first
 * mesh is normalised to unit length facing +Z. Every fish runs its own boid
 * (separation / alignment / cohesion), banks into its turns and beats its
 * tail at a rate set by its speed, so the school never moves in lockstep.
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
  const gltf = useSafeGLTF(FISH_URL, CREATURES.fish.label)
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
      envMapIntensity: 1.2,
    })
    return { geometry, material }
  }, [gltf])

  // one tail-beat phase per fish, read by the vertex shader
  const phaseAttr = useMemo(() => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
    a.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aPhase', a)
    return a
  }, [geometry, count])
  useLayoutEffect(() => {
    deform(mesh.current, material, {
      key: 'fish-tail',
      uniforms: {},
      head: 'attribute float aPhase;',
      // lateral body wave travelling head → tail, stiff head, loose tail
      body: /* glsl */ `
        float tailW = smoothstep(0.3, -0.5, position.z);
        transformed.x += sin(aPhase + position.z * 7.5) * 0.085 * tailW * tailW;
        transformed.x += sin(aPhase * 0.5) * 0.012;`,
    })
  }, [material])

  const c = useMemo(() => new THREE.Vector3(...center), [center])
  const flock = useMemo(() => createFlock(count, c), [count, c])
  const params = useMemo<FlockParams>(() => ({ ...DEFAULT_FLOCK, center: c }), [c])
  const avoid = useMemo<Avoid>(() => ({ pos: new THREE.Vector3(), strength: 0, radius: 2.4 }), [])
  const tmp = useMemo(
    () => ({
      goal: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), roll: new THREE.Quaternion(),
      s: new THREE.Vector3(), dir: new THREE.Vector3(), prev: new THREE.Vector3(), mean: new THREE.Vector3(),
      zero: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )

  const writeInstances = () => {
    tmp.mean.set(0, 0, 0)
    flock.forEach((b, i) => {
      tmp.dir.copy(b.vel).normalize()
      tmp.m.lookAt(tmp.dir, tmp.zero, tmp.up) // +Z along the swim direction
      tmp.q.setFromRotationMatrix(tmp.m)
      tmp.roll.setFromAxisAngle(tmp.z, b.bank)
      tmp.q.multiply(tmp.roll)
      tmp.s.setScalar(b.size)
      tmp.m.compose(b.pos, tmp.q, tmp.s)
      mesh.current.setMatrixAt(i, tmp.m)
      phaseAttr.array[i] = b.phase
      tmp.mean.add(b.pos)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    phaseAttr.needsUpdate = true
    mesh.current.computeBoundingSphere()
    shimmer.current.position.copy(tmp.mean.divideScalar(flock.length))
    subjects[0] ??= new THREE.Vector3()
    shimmer.current.getWorldPosition(subjects[0])
  }

  useLayoutEffect(() => {
    // settle into a natural formation before the first frame is seen
    tmp.goal.copy(c)
    for (let i = 0; i < 240; i++) stepFlock(flock, tmp.goal, params, 1 / 30)
    writeInstances()
  }, [flock])

  const zone = useZoneIndex()
  useFrame(({ clock }, delta) => {
    if (!zoneVisible(zone)) return // off screen: no simulation cost
    if (reduced) return // reduced motion: the school holds its formation
    const t = clock.elapsedTime
    // the school's wandering "intent"
    tmp.goal.set(c.x + Math.sin(t * 0.11) * 2.4, c.y + Math.sin(t * 0.23) * 0.9, c.z + Math.sin(t * 0.17 + 1) * 1.8)
    const dt = Math.min(delta, 1 / 20)
    flock.forEach((b) => b.prev.copy(b.vel))
    // the diver's torch, brought into the school's (zone-local) space
    avoid.strength = diverUniforms.uDiverStrength.value
    if (avoid.strength > 0.01) mesh.current.worldToLocal(avoid.pos.copy(diverUniforms.uDiverPos.value))
    stepFlock(flock, tmp.goal, params, dt, avoid)
    flock.forEach((b) => {
      // bank into turns: roll ∝ signed yaw rate
      const turn = Math.atan2(b.prev.x * b.vel.z - b.prev.z * b.vel.x, b.prev.x * b.vel.x + b.prev.z * b.vel.z) / Math.max(dt, 1e-3)
      b.bank = damp(b.bank, THREE.MathUtils.clamp(-turn * 0.25, -0.6, 0.6), 5, dt)
      // faster fish beat their tails faster
      b.phase += dt * (7 + b.vel.length() * 5)
    })
    writeInstances()
  })

  return (
    <>
      <instancedMesh ref={mesh} args={[geometry, material, count]} castShadow receiveShadow />
      {/* sunlight thrown back off silver flanks: a soft light that swims with the school */}
      <group ref={shimmer}>
        <BioLight color="#bff6ff" intensity={3.2} distance={9} castShadow={false} seed={3} />
      </group>
    </>
  )
}
