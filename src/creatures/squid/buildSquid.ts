import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Noise3D, createRng, lerp, profile, smoothstep } from '../../lib/noise'
import { boneChain, skinAlongChain, taperedTube } from '../../lib/geometry'
import { bakeChromatophores } from '../../lib/textures'
import { deform } from '../../lib/deform'

/**
 * Procedural Dana octopus squid (Taningia danae).
 *
 * One lofted body (mantle → collar → head → arm crown), huge rhomboid fins,
 * eight hooked arms on bone chains, and the species' signature: two lemon-
 * sized photophores at the tips of the second arm pair, which carry the
 * scene's key lights. Local +Z is the direction of travel (mantle first);
 * total length ≈ 3.4 units.
 */

export interface SquidRig {
  root: THREE.Group
  body: THREE.SkinnedMesh
  head: THREE.Bone
  mantle: THREE.Bone[]
  arms: THREE.Bone[][]
  fins: THREE.Mesh[]
  finMaterial: THREE.MeshPhysicalMaterial
  /** uTime drives the fin wave; uFinAmp its height. */
  finUniforms: { uTime: THREE.IUniform<number>; uFinAmp: THREE.IUniform<number> }
  /** Emitting photophores (light anchors live at their centres). */
  photophores: { anchor: THREE.Group; material: THREE.MeshPhysicalMaterial }[]
  dispose: () => void
}

const Z_TIP = 1.7
const LEN = 2.05
const zAt = (t: number) => Z_TIP - t * LEN
const R = profile([
  [0, 0], [0.02, 0.06], [0.12, 0.19], [0.3, 0.29], [0.5, 0.33], [0.66, 0.325], [0.715, 0.31],
  [0.745, 0.255], [0.8, 0.29], [0.87, 0.305], [0.95, 0.25], [1, 0.19],
])
const HEAD_Z = zAt(0.82)
const MANTLE_Z = [0.45, 1.0, 1.45]
const ARM_BONES = 9
const PHOTOPHORE_ARMS = [1, 2]

function surface(t: number, theta: number, out: THREE.Vector3) {
  const lip = 0.022 * Math.exp(-Math.pow((t - 0.712) / 0.012, 2))
  const r = R(t) + lip
  return out.set(r * Math.cos(theta), r * Math.sin(theta) * 0.9, zAt(t))
}

