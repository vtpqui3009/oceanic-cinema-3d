import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createRng, lerp, profile, smoothstep } from '../../lib/noise'
import { boneChain, skinAlongChain, taperedTube } from '../../lib/geometry'
import { bakeJellyEmissive } from '../../lib/textures'

/**
 * Procedural crown jellyfish (Atolla wyvillei).
 *
 * Bell: one closed mesoglea shell (exumbrella → rounded margin →
 * subumbrella) with the coronal groove and 22 marginal lappets. Tentacles
 * and oral arms are skinned meshes driven by real bone chains so they can
 * sway segment by segment. Bell is ≈1.6 units across, hanging from y≈0.6.
 */

export interface JellyRig {
  root: THREE.Group
  bell: THREE.Mesh
  bellMaterial: THREE.MeshPhysicalMaterial
  emissiveMap: THREE.Texture
  /** One chain per marginal tentacle (last = the long hypertrophied one). */
  tentacles: THREE.Bone[][]
  arms: THREE.Bone[][]
  lightAnchor: THREE.Group
  /** Stomach + gonads, squeezed a little on each stroke. */
  organs: THREE.Group
  /** uPulse (0 relaxed → 1 contracted), uAlarm (0…1 display), uTime. */
  uniforms: { uPulse: THREE.IUniform<number>; uAlarm: THREE.IUniform<number>; uTime: THREE.IUniform<number> }
  /** Rest position and margin angle of each tentacle root. */
  tentacleRoots: { rest: THREE.Vector3; theta: number }[]
  dispose: () => void
}

const LAPPETS = 22
const R_OUT = profile([[0, 0], [0.15, 0.3], [0.35, 0.55], [0.55, 0.7], [0.75, 0.78], [0.9, 0.8], [1, 0.78]])
const Y_OUT = profile([[0, 0.62], [0.15, 0.6], [0.35, 0.5], [0.55, 0.35], [0.75, 0.16], [0.9, 0.02], [1, -0.06]])

function outer(v: number, theta: number, out: THREE.Vector3) {
  const groove = 0.035 * Math.exp(-Math.pow((v - 0.5) / 0.035, 2))
  const m = smoothstep(0.8, 1, v)
  const lap = Math.pow(Math.abs(Math.cos((theta * LAPPETS) / 2)), 0.6)
  const r = (R_OUT(v) - groove) * (1 + m * 0.05 * lap)
  const y = Y_OUT(v) - groove * 0.6 - m * 0.07 * lap
  return out.set(r * Math.cos(theta), y, r * Math.sin(theta))
}

