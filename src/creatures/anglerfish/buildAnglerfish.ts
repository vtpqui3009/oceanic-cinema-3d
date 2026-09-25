import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Noise3D, createRng, lerp, profile, smoothstep } from '../../lib/noise'
import { fanFin, taperedTube } from '../../lib/geometry'
import { bakeFinAlpha, bakeLureEmissive, bakeSkin } from '../../lib/textures'

/**
 * Procedural, skeletally-rigged deep-sea anglerfish (Melanocetus-like).
 *
 * The body is ONE continuous lofted surface: outer skin → rolled lip → mouth
 * cavity → closed gullet, so the open mouth has real depth instead of a
 * backface. A generated skeleton (5 spine bones + jaw) is skinned with
 * smooth weights; fins, teeth, eyes and the lure ride on the bones.
 *
 * Fish faces +Z, up is +Y, length ≈ 1.9 units.
 */

export interface AnglerfishRig {
  root: THREE.Group
  body: THREE.SkinnedMesh
  head: THREE.Bone
  jaw: THREE.Bone
  spine: THREE.Bone[]
  finL: THREE.Object3D
  finR: THREE.Object3D
  /** Pivot at the base of the illicium; rotate it to sway the lure. */
  lurePivot: THREE.Group
  /** Mid-joint of the illicium for a second, lagging sway. */
  lureJoint: THREE.Group
  /** Where the bioluminescent light should live (centre of the esca). */
  lureAnchor: THREE.Group
  bulbMaterial: THREE.MeshPhysicalMaterial
  coreMaterial: THREE.MeshBasicMaterial
  halo: THREE.Sprite
  dispose: () => void
}

export interface BuildOptions {
  quality: 'high' | 'low'
}

// ---- silhouette ----------------------------------------------------------
const Z0 = -1.1
const LEN = 1.9
const zAt = (t: number) => Z0 + t * LEN
const W = profile([
  [0, 0], [0.03, 0.05], [0.12, 0.11], [0.3, 0.29], [0.5, 0.46], [0.66, 0.52], [0.8, 0.51], [0.92, 0.49], [1, 0.47],
])
const H = profile([
  [0, 0], [0.03, 0.08], [0.12, 0.17], [0.3, 0.39], [0.5, 0.57], [0.66, 0.6], [0.8, 0.5], [0.92, 0.37], [1, 0.25],
])
const OY = profile([[0, 0.03], [0.5, 0.06], [0.8, 0.08], [1, 0.06]])
// hump behind the head where the illicium is rooted
const RIDGE = profile([[0, 0], [0.45, 0.02], [0.72, 0.06], [0.85, 0.03], [1, 0]])

const BONE_Y = 0.05
const HEAD_Z = 0.3
const SPINE_Z = [HEAD_Z, 0.0, -0.3, -0.6, -0.85, -1.05]
const HINGE = new THREE.Vector3(0, -0.02, 0.28)

/** Point on the lofted outer surface (before noise). */
function surface(t: number, theta: number, out = new THREE.Vector3()) {
  const s = Math.sin(theta), c = Math.cos(theta)
  const front = smoothstep(0.8, 1, t)
  const lower = s < 0
  const w = W(t) * (lower ? lerp(1, 1.07, front) : 1)
  const h = H(t)
  const x = w * c
  const y = OY(t) + h * s * (lower ? 0.93 : 1) + RIDGE(t) * Math.pow(Math.max(0, s), 6) + (lower ? front * 0.05 * Math.pow(-s, 2) : 0)
  // underbite: lower rim juts forward, upper rim tucks back
  const z = zAt(t) + front * (lower ? 0.17 * Math.pow(-s, 1.2) : -0.08 * s)
  return out.set(x, y, z)
}

