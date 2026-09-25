import * as THREE from 'three'
import { Noise3D, clamp, smoothstep } from './noise'

// CPU-baked PBR maps. Everything is sampled on a cylinder so the maps wrap
// seamlessly around lofted bodies (u = around, v = along).

type Sampler = (x: number, y: number, z: number, u: number, v: number) => number

function cylinderSample(size: number, aspect: number, fn: Sampler) {
  const out = new Float32Array(size * size)
  const R = 1 / (2 * Math.PI)
  for (let j = 0; j < size; j++) {
    const v = j / size
    for (let i = 0; i < size; i++) {
      const u = i / size
      const a = u * Math.PI * 2
      out[j * size + i] = fn(Math.cos(a) * R, Math.sin(a) * R, v * aspect, u, v)
    }
  }
  return out
}

function toCanvas(size: number, write: (i: number, px: Uint8ClampedArray, o: number) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) write(i, img.data, i * 4)
  ctx.putImageData(img, 0, 0)
  return canvas
}

function finish(canvas: HTMLCanvasElement, color: boolean, anisotropy = 4) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.anisotropy = anisotropy
  tex.needsUpdate = true
  return tex
}

/** Tangent-space normal map from a height field (Sobel), wrapping in u. */
function heightToNormal(h: Float32Array, size: number, strength: number) {
  return toCanvas(size, (i, px, o) => {
    const x = i % size, y = (i / size) | 0
    const at = (xx: number, yy: number) => h[clamp(yy, 0, size - 1) * size + ((xx + size) % size)]
    const dx =
      at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
    const dy =
      at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))
    let nx = -dx * strength, ny = -dy * strength
    const nz = 1
    const l = Math.hypot(nx, ny, nz)
    nx /= l
    ny /= l
    px[o] = (nx * 0.5 + 0.5) * 255
    px[o + 1] = (ny * 0.5 + 0.5) * 255
    px[o + 2] = (nz / l) * 0.5 * 255 + 127
    px[o + 3] = 255
  })
}

export interface SkinOptions {
  size?: number
  seed?: number
  /** Body length / circumference ratio so features aren't stretched along v. */
  aspect?: number
  base: THREE.ColorRepresentation
  dark: THREE.ColorRepresentation
  light: THREE.ColorRepresentation
  wartScale?: number
}

/** Mottled, warty, wrinkled deep-sea skin: albedo + normal + roughness. */
export function bakeSkin(opts: SkinOptions) {
  const size = opts.size ?? 512
  const n = new Noise3D(opts.seed ?? 7)
  const aspect = opts.aspect ?? 1.6
  const ws = opts.wartScale ?? 38

  const mottle = cylinderSample(size, aspect, (x, y, z) => n.fbm(x * 6, y * 6, z * 6, 5))
  const height = cylinderSample(size, aspect, (x, y, z) => {
    const warts = Math.pow(Math.max(0, n.noise(x * ws, y * ws, z * ws)), 2.2) * 0.7
    const wrinkles = n.ridged(x * 7 + 3, y * 7, z * 10, 4) * 0.8 + n.fbm(x * 3, y * 3, z * 3, 3) * 0.5
    const pores = n.noise(x * 120, y * 120, z * 120) * 0.12
    return warts + wrinkles + pores
  })

  const base = new THREE.Color(opts.base), dark = new THREE.Color(opts.dark), light = new THREE.Color(opts.light)
  const c = new THREE.Color()
  const albedo = toCanvas(size, (i, px, o) => {
    const m = mottle[i] * 0.5 + 0.5
    c.copy(dark).lerp(base, smoothstep(0.25, 0.55, m)).lerp(light, smoothstep(0.62, 0.85, m) * 0.6)
    // warts catch a little lighter tissue on top
    c.lerp(light, clamp(height[i] - 0.9) * 0.35)
    px[o] = c.r * 255
    px[o + 1] = c.g * 255
    px[o + 2] = c.b * 255
    px[o + 3] = 255
  })
  const rough = toCanvas(size, (i, px, o) => {
    // slime pools in the creases (lower = wetter/glossier)
    const r = clamp(0.38 + height[i] * 0.3 + mottle[i] * 0.15, 0.15, 0.9) * 255
    px[o] = px[o + 1] = px[o + 2] = r
    px[o + 3] = 255
  })

  return {
    map: finish(albedo, true),
    normalMap: finish(heightToNormal(height, size, 2.2), false),
    roughnessMap: finish(rough, false),
  }
}

