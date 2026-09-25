import { create } from 'zustand'

export type Quality = 'high' | 'low'

const media = (q: string) => typeof window !== 'undefined' && window.matchMedia?.(q).matches

function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'high'
  const coarse = media('(pointer: coarse)')
  const small = Math.min(window.innerWidth, window.innerHeight) < 700
  const lowMem = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
  const forced = new URLSearchParams(window.location.search).get('quality')
  if (forced === 'low' || forced === 'high') return forced
  return (coarse && small) || lowMem ? 'low' : 'high'
}

interface SceneState {
  /** Current dive stage (0 shallows … 3 abyss). */
  stage: number
  quality: Quality
  reducedMotion: boolean
  /** Lighting review toggles (step 1 demo panel). */
  lights: { fill: boolean; rim: boolean; contact: boolean }
  autoRotate: boolean
  setStage: (stage: number) => void
  toggleLight: (key: keyof SceneState['lights']) => void
  setAutoRotate: (v: boolean) => void
}

export const useSceneStore = create<SceneState>((set) => ({
  stage: 3,
  quality: detectQuality(),
  reducedMotion: !!media('(prefers-reduced-motion: reduce)'),
  lights: { fill: true, rim: true, contact: true },
  autoRotate:
    !media('(prefers-reduced-motion: reduce)') &&
    (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('autorotate') !== '0'),
  setStage: (stage) => set({ stage }),
  toggleLight: (key) => set((s) => ({ lights: { ...s.lights, [key]: !s.lights[key] } })),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
}))
