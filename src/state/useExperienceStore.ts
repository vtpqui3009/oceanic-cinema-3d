import { create } from 'zustand'
import { DISCOVERIES, type DiscoveryId } from '../lib/discoveries'

const KEY = 'abyssal-light:v1'

function load(): { found: DiscoveryId[]; sound: boolean } {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      const ids = new Set(DISCOVERIES.map((x) => x.id))
      return { found: (d.found ?? []).filter((x: DiscoveryId) => ids.has(x)), sound: d.sound !== false }
    }
  } catch {
    /* private mode / blocked storage: start fresh */
  }
  return { found: [], sound: true }
}

function save(found: DiscoveryId[], sound: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ found, sound }))
  } catch {
    /* ignore */
  }
}

export type Mode = 'film' | 'game'

interface ExperienceState {
  /** The viewer pressed "Bắt đầu lặn" (loader gone). */
  started: boolean
  /** Film: scroll-driven documentary. Game: free-roaming photographer. */
  mode: Mode
  sound: boolean
  found: DiscoveryId[]
  /** Card currently open. */
  open: DiscoveryId | null
  logbook: boolean
  /** At the bottom of the dive. */
  ending: boolean
  /** Hovering something discoverable (custom cursor). */
  hover: DiscoveryId | null
  start: (sound: boolean, mode?: Mode) => void
  setMode: (mode: Mode) => void
  setSound: (v: boolean) => void
  discover: (id: DiscoveryId) => boolean
  setOpen: (id: DiscoveryId | null) => void
  setLogbook: (v: boolean) => void
  setEnding: (v: boolean) => void
  setHover: (id: DiscoveryId | null) => void
  reset: () => void
}

const initial = load()

export const useExperienceStore = create<ExperienceState>((set, get) => ({
  started: false,
  mode: 'film',
  sound: initial.sound,
  found: initial.found,
  open: null,
  logbook: false,
  ending: false,
  hover: null,
  start: (sound, mode = 'film') => {
    set({ started: true, sound, mode })
    save(get().found, sound)
  },
  setMode: (mode) => set({ mode, open: null, logbook: false, hover: null, ending: false }),
  setSound: (sound) => {
    set({ sound })
    save(get().found, sound)
  },
  /** Returns true when this is a new find. */
  discover: (id) => {
    const found = get().found
    if (found.includes(id)) return false
    const next = [...found, id]
    set({ found: next })
    save(next, get().sound)
    return true
  },
  setOpen: (open) => set({ open, logbook: false }),
  setLogbook: (logbook) => set({ logbook, open: null }),
  setEnding: (ending) => set({ ending }),
  setHover: (hover) => set({ hover }),
  reset: () => {
    set({ found: [] })
    save([], get().sound)
  },
}))
