import * as THREE from 'three'
import { clamp, lerp, smoothstep } from './noise'

/**
 * The dive: one scroll progress value `p` ∈ [0, 1] drives everything —
 * camera path, which zone is lit, water colour, and the depth read-out.
 * The four zones are stacked vertically in world space, 60 units apart, so
 * fog naturally hides whichever zone the camera is not in.
 */

export const ZONE_Y = [0, -60, -120, -180] as const

/** Scroll progress at which each zone's hero shot sits. */
export const STAGE_P = [0.1, 0.4, 0.65, 0.92] as const

/** Live, per-frame dive state (mutated by the camera rig, read in useFrame). */
export const dive = {
  /** Smoothed scroll progress. */
  p: 0,
  /** Continuous zone index 0…3. */
  stageF: 0,
  /** Depth in metres for the HUD. */
  depth: 0,
}

/**
 * Live world position of each stage's subject (school centroid, jellyfish…),
 * written by the creatures; the camera eases its aim towards it while holding
 * on that stage, like an operator keeping the subject framed.
 */
export const subjects: (THREE.Vector3 | null)[] = [null, null, null, null]

/** 1 while the camera is holding on stage i's hero shot, easing to 0 around it. */
export function holdWeight(i: number, p: number, width = 0.08) {
  return 1 - smoothstep(width * 0.4, width, Math.abs(p - STAGE_P[i]))
}

/** Scroll proxy written by GSAP ScrollTrigger (scrubbed). */
export const scrollProxy = { p: 0 }

export function stageFromP(p: number) {
  if (p <= STAGE_P[0]) return 0
  for (let i = 0; i < STAGE_P.length - 1; i++)
    if (p <= STAGE_P[i + 1]) return i + (p - STAGE_P[i]) / (STAGE_P[i + 1] - STAGE_P[i])
  return STAGE_P.length - 1
}

const DEPTH_KEYS: [number, number][] = [
  [0, 3], [0.1, 18], [0.25, 50], [0.4, 260], [0.5, 500], [0.65, 780], [0.78, 1000], [0.92, 2100], [1, 2400],
]
export function depthFromP(p: number) {
  for (let i = 0; i < DEPTH_KEYS.length - 1; i++) {
    const [p0, d0] = DEPTH_KEYS[i], [p1, d1] = DEPTH_KEYS[i + 1]
    if (p <= p1) return lerp(d0, d1, clamp((p - p0) / (p1 - p0)))
  }
  return DEPTH_KEYS[DEPTH_KEYS.length - 1][1]
}

/** 1 when the camera is at this zone, fading to 0 by the neighbouring zone (mesh visibility). */
export function zoneWeight(index: number, stageF: number) {
  return clamp(1.5 - Math.abs(stageF - index) * 1.5)
}

/** The one zone whose lights are switched on (they swap halfway between zones). */
export function activeZone(stageF: number) {
  return Math.round(stageF)
}

/**
 * Light strength for a zone: full around its hero shot, fading to exactly 0
 * at the halfway point where the lights of the next zone take over — so the
 * swap is invisible and only one zone's lights are ever evaluated.
 */
export function lightWeight(index: number, stageF: number) {
  if (activeZone(stageF) !== index) return 0
  return smoothstep(0.5, 0.22, Math.abs(stageF - index))
}

// ---- atmosphere by depth ---------------------------------------------------
export interface Atmosphere {
  fog: THREE.Color
  density: number
  sky: THREE.Color
  ground: THREE.Color
  ambient: number
  env: number
  exposure: number
  snow: number
}
const atm = (fog: string, density: number, sky: string, ground: string, ambient: number, env: number, exposure: number, snow: number): Atmosphere => ({
  fog: new THREE.Color(fog), density, sky: new THREE.Color(sky), ground: new THREE.Color(ground), ambient, env, exposure, snow,
})
/** Sunlight dies off and shifts colder/bluer with every zone. */
export const ATMOSPHERES: Atmosphere[] = [
  atm('#0b5a74', 0.034, '#8fe3ff', '#0d3a44', 1.25, 1.0, 1.1, 0.4),
  atm('#062a45', 0.05, '#2f7fc4', '#030d18', 0.42, 0.55, 1.05, 0.14),
  atm('#03142a', 0.066, '#1a4a8a', '#01050c', 0.2, 0.32, 1.05, 0.07),
  atm('#010610', 0.085, '#0d2c4a', '#000000', 0.12, 0.22, 1.05, 0.04),
]

