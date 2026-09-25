import { create } from 'zustand'

/**
 * Tracks procedural assets (baked meshes/textures) alongside drei's
 * useProgress, so the loader can say which creature is being prepared even
 * when nothing is fetched over the network.
 */
interface LoadingState {
  tasks: Record<string, boolean>
  current: string | null
  begin: (label: string) => void
  end: (label: string) => void
}

export const useLoadingStore = create<LoadingState>((set) => ({
  tasks: {},
  current: null,
  begin: (label) => set((s) => (label in s.tasks ? s : { tasks: { ...s.tasks, [label]: false }, current: label })),
  end: (label) => set((s) => ({ tasks: { ...s.tasks, [label]: true } })),
}))