export function buildJellyfish({ quality }: { quality: 'high' | 'low' }): JellyRig {
  const hi = quality === 'high'
  const rng = createRng(808)
  const disposables: { dispose: () => void }[] = []
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x)
  const root = new THREE.Group()
  root.name = 'jellyfish'

  // ---- bell shell ----------------------------------------------------------
  const SEG = hi ? 176 : 88 // multiple of 22 keeps lappets symmetric
  const OUT = hi ? 56 : 30
  const EDGE = 4
  const IN = hi ? 36 : 20
  const cols = SEG + 1
  const pos: number[] = []
  const uv: number[] = []
  const p = new THREE.Vector3(), q = new THREE.Vector3()
  let rings = 0
  const ring = (fn: (theta: number) => THREE.Vector3, v: number) => {
    for (let j = 0; j <= SEG; j++) {
      const th = (j / SEG) * Math.PI * 2
      const r = fn(th)
      pos.push(r.x, r.y, r.z)
      uv.push(j / SEG, v)
    }
    rings++
  }
  for (let i = 0; i < OUT; i++) {
    const v = i / (OUT - 1)
    ring((th) => outer(v, th, p), v * 0.5)
  }
  // rounded margin: the shell folds under itself
  for (let i = 1; i <= EDGE; i++) {
    const s = i / (EDGE + 1)
    ring((th) => {
      outer(1, th, p)
      const k = 1 - 0.06 * s
      return q.set(p.x * k, p.y - 0.03 * Math.sin(s * Math.PI), p.z * k)
    }, 0.5)
  }
  // subumbrella climbing back towards the apex, thickening the mesoglea
  for (let i = 0; i < IN; i++) {
    const w = i / (IN - 1)
    const v = 1 - w * 0.97
    ring((th) => {
      outer(v, th, p)
      const k = 0.92 - 0.1 * smoothstep(0, 0.4, w)
      const thick = lerp(0.02, 0.26, smoothstep(0, 0.8, w))
      return q.set(p.x * k, p.y - thick, p.z * k)
    }, 0.5 + w * 0.5)
  }
  const idx: number[] = []
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < SEG; j++) {
      const a = i * cols + j, b = (i + 1) * cols + j
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
  const bellGeo = track(new THREE.BufferGeometry())
  bellGeo.setIndex(idx)
  bellGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  bellGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  bellGeo.computeVertexNormals()
  {
    // weld the seam normals
    const n = bellGeo.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < rings; i++) {
      const a = i * cols, b = i * cols + SEG
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b)
      const l = Math.hypot(x, y, z) || 1
      n.setXYZ(a, x / l, y / l, z / l)
      n.setXYZ(b, x / l, y / l, z / l)
    }
  }

  const emissiveMap = track(bakeJellyEmissive(LAPPETS))
  const bellMaterial = track(
    new THREE.MeshPhysicalMaterial({
      color: '#ffd9e2',
      roughness: 0.1,
      metalness: 0,
      transmission: hi ? 1 : 0,
      transparent: !hi,
      opacity: hi ? 1 : 0.5,
      // without transmission the shell is alpha-blended: skip depth writes so
      // inner and outer surfaces blend instead of cutting each other out
      depthWrite: hi,
      thickness: 0.55,
      ior: 1.34,
      attenuationColor: new THREE.Color('#ff4f73'),
      attenuationDistance: 0.8,
      iridescence: 0.35,
      iridescenceIOR: 1.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.08,
      emissive: new THREE.Color('#6cc4ff'),
      emissiveMap,
      emissiveIntensity: 1.4,
      envMapIntensity: 1.2,
    }),
  )
  // swimming stroke + "burglar alarm" pinwheel display, both in the shader
  const uniforms = { uPulse: { value: 0 }, uAlarm: { value: 0 }, uTime: { value: 0 } }
  bellMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPulse;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        // 0 at the apex (outside and inside), 1 at the margin
        float marginW = smoothstep(0.2, 1.0, 1.0 - abs(uv.y * 2.0 - 1.0));
        transformed.xz *= 1.0 - uPulse * 0.2 * marginW;
        transformed.y += uPulse * (0.07 * (1.0 - marginW) - 0.035 * marginW);`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAlarm;\nuniform float uTime;')
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        #ifdef USE_EMISSIVEMAP
          // spiralling sweeps chase each other round the crown
          float sweep = pow(0.5 + 0.5 * sin((vEmissiveMapUv.x * 4.0 + vEmissiveMapUv.y * 1.5 - uTime * 0.9) * 6.2831), 10.0);
          totalEmissiveRadiance *= mix(1.0, 0.15 + sweep * 4.0, uAlarm);
        #endif`,
      )
  }
  bellMaterial.customProgramCacheKey = () => 'jelly-bell'

  const bell = new THREE.Mesh(bellGeo, bellMaterial)
  bell.name = 'bell'
  bell.castShadow = false // the light lives inside it
  bell.receiveShadow = true
  root.add(bell)

  // ---- stomach + gonads (the famous blood-red centre) -------------------
  const gut = track(
    new THREE.MeshPhysicalMaterial({
      color: '#7a0b1c',
      roughness: 0.35,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
      sheen: 0.5,
      sheenColor: new THREE.Color('#ff5a6e'),
      emissive: new THREE.Color('#3a0208'),
      emissiveIntensity: 0.6,
    }),
  )
  const stomachGeo = track(
    new THREE.LatheGeometry(
      [[0.0, 0.46], [0.16, 0.44], [0.3, 0.38], [0.37, 0.28], [0.34, 0.2], [0.2, 0.15], [0.0, 0.14]].map(([x, y]) => new THREE.Vector2(x, y)),
      hi ? 48 : 24,
    ),
  )
  const organs = new THREE.Group()
  root.add(organs)
  const stomach = new THREE.Mesh(stomachGeo, gut)
  stomach.castShadow = true
  organs.add(stomach)
  const lobeGeo = track(new THREE.SphereGeometry(0.075, 20, 14))
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2
    const lobe = new THREE.Mesh(lobeGeo, gut)
    lobe.position.set(Math.cos(a) * 0.42, 0.2, Math.sin(a) * 0.42)
    lobe.scale.set(1.2, 0.7, 0.9)
    lobe.rotation.y = -a
    lobe.castShadow = true
    organs.add(lobe)
  }

  // ---- marginal tentacles (bone chains) ---------------------------------
  const tentacleMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#ffb8c8',
      roughness: 0.3,
      transmission: hi ? 0.7 : 0,
      thickness: 0.015,
      emissive: new THREE.Color('#3f8fff'),
      emissiveIntensity: 0.12,
      attenuationColor: new THREE.Color('#ff7b93'),
      attenuationDistance: 0.3,
    }),
  )
  const BONES = 10
  const LONG_BONES = 18
  const tentacleBones: THREE.Bone[][] = []
  const tentacleRootInfo: JellyRig['tentacleRoots'] = []
  const tentacleParts: THREE.BufferGeometry[] = []
  const allTentacleBones: THREE.Bone[] = []
  const tentacleRoots = new THREE.Group()
  const count = LAPPETS + 1
  for (let k = 0; k < count; k++) {
    const long = k === LAPPETS
    const th = long ? 0.3 : ((k + 0.5) / LAPPETS) * Math.PI * 2
    outer(1, th, p)
    const base = new THREE.Vector3(p.x * 0.95, p.y - 0.02, p.z * 0.95)
    const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th))
    const len = long ? 4.6 : 1.3 + rng() * 0.8
    const nb = long ? LONG_BONES : BONES
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < nb; i++) {
      const s = i / (nb - 1)
      pts.push(
        base
          .clone()
          .addScaledVector(out, 0.16 * Math.sqrt(s) + (long ? 0.4 * s : 0))
          .add(new THREE.Vector3((rng() - 0.5) * 0.04, -len * s, (rng() - 0.5) * 0.04)),
      )
    }
    const chain = boneChain(pts, long ? 'long' : `tent${k}_`)
    const curve = new THREE.CatmullRomCurve3(pts)
    const r0 = long ? 0.012 : 0.0065
    const g = taperedTube(curve, long ? 90 : 36, hi ? 6 : 4, (t) => r0 * Math.pow(1 - t, 0.6) + 0.0015)
    skinAlongChain(g, allTentacleBones.length, nb)
    tentacleParts.push(g)
    tentacleBones.push(chain)
    tentacleRootInfo.push({ rest: chain[0].position.clone(), theta: th })
    allTentacleBones.push(...chain)
    tentacleRoots.add(chain[0])
  }
  const tentacleGeo = track(mergeGeometries(tentacleParts)!)
  tentacleParts.forEach((g) => g.dispose())
  const tentacles = new THREE.SkinnedMesh(tentacleGeo, tentacleMat)
  tentacles.name = 'tentacles'
  tentacles.castShadow = true
  tentacles.frustumCulled = false
  tentacles.add(tentacleRoots)
  root.add(tentacles)
  tentacles.updateMatrixWorld(true)
  tentacles.bind(new THREE.Skeleton(allTentacleBones))

  // ---- oral arms: short, ruffled, blood red ------------------------------
  const armMat = track(
    new THREE.MeshPhysicalMaterial({
      color: '#b3172f',
      roughness: 0.4,
      transmission: hi ? 0.3 : 0,
      thickness: 0.06,
      attenuationColor: new THREE.Color('#ff3050'),
      attenuationDistance: 0.2,
      sheen: 0.6,
      sheenColor: new THREE.Color('#ff8f9e'),
      side: THREE.DoubleSide,
    }),
  )
  const ARM_BONES = 7
  const armBones: THREE.Bone[][] = []
  const armParts: THREE.BufferGeometry[] = []
  const allArmBones: THREE.Bone[] = []
  const armRoots = new THREE.Group()
  for (let k = 0; k < 4; k++) {
    const a = ((k + 0.25) / 4) * Math.PI * 2
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a))
    const base = new THREE.Vector3(0, 0.14, 0).addScaledVector(dir, 0.05)
    const len = 0.85 + rng() * 0.25
    const pts = Array.from({ length: ARM_BONES }, (_, i) => {
      const s = i / (ARM_BONES - 1)
      return base.clone().addScaledVector(dir, 0.12 * Math.sin(s * 2.4)).add(new THREE.Vector3(0, -len * s, 0))
    })
    const chain = boneChain(pts, `arm${k}_`)
    const g = taperedTube(new THREE.CatmullRomCurve3(pts), 48, hi ? 24 : 12, (t, ang) => {
      const frill = 1 + 0.9 * Math.pow(Math.max(0, Math.sin(ang * 3 + t * 30)), 2) * smoothstep(0.1, 0.4, t)
      return (0.045 * (1 - t * 0.8) + 0.004) * frill
    })
    skinAlongChain(g, allArmBones.length, ARM_BONES)
    armParts.push(g)
    armBones.push(chain)
    allArmBones.push(...chain)
    armRoots.add(chain[0])
  }
  const armGeo = track(mergeGeometries(armParts)!)
  armParts.forEach((g) => g.dispose())
  const arms = new THREE.SkinnedMesh(armGeo, armMat)
  arms.name = 'oral-arms'
  arms.castShadow = true
  arms.frustumCulled = false
  arms.add(armRoots)
  root.add(arms)
  arms.updateMatrixWorld(true)
  arms.bind(new THREE.Skeleton(allArmBones))

  // key light sits in the subumbrellar cavity, below the stomach
  const lightAnchor = new THREE.Group()
  lightAnchor.position.set(0, 0.04, 0)
  root.add(lightAnchor)

  return {
    root,
    bell,
    bellMaterial,
    emissiveMap,
    tentacles: tentacleBones,
    arms: armBones,
    lightAnchor,
    organs,
    uniforms,
    tentacleRoots: tentacleRootInfo,
    dispose: () => disposables.forEach((d) => d.dispose()),
  }
}