export function sampleAtmosphere(stageF: number, out: Atmosphere) {
  const i = Math.min(Math.floor(stageF), ATMOSPHERES.length - 2)
  const f = smoothstep(0, 1, stageF - i)
  const a = ATMOSPHERES[i], b = ATMOSPHERES[i + 1]
  out.fog.copy(a.fog).lerp(b.fog, f)
  out.sky.copy(a.sky).lerp(b.sky, f)
  out.ground.copy(a.ground).lerp(b.ground, f)
  out.density = lerp(a.density, b.density, f)
  out.ambient = lerp(a.ambient, b.ambient, f)
  out.env = lerp(a.env, b.env, f)
  out.exposure = lerp(a.exposure, b.exposure, f)
  out.snow = lerp(a.snow, b.snow, f)
  return out
}

// ---- scene III: the squid's swim path (tracking shot) ----------------------
export const TRACK = { start: 0.53, end: 0.77, feather: 0.035 }
export const SQUID_PATH = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0.6, ZONE_Y[2] + 2.2, 7),
    new THREE.Vector3(-0.4, ZONE_Y[2] + 1.4, 1),
    new THREE.Vector3(0.9, ZONE_Y[2] + 0.6, -6),
    new THREE.Vector3(-0.3, ZONE_Y[2] - 0.2, -13),
    new THREE.Vector3(0.2, ZONE_Y[2] - 0.6, -19),
  ],
  false,
  'centripetal',
)
export function squidProgress(p: number) {
  return smoothstep(TRACK.start, TRACK.end, p) * 0.94 + 0.03
}
export function trackingWeight(p: number) {
  return smoothstep(TRACK.start - TRACK.feather, TRACK.start + TRACK.feather, p) *
    (1 - smoothstep(TRACK.end - TRACK.feather, TRACK.end + TRACK.feather, p))
}

// ---- chapters --------------------------------------------------------------
export interface Chapter {
  numeral: string
  zone: string
  range: string
  creature: string
  latin: string
  line: string
}
export const CHAPTERS: Chapter[] = [
  {
    numeral: 'I',
    zone: 'Vùng nước cạn',
    range: '0\u00a0–\u00a050\u00a0m',
    creature: 'Đàn cá chẽm non',
    latin: 'Lates calcarifer',
    line: 'Ánh mặt trời xuyên qua mặt nước thành từng cột sáng. Cả đàn đổi hướng như một cơ thể duy nhất.',
  },
  {
    numeral: 'II',
    zone: 'Vùng chạng vạng',
    range: '50\u00a0–\u00a0500\u00a0m',
    creature: 'Sứa vương miện',
    latin: 'Atolla wyvillei',
    line: 'Khi bị tấn công, nó bật một vòng sáng xanh xoay tròn để gọi kẻ săn mồi lớn hơn đến. Người ta gọi đó là "chuông báo động".',
  },
  {
    numeral: 'III',
    zone: 'Vùng nửa tối',
    range: '500\u00a0–\u00a01\u00a0000\u00a0m',
    creature: 'Mực đèn Dana',
    latin: 'Taningia danae',
    line: 'Một trong những loài mực phát quang lớn nhất. Hai cơ quan phát sáng ở đầu tay loé lên như đèn flash giữa bóng tối.',
  },
  {
    numeral: 'IV',
    zone: 'Vực thẳm',
    range: '1\u00a0000\u00a0m\u00a0+',
    creature: 'Cá câu vực thẳm',
    latin: 'Melanocetus johnsonii',
    line: 'Ở độ sâu này, ánh sáng duy nhất là chiếc đèn sinh học nó tự mang theo.',
  },
]
