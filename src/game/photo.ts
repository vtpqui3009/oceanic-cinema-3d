import * as THREE from 'three'
import { smoothstep } from '../lib/noise'
import type { DiscoveryId } from '../lib/discoveries'
import { discoverables } from '../interaction/discoverables'

/**
 * Photo judging, from the bounding spheres the creatures already publish
 * (no raycasts, no pixel reads). A good wildlife shot has the animal
 * centred, big enough to read but not cropped, and sharp.
 */
export interface Framing {
  id: DiscoveryId
  /** 0…1 from composition only (centre + fill). */
  quality: number
  /** Screen position (CSS px) and radius (px) of the subject. */
  x: number
  y: number
  r: number
  world: THREE.Vector3
}

const tmp = new THREE.Vector3()
const best = new THREE.Vector3()

export function evaluateFrame(camera: THREE.PerspectiveCamera, w: number, h: number, zone: number, sight: number, time: number): Framing | null {
  const focal = h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  let out: Framing | null = null
  for (const [id, d] of discoverables) {
    if (d.zone !== null && d.zone !== zone) continue
    if (d.active && !d.active()) continue
    d.sample((c, r) => {
      const dist = c.distanceTo(camera.position)
      if (dist > sight + r) return
      tmp.copy(c).project(camera)
      if (tmp.z > 1 || tmp.z < -1) return
      const x = (tmp.x * 0.5 + 0.5) * w
      const y = (-tmp.y * 0.5 + 0.5) * h
      const rPx = (r / Math.max(dist, 0.1)) * focal
      const off = Math.hypot(x - w / 2, y - h / 2) / (h / 2)
      const fill = (2 * rPx) / h
      if (off > 0.75 || fill < 0.02) return
      // ideal: subject spans 12–35 % of the frame height
      const fillScore = fill < 0.12 ? smoothstep(0.02, 0.12, fill) : 1 - smoothstep(0.35, 1, fill)
      const centre = 1 - smoothstep(0.08, 0.6, off)
      // murky water softens distant subjects
      const clarity = 1 - smoothstep(sight * 0.55, sight, dist) * 0.6
      const quality = (centre * 0.5 + fillScore * 0.5) * clarity
      if (!out || quality > out.quality) {
        best.copy(c)
        out = { id, quality, x, y, r: rPx, world: best }
      }
    }, time)
  }
  return out
}

/** Stars for a shot: composition, lowered by motion blur. */
export function starsFor(quality: number, speed: number, turnRate: number) {
  const sharp = 1 - smoothstep(0.9, 3.2, speed) * 0.7 - smoothstep(0.6, 2.5, turnRate) * 0.5
  const total = quality * (0.65 + 0.35 * Math.max(sharp, 0))
  return total >= 0.74 ? 3 : total >= 0.46 ? 2 : 1
}

let snapCanvas: HTMLCanvasElement | null = null

/**
 * Copies the frame that was just rendered into a small JPEG. Must run in
 * the same task as the render (after the composer), while the WebGL drawing
 * buffer still holds the image — so no preserveDrawingBuffer (which would
 * cost every frame) is needed.
 */
export function captureThumbnail(source: HTMLCanvasElement, w = 320, h = 180) {
  try {
    snapCanvas ??= document.createElement('canvas')
    snapCanvas.width = w
    snapCanvas.height = h
    const ctx = snapCanvas.getContext('2d')
    if (!ctx) return ''
    // centre crop to 16:9
    const sw = source.width, sh = source.height
    const aspect = w / h
    let cw = sw, ch = sw / aspect
    if (ch > sh) {
      ch = sh
      cw = sh * aspect
    }
    ctx.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h)
    return snapCanvas.toDataURL('image/jpeg', 0.74)
  } catch {
    return ''
  }
}
