import { useEffect } from 'react'
import * as THREE from 'three'
import type { DiscoveryId } from '../lib/discoveries'

/**
 * Picking without raycasts: each creature registers a way to report where it
 * currently is (one or more bounding spheres in world space). Hit tests only
 * run on pointer events / hover and only for the zone on screen — a dozen
 * projections instead of triangle intersection against skinned meshes.
 */
export interface Discoverable {
  /** Zone index, or null for creatures between zones (the whale). */
  zone: number | null
  /** Calls `emit(center, radius)` for each candidate sphere, in world space. */
  sample: (emit: (center: THREE.Vector3, radius: number) => void, time: number) => void
  /** Optional gate (e.g. only while the whale is in view). */
  active?: () => boolean
}

export const discoverables = new Map<DiscoveryId, Discoverable>()

export function useDiscoverable(id: DiscoveryId, d: Discoverable) {
  useEffect(() => {
    discoverables.set(id, d)
    return () => {
      if (discoverables.get(id) === d) discoverables.delete(id)
    }
  }, [id, d])
}

const tmp = new THREE.Vector3()

export interface Hit {
  id: DiscoveryId
  /** Screen position (CSS px) of the matched sphere. */
  x: number
  y: number
  /** Distance in units of the sphere's screen radius (smaller = better). */
  score: number
  world: THREE.Vector3
}

/** Best creature under (px, py), or null. */
export function hitTest(px: number, py: number, camera: THREE.PerspectiveCamera, w: number, h: number, zone: number, time: number): Hit | null {
  let best: Hit | null = null
  const focal = h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  for (const [id, d] of discoverables) {
    if (d.zone !== null && d.zone !== zone) continue
    if (d.active && !d.active()) continue
    d.sample((c, r) => {
      const dist = c.distanceTo(camera.position)
      tmp.copy(c).project(camera)
      if (tmp.z > 1 || tmp.z < -1) return
      const x = (tmp.x * 0.5 + 0.5) * w
      const y = (-tmp.y * 0.5 + 0.5) * h
      // generous for small things (fingers), never bigger than ~a fifth of the screen
      const rPx = THREE.MathUtils.clamp((r / dist) * focal, 26, Math.min(w, h) * 0.2)
      const score = Math.hypot(px - x, py - y) / rPx
      if (score < 1 && (!best || score < best.score)) best = { id, x, y, score, world: c.clone() }
    }, time)
  }
  return best
}

/** Screen position of a creature (first on-screen sphere), for hint rings. */
export function screenPosition(d: Discoverable, camera: THREE.Camera, w: number, h: number, time: number, out: { x: number; y: number }) {
  let ok = false
  d.sample((c) => {
    if (ok) return
    tmp.copy(c).project(camera)
    if (tmp.z > 1 || tmp.z < -1 || Math.abs(tmp.x) > 0.92 || Math.abs(tmp.y) > 0.9) return
    out.x = (tmp.x * 0.5 + 0.5) * w
    out.y = (-tmp.y * 0.5 + 0.5) * h
    ok = true
  }, time)
  return ok
}
