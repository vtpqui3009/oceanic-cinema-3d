import * as THREE from 'three'

/** Frame-rate independent exponential smoothing (same feel at 30, 60 or 144 Hz). */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt))
}

/**
 * Critically-damped spring (Unity-style SmoothDamp). Unlike exponential
 * smoothing it carries velocity, so starts and stops ease in and out
 * instead of snapping to full speed — the difference between a dolly and a
 * floating diver.
 */
export function smoothDamp(current: number, target: number, state: { v: number }, smoothTime: number, dt: number) {
  const omega = 2 / Math.max(smoothTime, 1e-4)
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (state.v + omega * change) * dt
  state.v = (state.v - omega * temp) * exp
  return target + (change + temp) * exp
}

export class SmoothVec3 {
  private vx = { v: 0 }
  private vy = { v: 0 }
  private vz = { v: 0 }
  constructor(public value = new THREE.Vector3()) {}
  update(target: THREE.Vector3, smoothTime: number, dt: number) {
    const v = this.value
    v.set(
      smoothDamp(v.x, target.x, this.vx, smoothTime, dt),
      smoothDamp(v.y, target.y, this.vy, smoothTime, dt),
      smoothDamp(v.z, target.z, this.vz, smoothTime, dt),
    )
    return v
  }
  snap(target: THREE.Vector3) {
    this.value.copy(target)
    this.vx.v = this.vy.v = this.vz.v = 0
  }
}