export function buildSquid({ quality }: { quality: 'high' | 'low' }): SquidRig {
  const hi = quality === 'high'
  const noise = new Noise3D(99)
  const rng = createRng(4242)
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)
  const root = new THREE.Group()
  root.name = 'squid'

  // ---- skeleton: head is the root, mantle chain runs forward -------------
  const head = new THREE.Bone()
  head.name = 'head'
  head.position.set(0, 0, HEAD_Z)
  const mantle = MANTLE_Z.map((z, i) => {
    const b = new THREE.Bone()
    b.name = `mantle${i}`
    b.position.set(0, 0, z - (i === 0 ? HEAD_Z : MANTLE_Z[i - 1]))
    return b
  })
  head.add(mantle[0])
  mantle[0].add(mantle[1])
  mantle[1].add(mantle[2])
  const bodyBones = [head, ...mantle]
  const chainZ = [HEAD_Z, ...MANTLE_Z]

  // ---- body loft -------------------------------------------------------------
  const RINGS = hi ? 140 : 70
  const SEG = hi ? 72 : 40
  const cols = SEG + 1
  const pos = new Float32Array(RINGS * cols * 3)
  const uv = new Float32Array(RINGS * cols * 2)
  const p = new THREE.Vector3()
  for (let i = 0; i < RINGS; i++) {
    const t = i / (RINGS - 1)
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2
      surface(t, th, p)
      const k = i * cols + j
      pos.set([p.x, p.y, p.z], k * 3)
      uv.set([j / SEG, t], k * 2)
    }
  }
  const idx: number[] = []
  for (let i = 0; i < RINGS - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j
      // rings run towards -Z here, so flip the winding to keep normals outward
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  const bodyGeo = track(new THREE.BufferGeometry())
  bodyGeo.setIndex(idx)
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  bodyGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const weldSeam = () => {
    const n = bodyGeo.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < RINGS; i++) {
      const a = i * cols, b = i * cols + SEG
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b)
      const l = Math.hypot(x, y, z) || 1
      n.setXYZ(a, x / l, y / l, z / l)
      n.setXYZ(b, x / l, y / l, z / l)
    }
  }
  bodyGeo.computeVertexNormals()
  weldSeam()
  {
    const n = bodyGeo.attributes.normal as THREE.BufferAttribute
    for (let k = 0; k < RINGS * cols; k++) {
      const t = uv[k * 2 + 1]
      const amp = 0.008 * smoothstep(0.03, 0.1, t) * (1 - smoothstep(0.95, 1, t))
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2]
      const d = noise.fbm(x * 5, y * 5, z * 2.5, 3)
      pos[k * 3] += n.getX(k) * d * amp
      pos[k * 3 + 1] += n.getY(k) * d * amp
      pos[k * 3 + 2] += n.getZ(k) * d * amp
    }
    bodyGeo.computeVertexNormals()
    weldSeam()
  }
  {
    const si = new Uint16Array(RINGS * cols * 4)
    const sw = new Float32Array(RINGS * cols * 4)
    for (let k = 0; k < RINGS * cols; k++) {
      const z = pos[k * 3 + 2]
      let b0 = 0, b1 = 0, f = 0
      if (z <= chainZ[0]) b0 = b1 = 0
      else if (z >= chainZ[chainZ.length - 1]) b0 = b1 = chainZ.length - 1
      else
        for (let b = 0; b < chainZ.length - 1; b++)
          if (z >= chainZ[b] && z < chainZ[b + 1]) {
            b0 = b
            b1 = b + 1
            f = smoothstep(0, 1, (z - chainZ[b]) / (chainZ[b + 1] - chainZ[b]))
          }
      si.set([b0, b1, 0, 0], k * 4)
      sw.set([1 - f, f, 0, 0], k * 4)
    }
    bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  }

  const skin = bakeChromatophores({ size: hi ? 1024 : 512, aspect: 3.2 })
  Object.values(skin).forEach(track)
  skin.map.repeat.set(1, 1)
  const skinMat = track(
    new THREE.MeshPhysicalMaterial({
      map: skin.map,
      normalMap: skin.normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: skin.roughnessMap,
      roughness: 1,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
      sheen: 0.7,
      sheenColor: new THREE.Color('#ff8f73'),
      sheenRoughness: 0.4,
      envMapIntensity: 1.1,
    }),
  )

  const body = new THREE.SkinnedMesh(bodyGeo, skinMat)
  body.name = 'squid-body'
  body.castShadow = true
  body.receiveShadow = true
  body.frustumCulled = false
  body.add(head)
  root.add(body)

  // ---- arms (hooks included) -------------------------------------------------
  const armParts: THREE.BufferGeometry[] = []
  const arms: THREE.Bone[][] = []
  const armBonesFlat: THREE.Bone[] = [...bodyBones]
  const crownZ = zAt(0.985)
  const armInfo: { pts: THREE.Vector3[]; curve: THREE.CatmullRomCurve3 }[] = []
  for (let k = 0; k < 8; k++) {
    const phi = ((k + 0.5) / 8) * Math.PI * 2
    const radial = new THREE.Vector3(Math.cos(phi), Math.sin(phi) * 0.9, 0)
    const base = radial.clone().multiplyScalar(0.15).setZ(crownZ)
    const len = (PHOTOPHORE_ARMS.includes(k) ? 1.55 : 1.3) + rng() * 0.2
    const droop = -0.15 - rng() * 0.1
    const pts = Array.from({ length: ARM_BONES }, (_, i) => {
      const s = i / (ARM_BONES - 1)
      // splay out of the crown, then trail and converge behind the head
      const spread = 0.24 * Math.sin(Math.min(1, s * 1.8) * Math.PI * 0.5) - 0.12 * s * s
      return base
        .clone()
        .addScaledVector(radial, spread)
        .add(new THREE.Vector3(0, droop * s * s, -len * s))
    })
    const chain = boneChain(
      pts.map((v) => v.clone().sub(new THREE.Vector3(0, 0, HEAD_Z))),
      `arm${k}_`,
    )
    head.add(chain[0])
    const curve = new THREE.CatmullRomCurve3(pts)
    armInfo.push({ pts, curve })
    const first = armBonesFlat.length
    armBonesFlat.push(...chain)
    arms.push(chain)

    const armGeo = taperedTube(curve, hi ? 64 : 32, hi ? 14 : 8, (t) => lerp(0.07, 0.012, Math.pow(t, 0.85)))
    skinAlongChain(armGeo, first, ARM_BONES)
    armParts.push(armGeo)

    // two rows of small recurved hooks on the oral face
    const hooks = hi ? 16 : 8
    const frames = curve.computeFrenetFrames(64, false)
    for (let h = 0; h < hooks; h++) {
      for (const side of [-1, 1]) {
        const t = 0.12 + (h / hooks) * 0.72
        const fi = Math.round(t * 64)
        const at = curve.getPointAt(t)
        const inward = radial.clone().multiplyScalar(-1)
        const lateral = frames.binormals[fi].clone().multiplyScalar(side * 0.35)
        const r = lerp(0.07, 0.012, Math.pow(t, 0.85))
        const b = at.clone().addScaledVector(inward, r * 0.8).addScaledVector(lateral, r)
        const hookLen = 0.035 * (1 - t * 0.6)
        const tip = b.clone().addScaledVector(inward, hookLen).add(new THREE.Vector3(0, 0, hookLen * 0.6))
        const mid = b.clone().lerp(tip, 0.5).addScaledVector(inward, hookLen * 0.4)
        const hg = taperedTube(new THREE.QuadraticBezierCurve3(b, mid, tip), 4, 4, (s) => 0.006 * (1 - s) * (1 - t * 0.5) + 0.0004)
        const hookT = t
        skinAlongChain(hg, first, ARM_BONES, () => hookT)
        armParts.push(hg)
      }
    }
  }
  const armGeo = track(mergeGeometries(armParts)!)
  armParts.forEach((g) => g.dispose())
  const armMesh = new THREE.SkinnedMesh(armGeo, skinMat)
  armMesh.name = 'squid-arms'
  armMesh.castShadow = true
  armMesh.receiveShadow = true
  armMesh.frustumCulled = false
  root.add(armMesh)

  // one skeleton, shared by body and arms
  root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(armBonesFlat)
  body.bind(skeleton)
  armMesh.bind(skeleton)

  // ---- eyes: silver iris, black lens ------------------------------------------
  const irisMat = track(
    new THREE.MeshPhysicalMaterial({ color: '#9fb4c0', metalness: 0.8, roughness: 0.25, iridescence: 1, iridescenceIOR: 1.8 }),
  )
  const lensMat = track(new THREE.MeshPhysicalMaterial({ color: '#020304', roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0 }))
  const irisGeo = track(new THREE.SphereGeometry(0.105, 32, 20))
  const lensGeo = track(new THREE.SphereGeometry(0.068, 28, 18))
  for (const side of [1, -1]) {
    const th = side > 0 ? 0.06 * Math.PI : Math.PI - 0.06 * Math.PI
    surface(0.86, th, p)
    const outward = new THREE.Vector3(Math.cos(th), 0, 0).normalize()
    const eye = new THREE.Group()
    eye.position.copy(p).addScaledVector(outward, -0.035).sub(new THREE.Vector3(0, 0, HEAD_Z))
    const iris = new THREE.Mesh(irisGeo, irisMat)
    iris.scale.set(0.55, 1, 1)
    const lens = new THREE.Mesh(lensGeo, lensMat)
    lens.position.x = side * 0.05
    lens.scale.set(0.5, 1, 1)
    iris.castShadow = lens.castShadow = true
    eye.add(iris, lens)
    head.add(eye)
  }

  // ---- fins: broad, translucent, undulating (wave is added in the shader) --
  const finMaterial = track(
    new THREE.MeshPhysicalMaterial({
      map: skin.map,
      normalMap: skin.normalMap,
      roughness: 0.45,
      thickness: 0.03,
      attenuationColor: new THREE.Color('#ff5a4a'),
      attenuationDistance: 0.25,
      sheen: 0.6,
      sheenColor: new THREE.Color('#ff9b80'),
      clearcoat: 0.6,
      side: THREE.DoubleSide,
    }),
  )
  const fins: THREE.Mesh[] = []
  // Taningia swims mostly with its fins: a travelling wave rolls from the
  // front edge to the back, strongest at the outer rim (shadows follow it too)
  const finUniforms = { uTime: { value: 0 }, uFinAmp: { value: 0.14 } }
  const finWave = {
    key: 'squid-fin',
    uniforms: finUniforms,
    head: 'uniform float uTime;\nuniform float uFinAmp;',
    body: /* glsl */ `
      float rim = pow(uv.y, 1.3);
      float wave = sin(uTime * 2.3 - uv.x * 7.5);
      transformed.y += rim * uFinAmp * wave;
      transformed.z += rim * uFinAmp * 0.25 * cos(uTime * 2.3 - uv.x * 7.5);`,
  }
  for (const side of [1, -1]) {
    const U = hi ? 40 : 20, W = hi ? 14 : 8
    const fp: number[] = [], fuv: number[] = [], fi: number[] = []
    const t0 = 0.05, t1 = 0.6
    for (let i = 0; i <= U; i++) {
      const u = i / U
      const t = lerp(t0, t1, u)
      const span = 0.95 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.75)
      for (let j = 0; j <= W; j++) {
        const w = j / W
        const r = R(t) * 0.93 + w * span
        const z = zAt(t) - w * span * 0.28 * (u - 0.25)
        fp.push(side * r, 0.02 + 0.05 * w * w - 0.02 * w, z - MANTLE_Z[0])
        fuv.push(u, w)
      }
    }
    for (let i = 0; i < U; i++)
      for (let j = 0; j < W; j++) {
        const a = i * (W + 1) + j, b = (i + 1) * (W + 1) + j
        fi.push(a, b, a + 1, b, b + 1, a + 1)
      }
    const g = track(new THREE.BufferGeometry())
    g.setIndex(fi)
    g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2))
    g.computeVertexNormals()
    const fin = new THREE.Mesh(g, finMaterial)
    fin.castShadow = true
    fin.receiveShadow = true
    fin.userData.side = side
    mantle[0].add(fin)
    deform(fin, finMaterial, finWave)
    fins.push(fin)
  }

  // ---- photophores at the tips of arm pair II --------------------------------
  const photophores: SquidRig['photophores'] = []
  const organGeo = track(
    new THREE.LatheGeometry(
      [[0, -0.075], [0.03, -0.068], [0.046, -0.038], [0.05, 0], [0.044, 0.038], [0.026, 0.064], [0, 0.072]].map(
        ([x, y]) => new THREE.Vector2(x, y),
      ),
      hi ? 32 : 16,
    ),
  )
  const lidMat = track(new THREE.MeshPhysicalMaterial({ color: '#1a0306', roughness: 0.35, clearcoat: 0.8, side: THREE.DoubleSide }))
  const lidGeo = track(new THREE.SphereGeometry(0.072, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42))
  for (const k of PHOTOPHORE_ARMS) {
    const chain = arms[k]
    const tipBone = chain[chain.length - 2]
    const material = track(
      new THREE.MeshPhysicalMaterial({
        color: '#2b4a66',
        emissive: new THREE.Color('#7cc8ff'),
        emissiveIntensity: 1,
        roughness: 0.15,
        thickness: 0.08,
        clearcoat: 1,
      }),
    )
    const anchor = new THREE.Group()
    // sit the organ on the aboral side of the arm, near the tip
    const radial = new THREE.Vector3(Math.cos(((k + 0.5) / 8) * Math.PI * 2), Math.sin(((k + 0.5) / 8) * Math.PI * 2), 0)
    anchor.position.copy(chain[chain.length - 1].position).multiplyScalar(0.3).addScaledVector(radial, 0.045)
    anchor.rotation.x = Math.PI / 2
    const organ = new THREE.Mesh(organGeo, material)
    const lid = new THREE.Mesh(lidGeo, lidMat)
    lid.rotation.z = Math.atan2(radial.y, radial.x) - Math.PI / 2
    lid.rotation.x = Math.PI
    organ.castShadow = lid.castShadow = false
    anchor.add(organ, lid)
    tipBone.add(anchor)
    photophores.push({ anchor, material })
  }

  return {
    root,
    body,
    head,
    mantle,
    arms,
    fins,
    finMaterial,
    finUniforms,
    photophores,
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}
