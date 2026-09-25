import { create } from 'zustand'

export type Quality = 'high' | 'low'

const media = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches
const param = (k: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(k))

function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high'
  const forced = param('quality')
  if (forced === 'low' || forced === 'high') return forced
  const coarse = media('(pointer: coarse)')
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const lowMem = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
  return (coarse && small) || lowMem ? 'low' : 'high'
}

interface SceneState {
  /** Nearest dive stage (0 shallows … 3 abyss) — drives the chapter card. */
  stage: number
  /** True while still at the surface, before the dive starts. */
  intro: boolean
  quality: Quality
  reducedMotion: boolean
  /** Set when the GPU can't hold frame rate even at minimum resolution. */
  degraded: boolean
  setDegraded: (v: boolean) => void
  setStage: (stage: number) => void
  setIntro: (intro: boolean) => void
}

export const useSceneStore = create<SceneState>((set) => ({
  stage: 0,
  intro: true,
  quality: detectQuality(),
  reducedMotion: media('(prefers-reduced-motion: reduce)') || param('motion') === 'reduced',
  degraded: false,
  setDegraded: (degraded) => set({ degraded }),
  setStage: (stage) => set({ stage }),
  setIntro: (intro) => set({ intro }),
}))
