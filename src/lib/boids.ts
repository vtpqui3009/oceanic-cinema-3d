import * as THREE from 'three'
import { createRng } from './noise'

export interface Boid {
  pos: THREE.Vector3
  vel: THREE.Vector3
  /** Personal cruising speed and turn agility — no two fish alike. */
  speed: number
  agility: number
  /** Smoothed bank angle (roll into turns). */
  bank: number
  /** Tail-beat phase. */
  phase: number
  size: number
  /** Velocity last frame (for turn rate). */
  prev: THREE.Vector3
}

export interface FlockParams {
  center: THREE.Vector3
  radius: number
  floor: number
  ceiling: number
  perception: number
  separation: number
  maxForce: number
  weights: { separation: number; alignment: number; cohesion: number; goal: number; bounds: number }
}

export const DEFAULT_FLOCK: Omit<FlockParams, 'center'> = {
  radius: 6,
  floor: -4.6,
  ceiling: 5,
  perception: 1.5,
  separation: 0.5,
  maxForce: 2.6,
  weights: { separation: 2.2, alignment: 1.1, cohesion: 0.75, goal: 0.55, bounds: 2.5 },
}

export function createFlock(count: number, center: THREE.Vector3, seed = 21): Boid[] {
  const rng = createRng(seed)
  return Array.from({ length: count }, () => {
    const a = rng() * Math.PI * 2, b = Math.acos(2 * rng() - 1), r = Math.cbrt(rng())
    const pos = new THREE.Vector3(Math.sin(b) * Math.cos(a) * 3 * r, Math.cos(b) * r, Math.sin(b) * Math.sin(a) * 2 * r).add(center)
    return {
      pos,
      vel: new THREE.Vector3(1, 0, 0.3).normalize().multiplyScalar(1.2),
      speed: 1.1 + rng() * 0.5,
      agility: 0.8 + rng() * 0.4,
      bank: 0,
      phase: rng() * 100,
      size: 0.32 + rng() * 0.16,
      prev: new THREE.Vector3(),
    }
  })
}

const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3()
const steer = new THREE.Vector3(), acc = new THREE.Vector3(), d = new THREE.Vector3()

function limit(v: THREE.Vector3, max: number) {
  const l = v.length()
  if (l > max) v.multiplyScalar(max / l)
  return v
}

/**
 * Classic Reynolds boids (separation / alignment / cohesion) plus a slowly
 * wandering goal the whole school drifts towards, and soft walls: the
 * surface, the sand and a sphere around the scene.
 */
/** A threat to flee from (the diver's torch), in the flock's space. */
export interface Avoid {
  pos: THREE.Vector3
  strength: number
  radius: number
}

export function stepFlock(boids: Boid[], goal: THREE.Vector3, p: FlockParams, dt: number, avoid?: Avoid) {
  const per2 = p.perception * p.perception
  const sep2 = p.separation * p.separation
  for (const b of boids) {
    sep.set(0, 0, 0)
    ali.set(0, 0, 0)
    coh.set(0, 0, 0)
    let n = 0
    for (const o of boids) {
      if (o === b) continue
      d.subVectors(b.pos, o.pos)
      const l2 = d.lengthSq()
      if (l2 > per2) continue
      n++
      ali.add(o.vel)
      coh.add(o.pos)
      if (l2 < sep2) sep.addScaledVector(d, 1 / Math.max(l2, 1e-4))
    }
    acc.set(0, 0, 0)
    const want = b.speed
    if (n > 0) {
      // steering = desired velocity − current velocity (Reynolds)
      steer.copy(ali).divideScalar(n).setLength(want).sub(b.vel)
      acc.addScaledVector(limit(steer, p.maxForce), p.weights.alignment)
      steer.copy(coh).divideScalar(n).sub(b.pos).setLength(want).sub(b.vel)
      acc.addScaledVector(limit(steer, p.maxForce), p.weights.cohesion)
      if (sep.lengthSq() > 0) {
        steer.copy(sep).setLength(want).sub(b.vel)
        acc.addScaledVector(limit(steer, p.maxForce), p.weights.separation)
      }
    }
    steer.subVectors(goal, b.pos).setLength(want).sub(b.vel)
    acc.addScaledVector(limit(steer, p.maxForce), p.weights.goal)

    // flee the torch: strong and short-ranged, so the school splits and reforms
    if (avoid && avoid.strength > 0.01) {
      d.subVectors(b.pos, avoid.pos)
      const l = d.length()
      if (l < avoid.radius) acc.addScaledVector(d.divideScalar(Math.max(l, 1e-3)), (1 - l / avoid.radius) * avoid.strength * 9)
    }

    // soft walls
    d.subVectors(b.pos, p.center)
    const out = d.length() - p.radius
    if (out > 0) acc.addScaledVector(d.normalize(), -out * p.weights.bounds)
    if (b.pos.y < p.floor + 1) acc.y += (p.floor + 1 - b.pos.y) * p.weights.bounds * 2
    if (b.pos.y > p.ceiling - 1) acc.y -= (b.pos.y - (p.ceiling - 1)) * p.weights.bounds * 2
    acc.y *= 0.35 // fish turn sideways far more readily than they climb
    // hold a preferred depth (swim bladder): level off towards the goal's depth
    acc.y += (goal.y - b.pos.y) * 0.9 - b.vel.y * 1.6
    // keep swimming: thrust along the heading towards cruising speed
    const s0 = b.vel.length()
    acc.addScaledVector(b.vel, ((want - s0) * 1.5) / Math.max(s0, 1e-5))

    b.vel.addScaledVector(acc, dt * b.agility)
    // limit pitch to ~20°: a fish never swims straight up or down
    const horiz = Math.hypot(b.vel.x, b.vel.z)
    b.vel.y = THREE.MathUtils.clamp(b.vel.y, -horiz * 0.36, horiz * 0.36)
    const s = b.vel.length()
    const clamped = THREE.MathUtils.clamp(s, want * 0.8, want * 1.45)
    b.vel.multiplyScalar(clamped / Math.max(s, 1e-5))
    b.pos.addScaledVector(b.vel, dt)
  }
}