export function buildAnglerfish({ quality }: BuildOptions): AnglerfishRig {
  const hi = quality === 'high'
  const noise = new Noise3D(42)
  const rng = createRng(1337)
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)

  // ---- skeleton ------------------------------------------------------------
  const bones: THREE.Bone[] = SPINE_Z.map(() => new THREE.Bone())
  bones[0].name = 'head'
  bones[0].position.set(0, BONE_Y, HEAD_Z)
  for (let i = 1; i < bones.length; i++) {
    bones[i].name = `spine${i}`
    bones[i].position.set(0, 0, SPINE_Z[i] - SPINE_Z[i - 1])
    bones[i - 1].add(bones[i])
  }
  const jaw = new THREE.Bone()
  jaw.name = 'jaw'
  jaw.position.set(HINGE.x, HINGE.y - BONE_Y, HINGE.z - HEAD_Z)
  bones[0].add(jaw)
  const allBones = [...bones, jaw]
  const JAW = allBones.length - 1
  const boneRest = (b: THREE.Bone) => {
    b.updateWorldMatrix(true, false)
    return new THREE.Vector3().setFromMatrixPosition(b.matrixWorld)
  }

  // ---- body loft -----------------------------------------------------------
  const RINGS_OUT = hi ? 120 : 70
  const RINGS_LIP = 5
  const RINGS_CAV = hi ? 18 : 10
  const SEG = hi ? 80 : 48
  const ringCount = RINGS_OUT + RINGS_LIP + RINGS_CAV
  const cols = SEG + 1

  const pos = new Float32Array(ringCount * cols * 3)
  const uv = new Float32Array(ringCount * cols * 2)
  const col = new Float32Array(ringCount * cols * 3)
  const noiseAmp = new Float32Array(ringCount * cols)
  const p = new THREE.Vector3()
  const rim = new THREE.Vector3()
  const mouthDark = new THREE.Color('#2a0c0e')

  let r = 0
  const writeRing = (fn: (theta: number, j: number) => { p: THREE.Vector3; v: number; inner: number; amp: number }) => {
    for (let j = 0; j <= SEG; j++) {
      const theta = (j / SEG) * Math.PI * 2
      const res = fn(theta, j)
      const k = r * cols + j
      pos.set([res.p.x, res.p.y, res.p.z], k * 3)
      uv.set([j / SEG, res.v], k * 2)
      const c = new THREE.Color(1, 1, 1).lerp(mouthDark, res.inner)
      col.set([c.r, c.g, c.b], k * 3)
      noiseAmp[k] = res.amp
    }
    r++
  }

  for (let i = 0; i < RINGS_OUT; i++) {
    const t = i / (RINGS_OUT - 1)
    const amp = 0.02 * smoothstep(0.02, 0.12, t) * (1 - smoothstep(0.9, 1, t))
    writeRing((th) => ({ p: surface(t, th, p), v: t * 0.9, inner: 0, amp }))
  }
  // lip: rolls forward a touch then curls inward
  for (let i = 1; i <= RINGS_LIP; i++) {
    const s = i / RINGS_LIP
    writeRing((th) => {
      surface(1, th, rim)
      const oy = OY(1)
      const k = 1 - 0.13 * Math.sin((s * Math.PI) / 2)
      p.set(rim.x * k, oy + (rim.y - oy) * k, rim.z + 0.03 * Math.sin(s * Math.PI) - 0.02 * s)
      return { p, v: 0.9 + s * 0.02, inner: s * 0.6, amp: 0 }
    })
  }
  // mouth cavity narrowing to a closed gullet
  const zThroat = 0.05
  for (let i = 1; i <= RINGS_CAV; i++) {
    const s = i / RINGS_CAV
    writeRing((th) => {
      surface(1, th, rim)
      const oy = OY(1)
      const k = 0.87 * Math.pow(1 - s, 0.55)
      const rimZ = rim.z - 0.02
      p.set(rim.x * k, oy - 0.04 * s + (rim.y - oy) * k, lerp(rimZ, zThroat, Math.pow(s, 0.8)))
      return { p, v: 0.92 + s * 0.08, inner: 1, amp: 0.006 * (1 - s) }
    })
  }

  const idx: number[] = []
  for (let i = 0; i < ringCount - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }

  const bodyGeo = new THREE.BufferGeometry()
  bodyGeo.setIndex(idx)
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  bodyGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  bodyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3))

  const fixSeam = () => {
    const n = bodyGeo.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < ringCount; i++) {
      const a = i * cols, b = i * cols + SEG
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b)
      const l = Math.hypot(x, y, z) || 1
      n.setXYZ(a, x / l, y / l, z / l)
      n.setXYZ(b, x / l, y / l, z / l)
    }
  }
  bodyGeo.computeVertexNormals()
  fixSeam()
  // organic lumps/folds along the normal
  {
    const n = bodyGeo.attributes.normal as THREE.BufferAttribute
    for (let k = 0; k < ringCount * cols; k++) {
      const amp = noiseAmp[k]
      if (!amp) continue
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2]
      const d = noise.fbm(x * 3.2, y * 3.2, z * 3.2, 4) + 0.35 * noise.ridged(x * 7, y * 7, z * 5, 3)
      pos[k * 3] += n.getX(k) * d * amp
      pos[k * 3 + 1] += n.getY(k) * d * amp
      pos[k * 3 + 2] += n.getZ(k) * d * amp
    }
    bodyGeo.computeVertexNormals()
    fixSeam()
  }
  bodyGeo.computeTangents()

  // ---- skin weights ----------------------------------------------------------
  const skinIndex = new Uint16Array(ringCount * cols * 4)
  const skinWeight = new Float32Array(ringCount * cols * 4)
  for (let k = 0; k < ringCount * cols; k++) {
    const y = pos[k * 3 + 1], z = pos[k * 3 + 2]
    const infl: [number, number][] = []
    if (z >= SPINE_Z[0]) infl.push([0, 1])
    else if (z <= SPINE_Z[SPINE_Z.length - 1]) infl.push([SPINE_Z.length - 1, 1])
    else
      for (let b = 0; b < SPINE_Z.length - 1; b++)
        if (z <= SPINE_Z[b] && z > SPINE_Z[b + 1]) {
          const f = smoothstep(0, 1, (SPINE_Z[b] - z) / (SPINE_Z[b] - SPINE_Z[b + 1]))
          infl.push([b, 1 - f], [b + 1, f])
        }
    // lower jaw: everything below the mouth line in front of the hinge
    const below = smoothstep(OY(1) + 0.02, OY(1) - 0.16, y)
    const jawW = below * smoothstep(HINGE.z - 0.06, HINGE.z + 0.3, z)
    const out: [number, number][] = []
    for (const [b, w] of infl) {
      if (b === 0) {
        out.push([0, w * (1 - jawW)], [JAW, w * jawW])
      } else out.push([b, w])
    }
    out.sort((a, b) => b[1] - a[1])
    for (let s = 0; s < 4; s++) {
      skinIndex[k * 4 + s] = out[s]?.[0] ?? 0
      skinWeight[k * 4 + s] = out[s]?.[1] ?? 0
    }
  }
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  track(bodyGeo)

  // ---- materials -------------------------------------------------------------
  const skin = bakeSkin({ base: '#3a302b', dark: '#100c0c', light: '#6e5a50', size: hi ? 1024 : 512, aspect: 2.2 })
  Object.values(skin).forEach(track)
  const bodyMat = track(
    new THREE.MeshPhysicalMaterial({
      map: skin.map,
      normalMap: skin.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: skin.roughnessMap,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
      clearcoat: 0.65,
      clearcoatRoughness: 0.32,
      sheen: 0.35,
      sheenColor: new THREE.Color('#2e4250'),
      sheenRoughness: 0.6,
      envMapIntensity: 0.8,
    }),
  )

  const body = new THREE.SkinnedMesh(bodyGeo, bodyMat)
  body.name = 'anglerfish-body'
  body.castShadow = true
  body.receiveShadow = true
  body.add(bones[0])
  body.updateMatrixWorld(true) // skeleton inverses are taken from the rest pose
  body.bind(new THREE.Skeleton(allBones))
  body.frustumCulled = false

  const root = new THREE.Group()
  root.name = 'anglerfish'
  root.add(body)

  const headRest = boneRest(bones[0])
  const jawRest = boneRest(jaw)

  // ---- teeth -----------------------------------------------------------------
  const toothMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#efe6d2',
      roughness: 0.16,
      thickness: 0.04,
      ior: 1.52,
      attenuationColor: new THREE.Color('#cdb58e'),
      attenuationDistance: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
    }),
  )
  const buildTeeth = (from: number, to: number, count: number, upper: boolean, origin: THREE.Vector3) => {
    const parts: THREE.BufferGeometry[] = []
    const oy = OY(1)
    for (let i = 0; i < count; i++) {
      const th = lerp(from, to, (i + 0.5 + (rng() - 0.5) * 0.4) / count)
      surface(1, th, rim)
      const centre = new THREE.Vector3(0, oy, rim.z)
      const inward = centre.clone().sub(rim).normalize()
      const base = rim.clone().addScaledVector(inward, 0.035)
      const frontness = Math.abs(Math.sin(th))
      const len = (0.06 + 0.15 * Math.pow(frontness, 2)) * (0.7 + rng() * 0.6)
      const dir = new THREE.Vector3(0, upper ? -1 : 1, 0)
        .addScaledVector(inward, 0.55)
        .add(new THREE.Vector3(0, 0, upper ? -0.25 : 0.35 * frontness))
        .normalize()
      const tip = base.clone().addScaledVector(dir, len)
      const mid = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0, -0.35 * len))
      const r0 = 0.009 + 0.008 * frontness
      const g = taperedTube(new THREE.QuadraticBezierCurve3(base, mid, tip), 8, 6, (t) => r0 * Math.pow(1 - t, 0.85) + 0.0006)
      parts.push(g)
    }
    const merged = mergeGeometries(parts)!
    parts.forEach((g) => g.dispose())
    merged.translate(-origin.x, -origin.y, -origin.z)
    const m = new THREE.Mesh(track(merged), toothMat)
    m.castShadow = true
    return m
  }
  bones[0].add(buildTeeth(0.14 * Math.PI, 0.86 * Math.PI, hi ? 14 : 10, true, headRest))
  jaw.add(buildTeeth(1.1 * Math.PI, 1.9 * Math.PI, hi ? 16 : 11, false, jawRest))

  // ---- eyes ------------------------------------------------------------------
  const eyeMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#05070a',
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      iridescence: 0.4,
      iridescenceIOR: 1.6,
      sheen: 0.3,
      sheenColor: new THREE.Color('#2a6f7a'),
    }),
  )
  const eyeGeo = track(new THREE.SphereGeometry(0.04, 24, 16))
  for (const side of [1, -1]) {
    const th = side > 0 ? 0.3 * Math.PI : 0.7 * Math.PI
    surface(0.86, th, p)
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.copy(p).add(new THREE.Vector3(side * 0.012, 0.004, 0)).sub(headRest)
    eye.castShadow = true
    bones[0].add(eye)
  }

  // ---- fins ------------------------------------------------------------------
  const finAlpha = track(bakeFinAlpha(9))
  const finMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#4a3530',
      alphaMap: finAlpha,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      roughness: 0.45,
      thickness: 0.02,
      attenuationColor: new THREE.Color('#7a2d1c'),
      attenuationDistance: 0.12,
      sheen: 0.4,
      sheenColor: new THREE.Color('#5d7c8a'),
    }),
  )
  const addFin = (geo: THREE.BufferGeometry, parent: THREE.Bone, world: THREE.Vector3, rot: THREE.Euler) => {
    const m = new THREE.Mesh(track(geo), finMat)
    m.position.copy(world).sub(boneRest(parent))
    m.rotation.copy(rot)
    m.castShadow = true
    parent.add(m)
    return m
  }
  const tail = bones[bones.length - 1]
  addFin(
    fanFin({ spread: 0.62, rays: 9, length: (a) => 0.44 * (1 - 0.22 * a * a) + 0.03 * Math.cos(a * 9 * Math.PI), pleat: 0.014 }),
    tail,
    new THREE.Vector3(0, 0.035, -1.02),
    new THREE.Euler(0, 0, 0),
  )
  const pect = () => fanFin({ spread: 0.75, rays: 7, length: (a) => 0.24 * (1 - 0.3 * a * a) + 0.015 * Math.cos(a * 7 * Math.PI), cup: 0.05 })
  surface(0.52, 0, p)
  const finR = addFin(pect(), bones[1], p.clone().add(new THREE.Vector3(-0.03, -0.04, 0)), new THREE.Euler(0, -0.75, 0.35))
  const finL = addFin(pect(), bones[1], p.clone().setX(-p.x + 0.03).add(new THREE.Vector3(0, -0.04, 0)), new THREE.Euler(0, 0.75, -0.35))
  const small = (len: number) => fanFin({ spread: 0.5, rays: 6, length: (a) => len * (1 - 0.4 * a * a), pleat: 0.008 })
  surface(0.24, Math.PI / 2, p)
  addFin(small(0.2), bones[3], p.clone().add(new THREE.Vector3(0, -0.03, 0)), new THREE.Euler(0.95, 0, 0))
  surface(0.24, -Math.PI / 2, p)
  addFin(small(0.17), bones[3], p.clone().add(new THREE.Vector3(0, 0.03, 0)), new THREE.Euler(-0.95, 0, 0))

  // ---- illicium + esca (the lure) -----------------------------------------
  surface(0.77, Math.PI / 2, p)
  const lureBase = p.clone().add(new THREE.Vector3(0, -0.02, 0))
  const lurePivot = new THREE.Group()
  lurePivot.name = 'lure-pivot'
  lurePivot.position.copy(lureBase).sub(headRest)
  bones[0].add(lurePivot)

  const stalkMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#3b302c',
      map: skin.map,
      normalMap: skin.normalMap,
      roughness: 0.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      sheen: 0.5,
      sheenColor: new THREE.Color('#4a6470'),
    }),
  )
  // two segments so the tip can lag behind the base when it sways
  const seg1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.2, 0.05),
    new THREE.Vector3(0, 0.38, 0.2),
  ])
  const seg2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.08, 0.2),
    new THREE.Vector3(0, 0.03, 0.33),
    new THREE.Vector3(0, -0.1, 0.42),
  ])
  const stalk1 = new THREE.Mesh(track(taperedTube(seg1, 24, 10, (t) => lerp(0.026, 0.017, t))), stalkMat)
  stalk1.castShadow = true
  lurePivot.add(stalk1)
  const lureJoint = new THREE.Group()
  lureJoint.position.copy(seg1.getPoint(1))
  lurePivot.add(lureJoint)
  // blend into joint with a tiny knuckle so the seam never shows
  const knuckle = new THREE.Mesh(track(new THREE.SphereGeometry(0.0175, 12, 8)), stalkMat)
  lureJoint.add(knuckle)
  const stalk2 = new THREE.Mesh(track(taperedTube(seg2, 32, 10, (t) => lerp(0.017, 0.008, t))), stalkMat)
  stalk2.castShadow = true
  lureJoint.add(stalk2)

  const lureAnchor = new THREE.Group()
  lureAnchor.name = 'lure'
  lureAnchor.position.copy(seg2.getPoint(1)).add(new THREE.Vector3(0, -0.055, 0))
  lureJoint.add(lureAnchor)

  const bulbProfile = [
    [0.0, -0.085], [0.03, -0.078], [0.052, -0.058], [0.064, -0.025], [0.062, 0.008],
    [0.048, 0.035], [0.026, 0.052], [0.01, 0.062], [0.006, 0.075],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  const bulbGeo = track(new THREE.LatheGeometry(bulbProfile, hi ? 48 : 24))
  const bulbMaterial = track(
    new THREE.MeshPhysicalMaterial({
      // a thin translucent skin over the glowing core (alpha, not transmission:
      // no extra scene pass for a 7 cm organ)
      color: '#0d3a44',
      emissive: new THREE.Color('#7ff6ff'),
      emissiveMap: track(bakeLureEmissive()),
      emissiveIntensity: 3,
      roughness: 0.12,
      transparent: true,
      opacity: 0.72,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
  )
  const bulb = new THREE.Mesh(bulbGeo, bulbMaterial)
  lureAnchor.add(bulb)
  const coreMaterial = track(new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ffcff').multiplyScalar(4), toneMapped: false }))
  const core = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.024, 2)), coreMaterial)
  core.position.y = -0.03
  lureAnchor.add(core)
  // fine luminous filaments trailing from the esca
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const start = new THREE.Vector3(Math.cos(a) * 0.02, -0.08, Math.sin(a) * 0.02)
    const f = new THREE.CatmullRomCurve3([
      start,
      start.clone().add(new THREE.Vector3(Math.cos(a) * 0.03, -0.05, Math.sin(a) * 0.03)),
      start.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, -0.08 - i * 0.012, Math.sin(a) * 0.04)),
    ])
    const m = new THREE.Mesh(track(taperedTube(f, 12, 5, (t) => 0.0022 * (1 - t) + 0.0005)), bulbMaterial)
    lureAnchor.add(m)
  }

  // soft in-water scattering halo around the lure
  const haloTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    // steep falloff: real bloom does the wide glow now; this only adds the
    // in-water scatter right around the organ (a broad flat halo would push a
    // whole disc over the bloom threshold)
    grd.addColorStop(0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.08, 'rgba(255,255,255,0.45)')
    grd.addColorStop(0.25, 'rgba(255,255,255,0.1)')
    grd.addColorStop(0.6, 'rgba(255,255,255,0.02)')
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    return track(new THREE.CanvasTexture(c))
  })()
  const halo = new THREE.Sprite(
    track(
      new THREE.SpriteMaterial({
        map: haloTex,
        color: new THREE.Color('#5ff0ff'),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      }),
    ),
  )
  halo.scale.setScalar(0.9)
  halo.position.y = -0.03
  lureAnchor.add(halo)

  // light-emitting parts must not shadow their own light
  for (const o of [bulb, core, halo, ...lureAnchor.children]) o.castShadow = false

  return {
    root,
    body,
    head: bones[0],
    jaw,
    spine: bones.slice(1),
    finL,
    finR,
    lurePivot,
    lureJoint,
    lureAnchor,
    bulbMaterial,
    coreMaterial,
    halo,
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}
