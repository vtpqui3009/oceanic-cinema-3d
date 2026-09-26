import { useMemo } from 'react'
import * as THREE from 'three'
import { subjects } from '../lib/dive'
import { useDiscoverable, type Discoverable } from './discoverables'

/**
 * The four hero creatures already publish their live world position in
 * `subjects[]` (the camera and depth of field use it); picking reuses it.
 */
export function MainDiscoverables() {
  const t = useMemo(() => new THREE.Vector3(), [])
  // offsets pre-built: hint rings sample these every frame, so no allocation
  const from = (i: number, spheres: [number, number, number, number][]): Discoverable => {
    const offs = spheres.map(([x, y, z, r]) => ({ o: new THREE.Vector3(x, y, z), r }))
    return {
      zone: i,
      sample: (emit) => {
        const s = subjects[i]
        if (!s) return
        for (const { o, r } of offs) emit(t.copy(s).add(o), r)
      },
    }
  }
  useDiscoverable('barramundi', useMemo(() => from(0, [[0, 0, 0, 1.5]]), []))
  // subjects[1] sits under the bell (framing); the bell is ~0.8 above it
  useDiscoverable('atolla', useMemo(() => from(1, [[0, 0.8, 0, 1.0], [0, -0.2, 0, 1.0]]), []))
  useDiscoverable('squid', useMemo(() => from(2, [[0, 0, 0, 1.4]]), []))
  // subjects[3] is the anglerfish's face; add the body and the lure
  useDiscoverable('anglerfish', useMemo(() => from(3, [[0, 0, 0, 0.9], [-0.3, 0, -0.6, 0.9], [0, 0.55, 0.45, 0.35]]), []))
  return null
}
