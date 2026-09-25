// Seeded 3D gradient noise (improved Perlin) + fBm helpers used to sculpt
// procedural geometry and bake textures on the CPU.

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRng(seed = 1) {
  return mulberry32(seed)
}

const GRAD = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

export class Noise3D {
  private perm = new Uint8Array(512)

  constructor(seed = 1) {
    const rng = mulberry32(seed)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      const t = p[i]
      p[i] = p[j]
      p[j] = t
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
  }

  /** Gradient noise in roughly [-1, 1]. */
  noise(x: number, y: number, z: number): number {
    const P = this.perm
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z)
    const xf = x - X, yf = y - Y, zf = z - Z
    const xi = X & 255, yi = Y & 255, zi = Z & 255
    const u = fade(xf), v = fade(yf), w = fade(zf)
    const g = (h: number, dx: number, dy: number, dz: number) => {
      const gr = GRAD[h % 12]
      return gr[0] * dx + gr[1] * dy + gr[2] * dz
    }
    const aaa = P[P[P[xi] + yi] + zi], aba = P[P[P[xi] + yi + 1] + zi]
    const aab = P[P[P[xi] + yi] + zi + 1], abb = P[P[P[xi] + yi + 1] + zi + 1]
    const baa = P[P[P[xi + 1] + yi] + zi], bba = P[P[P[xi + 1] + yi + 1] + zi]
    const bab = P[P[P[xi + 1] + yi] + zi + 1], bbb = P[P[P[xi + 1] + yi + 1] + zi + 1]
    const x1 = lerp(g(aaa, xf, yf, zf), g(baa, xf - 1, yf, zf), u)
    const x2 = lerp(g(aba, xf, yf - 1, zf), g(bba, xf - 1, yf - 1, zf), u)
    const x3 = lerp(g(aab, xf, yf, zf - 1), g(bab, xf - 1, yf, zf - 1), u)
    const x4 = lerp(g(abb, xf, yf - 1, zf - 1), g(bbb, xf - 1, yf - 1, zf - 1), u)
    return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w)
  }

  fbm(x: number, y: number, z: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let sum = 0, amp = 0.5, freq = 1
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq, z * freq)
      freq *= lacunarity
      amp *= gain
    }
    return sum
  }

  /** Ridged multifractal — sharp creases, good for wrinkles and rock. */
  ridged(x: number, y: number, z: number, octaves = 4): number {
    let sum = 0, amp = 0.5, freq = 1
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise(x * freq, y * freq, z * freq))
      sum += amp * n * n
      freq *= 2
      amp *= 0.5
    }
    return sum
  }
}

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function clamp(x: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, x))
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/**
 * Smooth 1D profile through (t, value) keys — monotone cubic Hermite, so the
 * silhouette never overshoots between keys.
 */
export function profile(keys: ReadonlyArray<readonly [number, number]>) {
  const n = keys.length
  const xs = keys.map((k) => k[0])
  const ys = keys.map((k) => k[1])
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  const m: number[] = [d[0]]
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  m.push(d[n - 2])
  return (x: number) => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i]
    const t = (x - xs[i]) / h
    const t2 = t * t, t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    )
  }
}
