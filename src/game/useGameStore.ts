import { create } from 'zustand'
import * as THREE from 'three'
import { DISCOVERIES, type DiscoveryId } from '../lib/discoveries'
import { hullLevel } from './world'

/**
 * Explore mode state.
 *
 * `player` is the live, per-frame state (mutated by the controller, read by
 * the HUD's own rAF loop — never through React). The zustand store holds the
 * few things React renders: the album, toasts, the zone, the end card.
 */

export const player = {
  pos: new THREE.Vector3(0, 3, 11),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.08,
  /** Smoothed angular speed (rad/s), for photo sharpness. */
  turnRate: 0,
  zone: 0,
  oxygen: 1,
  /** 0…1 zoom (lens goes from wide to tele). */
  zoom: 0,
  /** Sonar: hint rings visible until `sonarUntil`, usable again at `sonarReady` (s, performance clock). */
  sonarUntil: 0,
  sonarReady: 0,
  /** Black-out used by zone transitions (0…1). */
  fade: 0,
  /** Photo flash (1 → 0). */
  flash: 0,
  /** Hint shown under the viewfinder ('' for none). */
  prompt: '',
  /** What the viewfinder sees (updated ~10×/s). */
  frame: { id: null as DiscoveryId | null, quality: 0, x: 0, y: 0, r: 0 },
  /** Pointer lock refused (sandboxed iframe…): look by dragging instead. */
  lockFailed: false,
  locked: false,
  /** Screen position of the vent marker; `on` false when not shown. */
  vent: { x: 0, y: 0, on: false, edge: false, dist: 0 },
}

/** Controller inputs, written by keyboard / mouse / touch handlers. */
export const input = {
  fwd: 0,
  strafe: 0,
  up: 0,
  turn: 0,
  /** Touch joystick, −1…1 each. */
  joyX: 0,
  joyY: 0,
  /** Held buttons (touch ▲▼). */
  btnUp: false,
  btnDown: false,
  /** Accumulated look delta (px) since the last frame. */
  lookX: 0,
  lookY: 0,
  zoomHeld: false,
  zoomToggle: false,
  shoot: false,
  sonar: false,
}

export interface Photo {
  stars: number
  img: string
  at: number
}
export interface Toast {
  key: number
  title: string
  sub?: string
  stars?: number
  tone?: 'good' | 'warn' | 'info'
}

const KEY = 'abyssal-light:album:v1'
const ids = new Set(DISCOVERIES.map((d) => d.id))

function load(): Partial<Record<DiscoveryId, Photo>> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const d = JSON.parse(raw) as Record<string, Photo>
    return Object.fromEntries(Object.entries(d).filter(([k, v]) => ids.has(k as DiscoveryId) && v && typeof v.img === 'string'))
  } catch {
    return {}
  }
}
function save(photos: Partial<Record<DiscoveryId, Photo>>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(photos))
  } catch {
    // storage full or blocked: keep the album for this visit only
  }
}

interface GameState {
  photos: Partial<Record<DiscoveryId, Photo>>
  hull: number
  zone: number
  toasts: Toast[]
  won: boolean
  /** Controls card (dismissed on first move). */
  help: boolean
  /** Records a photo; returns whether it is a new species / a better shot. */
  addPhoto: (id: DiscoveryId, stars: number, img: string) => { isNew: boolean; better: boolean; upgraded: boolean }
  setZone: (z: number) => void
  toast: (t: Omit<Toast, 'key'>) => void
  dropToast: (key: number) => void
  setWon: (v: boolean) => void
  setHelp: (v: boolean) => void
  resetAlbum: () => void
}

const initial = load()
let toastKey = 0

export const useGameStore = create<GameState>((set, get) => ({
  photos: initial,
  hull: hullLevel(Object.keys(initial) as DiscoveryId[]),
  zone: 0,
  toasts: [],
  won: false,
  help: true,
  addPhoto: (id, stars, img) => {
    const photos = get().photos
    const prev = photos[id]
    const isNew = !prev
    const better = !!prev && stars > prev.stars
    if (!isNew && !better) return { isNew, better, upgraded: false }
    const next = { ...photos, [id]: { stars, img, at: Date.now() } }
    const hull = hullLevel(Object.keys(next) as DiscoveryId[])
    const upgraded = hull > get().hull
    set({ photos: next, hull })
    save(next)
    return { isNew, better, upgraded }
  },
  setZone: (zone) => set({ zone }),
  toast: (t) => {
    const key = ++toastKey
    // at most three on screen
    set({ toasts: [...get().toasts.slice(-2), { ...t, key }] })
    window.setTimeout(() => get().dropToast(key), t.tone === 'warn' ? 3800 : 3200)
  },
  dropToast: (key) => set({ toasts: get().toasts.filter((t) => t.key !== key) }),
  setWon: (won) => set({ won }),
  setHelp: (help) => set({ help }),
  resetAlbum: () => {
    set({ photos: {}, hull: 0, won: false })
    save({})
  },
}))

export function totalStars(photos: Partial<Record<DiscoveryId, Photo>>) {
  return Object.values(photos).reduce((n, p) => n + (p?.stars ?? 0), 0)
}
