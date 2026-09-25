import * as THREE from 'three'

/**
 * Tube whose radius follows `radius(t)` along any curve — used for teeth,
 * lure stalks, fin rays and (later) jellyfish tentacles. A radius of 0 at the
 * end produces a clean point.
 */
export function taperedTube(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments: number,
  radialSegments: number,
  radius: (t: number) => number,
) {
  const frames = curve.computeFrenetFrames(tubularSegments, false)
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const p = new THREE.Vector3()
  const nrm = new THREE.Vector3()

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments
    curve.getPointAt(t, p)
    const N = frames.normals[i], B = frames.binormals[i]
    const r = radius(t)
    for (let j = 0; j <= radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2
      const s = Math.sin(a), c = -Math.cos(a)
      nrm.set(c * N.x + s * B.x, c * N.y + s * B.y, c * N.z + s * B.z).normalize()
      positions.push(p.x + r * nrm.x, p.y + r * nrm.y, p.z + r * nrm.z)
      normals.push(nrm.x, nrm.y, nrm.z)
      uvs.push(j / radialSegments, t)
    }
  }
  const row = radialSegments + 1
  for (let i = 0; i < tubularSegments; i++)
    for (let j = 0; j < radialSegments; j++) {
      const a = i * row + j, b = (i + 1) * row + j, c = (i + 1) * row + j + 1, d = i * row + j + 1
      indices.push(a, b, d, b, c, d)
    }

  const g = new THREE.BufferGeometry()
  g.setIndex(indices)
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  return g
}

export interface FanFinOptions {
  /** Half-angle of the fan in radians. */
  spread: number
  /** Length of the fin at a normalised angle a ∈ [-1, 1]. */
  length: (a: number) => number
  rays: number
  /** Depth of the pleats between rays. */
  pleat?: number
  /** Sideways cupping of the whole membrane. */
  cup?: number
  angularSegments?: number
  radialSegments?: number
}

/**
 * Pleated fan membrane lying in the local YZ plane and opening towards -Z.
 * The corrugation between fin rays is what makes it read as a real fin
 * instead of a flat card.
 */
export function fanFin(o: FanFinOptions) {
  const A = o.angularSegments ?? o.rays * 6
  const R = o.radialSegments ?? 12
  const pleat = o.pleat ?? 0.012
  const cup = o.cup ?? 0.04
  const g = new THREE.BufferGeometry()
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= A; i++) {
    const u = i / A
    const a = u * 2 - 1
    const phi = a * o.spread
    const len = o.length(a)
    for (let j = 0; j <= R; j++) {
      const v = j / R
      const r = v * len
      const x = Math.cos(u * Math.PI * o.rays) * pleat * v + cup * v * v * (1 - a * a)
      pos.push(x, Math.sin(phi) * r, -Math.cos(phi) * r)
      uv.push(u, v)
    }
  }
  for (let i = 0; i < A; i++)
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = (i + 1) * (R + 1) + j
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  g.setIndex(idx)
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}
