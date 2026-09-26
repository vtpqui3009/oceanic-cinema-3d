import * as THREE from 'three'

/**
 * Organic light pulse ≈ 0.7…1.1 — a slow "breath", a faster shimmer and an
 * occasional brighter flare, so no two emitters beat in sync.
 */
export function bioPulse(t: number, seed = 0): number {
  const breath = Math.sin(t * 1.15 + seed) * 0.09
  const shimmer = Math.sin(t * 4.3 + seed * 2.7) * 0.035 + Math.sin(t * 7.9 + seed * 5.1) * 0.02
  const flarePhase = (t * 0.21 + seed * 0.37) % 1
  const flare = Math.exp(-Math.pow((flarePhase - 0.5) * 14, 2)) * 0.18
  return 0.9 + breath + shimmer + flare
}

export interface BioLightEntry {
  object: THREE.Object3D
  color: THREE.Color
  /** Current (pulsed) strength, updated every frame by the emitter. */
  strength: number
}

/** Registry of live bioluminescent emitters; particles read it to glow nearby. */
export const bioLights = new Set<BioLightEntry>()

/**
 * Logbook complete: every emitter flares together for a few seconds.
 * Returns a multiplier (1 = normal) read by BioLight each frame.
 */
export const celebration = { start: -100 }
export function celebrationBoost(now: number) {
  const age = now - celebration.start
  if (age < 0 || age > 4) return 1
  return 1 + 2.2 * Math.sin((age / 4) * Math.PI) * (0.75 + 0.25 * Math.sin(age * 14))
}
