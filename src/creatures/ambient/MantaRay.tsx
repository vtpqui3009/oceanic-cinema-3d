import { useLayoutEffect, useMemo, useRef } from 'react'
import { useZoneIndex, zoneVisible } from '../../scene/Zone'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { deform } from '../../lib/deform'
import { taperedTube } from '../../lib/geometry'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useSceneStore } from '../../state/useSceneStore'
import { useDiscoverable } from '../../interaction/discoverables'

/**
 * A manta ray gliding a wide circle high above the school, its silhouette
 * against the surface light. Wings flap in the vertex shader; the only CPU
 * work is one transform per frame.
 */
function mantaGeometry() {
  const SPAN = 18, CHORD = 10
  const surfaces: THREE.BufferGeometry[] = []
  for (const side of [1, -1]) {
    const pos: number[] = [], col: number[] = [], uv: number[] = [], idx: number[] = []
    for (let i = 0; i <= SPAN; i++) {
      const u = (i / SPAN) * 2 - 1 // -1 … 1 across the span
      const s = Math.abs(u)
      const le = 0.55 - 0.95 * Math.pow(s, 1.25) // swept leading edge
      const chord = 1.25 * (1 - Math.pow(s, 1.7)) + 0.06
      for (let j = 0; j <= CHORD; j++) {
        const v = j / CHORD
        const thick = 0.16 * Math.pow(1 - s, 2.2) * Math.sin(Math.PI * v) + 0.004
        pos.push(u * 2.1, side * thick, le - v * chord)
        // dark back, white belly (the manta's countershading)
        const c = side > 0 ? [0.09, 0.11, 0.12] : [0.82, 0.84, 0.82]
        col.push(...c)
        uv.push(s, v)
      }
    }
    for (let i = 0; i < SPAN; i++)
      for (let j = 0; j < CHORD; j++) {
        const a = i * (CHORD + 1) + j, b = (i + 1) * (CHORD + 1) + j
        if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1)
        else idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
    const g = new THREE.BufferGeometry()
    g.setIndex(idx)
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    surfaces.push(g.toNonIndexed())
    g.dispose()
  }
  // whip-like tail
  const tail = taperedTube(
    new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.6), new THREE.Vector3(0, 0.02, -1.3), new THREE.Vector3(0, 0.05, -2.1)]),
    16, 4, (t) => 0.035 * (1 - t) + 0.004,
  ).toNonIndexed()
  tail.setAttribute('color', new THREE.Float32BufferAttribute(new Array(tail.attributes.position.count * 3).fill(0.08), 3))
  tail.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(tail.attributes.position.count * 2).fill(0), 2))
  tail.deleteAttribute('normal')
  surfaces.forEach((g) => g.deleteAttribute('normal'))
  const merged = mergeGeometries([...surfaces, tail])!
  merged.computeVertexNormals()
  surfaces.forEach((g) => g.dispose())
  tail.dispose()
  return merged
}

export function MantaRay({ center = [0, 5.2, -3] as [number, number, number], radius = 12, period = 64 }) {
  const reduced = useSceneStore((s) => s.reducedMotion)
  const group = useRef<THREE.Group>(null!)
  const mesh = useRef<THREE.Mesh>(null!)
  const uTime = useMemo(() => ({ value: 0 }), [])
  const { geometry, material } = useMemo(() => {
    return {
      geometry: mantaGeometry(),
      material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }),
    }
  }, [])
  useLayoutEffect(() => {
    deform(mesh.current, material, {
      key: 'manta-flap',
      uniforms: { uTime },
      head: 'uniform float uTime;',
      // slow, heavy strokes: a wave from the body out to the wing tips
      body: /* glsl */ `
        float span = abs(position.x) / 2.1;
        float flap = sin(uTime * 1.05 - span * 1.7) * pow(span, 1.5) * 0.55;
        transformed.y += flap + sin(uTime * 1.05 + 1.2) * 0.04;
        transformed.z += pow(span, 2.0) * 0.08 * cos(uTime * 1.05 - span * 1.7);`,
    })
  }, [material, uTime])

  const tmp = useMemo(() => ({ ahead: new THREE.Vector3(), c: new THREE.Vector3() }), [])
  useDiscoverable('manta', useMemo(() => ({ zone: 0, sample: (emit) => emit(group.current.getWorldPosition(tmp.c), 2.6) }), [tmp]))
  const zone = useZoneIndex()
  useFrame(({ clock }) => {
    if (!zoneVisible(zone)) return // off screen: no simulation cost
    const t = reduced ? 20 : clock.elapsedTime
    uTime.value = t
    const a = (t / period) * Math.PI * 2
    const at = (ang: number, out: THREE.Vector3) =>
      out.set(center[0] + Math.cos(ang) * radius, center[1] + Math.sin(ang * 2) * 0.8, center[2] + Math.sin(ang) * radius * 0.7)
    at(a, group.current.position)
    at(a + 0.02, tmp.ahead)
    group.current.lookAt(group.current.parent!.localToWorld(tmp.ahead))
    group.current.rotateZ(-0.28) // banked into the circle
  })

  return (
    <group ref={group}>
      {/* no shadow: seen mostly off-frame, its shadow read as a stray blot on the sand */}
      <mesh ref={mesh} geometry={geometry} material={material} scale={1.25} />
    </group>
  )
}
