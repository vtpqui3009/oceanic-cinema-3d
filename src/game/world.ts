import * as THREE from 'three'
import { ZONE_Y } from '../lib/dive'
import { DISCOVERIES, type DiscoveryId } from '../lib/discoveries'
import { seabedHeight } from '../scene/Seabed'

/**
 * The explore-mode map. Each zone is a "dive site": a cylinder of water
 * around the zone's creatures, from its seabed up to a ceiling. The zones
 * are stacked 60 m apart in world space; between them the player travels
 * through a bubble-vent station (a short fade hides the jump).
 */
export interface Site {
  /** Ceiling (world y). Zone I's is just under the surface. */
  top: number
  /** Nominal seabed height (world y) where no height field is registered. */
  floor: number
  /** Centre and radius of the swimmable cylinder. */
  cx: number
  cz: number
  r: number
  /** Depth read-out (m) at the ceiling and at the seabed. */
  depthTop: number
  depthFloor: number
  /** Bubble-vent station: oxygen, and the way down to the next zone. */
  vent: [number, number]
  /** Where the player appears when arriving from above / from below. */
  spawn: [number, number, number]
  /** Visibility (m) through this zone's water, for photo scoring. */
  sight: number
}

const [Y0, Y1, Y2, Y3] = ZONE_Y

export const SITES: Site[] = [
  { top: Y0 + 8.4, floor: Y0 - 6, cx: 0, cz: -1, r: 17, depthTop: 1, depthFloor: 42, vent: [8.5, 4.5], spawn: [0, 3, 11], sight: 24 },
  { top: Y1 + 16, floor: Y1 - 5.2, cx: 0.5, cz: -1, r: 15, depthTop: 190, depthFloor: 470, vent: [-7.5, 4], spawn: [-4, Y1 + 6, 8], sight: 18 },
  { top: Y2 + 11, floor: Y2 - 5, cx: 0, cz: -5, r: 18, depthTop: 620, depthFloor: 980, vent: [8, 5], spawn: [5, Y2 + 5, 9], sight: 16 },
  { top: Y3 + 10, floor: Y3, cx: 0, cz: 0.5, r: 16, depthTop: 1850, depthFloor: 2200, vent: [-6.5, 4.5], spawn: [-2, Y3 + 5, 8], sight: 14 },
]

export const ZONE_TITLES = ['Vùng I · Nước cạn', 'Vùng II · Chạng vạng', 'Vùng III · Nửa tối', 'Vùng IV · Vực thẳm']

/** Seabed height under (x, z) in zone i, world y. */
export function floorAt(i: number, x: number, z: number) {
  return seabedHeight[i]?.(x, z) ?? SITES[i].floor
}

/** Depth in metres at world height y inside zone i. */
export function depthAt(i: number, y: number) {
  const s = SITES[i]
  const t = THREE.MathUtils.clamp((s.top - y) / (s.top - s.floor), 0, 1)
  return THREE.MathUtils.lerp(s.depthTop, s.depthFloor, t)
}

// ---- the hull: how deep the submarine may go --------------------------------
/** Rated depth per hull level, and the deepest zone it allows. */
export const HULL = [
  { rating: 500, maxZone: 1 },
  { rating: 1000, maxZone: 2 },
  { rating: 2500, maxZone: 3 },
]
/**
 * Photos needed for each upgrade, counted among species of the zones already
 * open (secret species don't count against you).
 */
const UPGRADE_NEED = [4, 6]

function speciesUpTo(zone: number) {
  return DISCOVERIES.filter((d) => !d.secret && d.zone <= zone).map((d) => d.id)
}

export function hullLevel(photographed: Iterable<DiscoveryId>) {
  const have = new Set(photographed)
  let level = 0
  while (level < UPGRADE_NEED.length) {
    const pool = speciesUpTo(HULL[level].maxZone)
    if (pool.filter((id) => have.has(id)).length < UPGRADE_NEED[level]) break
    level++
  }
  return level
}

/** Progress towards the next upgrade, or null at the last level. */
export function nextUpgrade(photographed: Iterable<DiscoveryId>) {
  const level = hullLevel(photographed)
  if (level >= UPGRADE_NEED.length) return null
  const have = new Set(photographed)
  const pool = speciesUpTo(HULL[level].maxZone)
  return { have: pool.filter((id) => have.has(id)).length, need: UPGRADE_NEED[level], rating: HULL[level + 1].rating }
}