/** Fin membrane: radial rays + ragged translucent edge, as an alpha map. */
export function bakeFinAlpha(rays: number, seed = 3, size = 256) {
  const n = new Noise3D(seed)
  const canvas = toCanvas(size, (i, px, o) => {
    const u = (i % size) / size, v = ((i / size) | 0) / size
    const ray = Math.pow(Math.abs(Math.cos(u * Math.PI * rays)), 18)
    const tear = n.fbm(u * 9, v * 3, 0.5, 3) * 0.18
    const edge = 1 - smoothstep(0.78 + tear, 0.97 + tear, v + (1 - ray) * 0.08)
    const membrane = 0.55 + 0.25 * n.fbm(u * 20, v * 12, 1.7, 3)
    const a = clamp(Math.max(membrane, ray * 0.95) * edge) * 255
    px[o] = px[o + 1] = px[o + 2] = a
    px[o + 3] = 255
  })
  const tex = finish(canvas, false)
  tex.wrapS = THREE.ClampToEdgeWrapping
  return tex
}

/** Bioluminescent esca: hot photophore core with branching light-guide veins. */
export function bakeLureEmissive(seed = 11, size = 256) {
  const n = new Noise3D(seed)
  const canvas = toCanvas(size, (i, px, o) => {
    const u = (i % size) / size, v = ((i / size) | 0) / size
    const a = u * Math.PI * 2
    const x = Math.cos(a) * 0.4, y = Math.sin(a) * 0.4
    // veins: thin ridges of noise running along the bulb
    const vein = Math.pow(1 - Math.abs(n.noise(x * 4, y * 4, v * 5)), 14)
    const core = Math.pow(1 - v, 1.4) // brightest at the hanging tip
    const speck = Math.pow(Math.max(0, n.noise(x * 30, y * 30, v * 30)), 3) * 2
    const e = clamp(core * 0.85 + vein * (0.35 + core) + speck * core)
    // slight hue shift: cyan core, greener veins
    px[o] = e * 150
    px[o + 1] = e * 255
    px[o + 2] = clamp(e * 1.1 - vein * 0.25) * 255
    px[o + 3] = 255
  })
  const tex = finish(canvas, true)
  return tex
}

/** Generic tiling ground maps (sediment ripples + pebbles). */
export function bakeSediment(seed = 21, size = 512) {
  const n = new Noise3D(seed)
  const h = new Float32Array(size * size)
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      // sample on a torus so the texture tiles in both directions
      const a = (i / size) * Math.PI * 2, b = (j / size) * Math.PI * 2
      const x = Math.cos(a), y = Math.sin(a), z = Math.cos(b) * 1.3 + 0, w = Math.sin(b) * 1.3
      const ripple = Math.sin((j / size) * Math.PI * 2 * 14 + n.fbm(x * 2, y * 2, z * 2 + w, 3) * 6) * 0.15
      const grains = n.fbm(x * 6 + w, y * 6, z * 6, 5) * 0.6
      const pebble = Math.pow(Math.max(0, n.noise(x * 11, y * 11 + w * 11, z * 11)), 2) * 1.4
      h[j * size + i] = ripple + grains + pebble
    }
  const albedo = toCanvas(size, (i, px, o) => {
    const t = clamp(h[i] * 0.5 + 0.45)
    px[o] = 18 + t * 30
    px[o + 1] = 22 + t * 32
    px[o + 2] = 26 + t * 36
    px[o + 3] = 255
  })
  const map = finish(albedo, true)
  const normalMap = finish(heightToNormal(h, size, 3), false)
  for (const t of [map, normalMap]) t.wrapT = THREE.RepeatWrapping
  return { map, normalMap }
}

/**
 * Crown-jelly light display: radial canals running to each lappet, a ring
 * of photocytes around the coronal groove and a brighter marginal band.
 * v ∈ [0, 0.5] is the outer bell (apex → margin), [0.5, 1] the underside.
 */
export function bakeJellyEmissive(lappets: number, seed = 13, size = 512) {
  const n = new Noise3D(seed)
  const canvas = toCanvas(size, (i, px, o) => {
    const u = (i % size) / size, v = ((i / size) | 0) / size
    const a = u * Math.PI * 2
    const x = Math.cos(a) * 1.3, y = Math.sin(a) * 1.3
    let e = 0
    if (v < 0.5) {
      const vo = v / 0.5
      const canal = Math.pow(Math.abs(Math.cos(u * Math.PI * lappets)), 90) * smoothstep(0.15, 0.55, vo)
      const branch = Math.pow(1 - Math.abs(n.noise(x * 6, y * 6, vo * 8)), 30) * smoothstep(0.3, 0.9, vo) * 0.5
      // photocyte ring at the coronal groove, beaded
      const ring = Math.exp(-Math.pow((vo - 0.5) / 0.03, 2))
      const beads = Math.pow(Math.max(0, Math.cos(u * Math.PI * 2 * lappets * 3)), 6)
      const margin = smoothstep(0.86, 0.98, vo) * (0.6 + 0.4 * beads)
      e = canal * 0.6 + branch + ring * (0.35 + 0.9 * beads) + margin
    } else {
      const vi = (v - 0.5) / 0.5
      // coronal muscle rings glowing faintly on the underside
      e = (0.25 + 0.2 * Math.sin(vi * 60)) * (1 - smoothstep(0, 0.35, vi))
    }
    e = clamp(e)
    px[o] = e * 90
    px[o + 1] = e * 190
    px[o + 2] = e * 255
    px[o + 3] = 255
  })
  const tex = finish(canvas, true)
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

/**
 * Squid skin: burgundy ground with expanded/contracted chromatophores
 * (dark and orange dots at several sizes), iridophore sheen streaks and
 * countershading (dark back, paler belly). u = around (0.25 = dorsal).
 */
export function bakeChromatophores(opts: { seed?: number; size?: number; aspect?: number }) {
  const size = opts.size ?? 1024
  const n = new Noise3D(opts.seed ?? 17)
  const aspect = opts.aspect ?? 3
  const spots = cylinderSample(size, aspect, (x, y, z) => n.noise(x * 60, y * 60, z * 60))
  const spotsBig = cylinderSample(size, aspect, (x, y, z) => n.noise(x * 22 + 5, y * 22, z * 22))
  const tone = cylinderSample(size, aspect, (x, y, z) => n.fbm(x * 4, y * 4, z * 4, 4))
  const dark = new THREE.Color('#2a0409'), base = new THREE.Color('#7c1a26'), orange = new THREE.Color('#d0543a'), pale = new THREE.Color('#e4a39a')
  const c = new THREE.Color()
  const albedo = toCanvas(size, (i, px, o) => {
    const u = (i % size) / size
    const belly = smoothstep(0.1, 0.9, (-Math.sin(u * Math.PI * 2) + 1) / 2)
    c.copy(base).lerp(dark, 0.35 - tone[i] * 0.4).lerp(pale, belly * 0.28)
    c.lerp(dark, smoothstep(0.32, 0.45, spots[i]) * 0.85)
    c.lerp(orange, smoothstep(0.38, 0.5, spotsBig[i]) * 0.7)
    px[o] = c.r * 255
    px[o + 1] = c.g * 255
    px[o + 2] = c.b * 255
    px[o + 3] = 255
  })
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) height[i] = smoothstep(0.3, 0.5, spots[i]) * 0.6 + smoothstep(0.35, 0.5, spotsBig[i]) * 0.8 + tone[i] * 0.3
  const rough = toCanvas(size, (i, px, o) => {
    const r = clamp(0.3 + tone[i] * 0.2 + height[i] * 0.1) * 255
    px[o] = px[o + 1] = px[o + 2] = r
    px[o + 3] = 255
  })
  return {
    map: finish(albedo, true),
    normalMap: finish(heightToNormal(height, size, 1.2), false),
    roughnessMap: finish(rough, false),
  }
}
