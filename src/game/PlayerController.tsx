import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { oceanAudio } from '../audio/OceanAudio'
import { SQUID_LOOP, STAGE_P, dive, lensFocus } from '../lib/dive'
import { DISCOVERIES, DISCOVERY_BY_ID } from '../lib/discoveries'
import { celebration } from '../lib/bioluminescence'
import { damp } from '../lib/smooth'
import { discoverables } from '../interaction/discoverables'
import { diverUniforms } from '../interaction/diverLight'
import { spawnBurst } from '../scene/GlowBursts'
import { NO_FX } from '../scene/PostFX'
import { useExperienceStore } from '../state/useExperienceStore'
import { useSceneStore } from '../state/useSceneStore'
import { captureThumbnail, evaluateFrame, starsFor, type Framing } from './photo'
import { input, player, useGameStore } from './useGameStore'
import { HULL, SITES, ZONE_TITLES, depthAt, floorAt, nextUpgrade } from './world'

const MAX_SPEED = 3.4
/** Clearance kept above the seabed (the dunes, boulders and our own hull). */
const FLOOR_CLEAR = 1.0
const VENT_R = 1.9
const WIDE_FOV = 58
const TELE_FOV = 24
/** Oxygen used per second, by zone (a full tank: ~3 min near the surface, ~1.6 min in the abyss). */
const DRAIN = [1 / 180, 1 / 150, 1 / 120, 1 / 100]
const REFILL = 0.3
const SQUID_SPEED = 1.15
const UI_SELECTOR = 'button, a, input, [role="dialog"], .logbook, .card, .endcard, .gauge__nav, .sound, .touch, .gwin'

const DOWN_KEYS = ['ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyC']
const UP_KEYS = ['Space', 'KeyE']

export const isTouch = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

/** Shared by the keyboard handler and the HUD's album button. */
export function toggleAlbum() {
  const exp = useExperienceStore.getState()
  const open = !exp.logbook
  oceanAudio.ui(open)
  exp.setLogbook(open)
  if (open && document.pointerLockElement) document.exitPointerLock()
}

/**
 * Explore mode's camera: a small submarine you pilot in first person.
 *
 * Swimming has inertia and water drag; the site's seabed (the same height
 * field as the mesh), its walls and the creatures push back softly. Every
 * frame it writes the dive state the rest of the world already runs on —
 * zone, depth, squid — so lights, atmosphere, music and grading follow
 * without knowing a player exists.
 *
 * Moving between zones happens in the bubble-vent stations, behind a short
 * black-out (the same frames the loader's warm-up tour prepared).
 */
export function PlayerController() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const reduced = useSceneStore((s) => s.reducedMotion)

  const st = useMemo(
    () => ({
      keys: new Set<string>(),
      yawT: player.yaw,
      pitchT: player.pitch,
      zoomLevel: 0,
      frameTick: 0,
      nextShot: 0,
      nextBeep: 0,
      warnedLow: false,
      nextHullWarn: 0,
      emptyShotWarn: 0,
      moved: 0,
      tr: { active: false, t: 0, to: 0, swapped: false, arrive: new THREE.Vector3(), yaw: 0, emergency: false },
      pending: null as null | { f: Framing | null; stars: number },
      drag: { on: false, x: 0, y: 0, sx: 0, sy: 0, t: 0 },
      fwd: new THREE.Vector3(),
      right: new THREE.Vector3(),
      wish: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
      push: new THREE.Vector3(),
      squidLen: SQUID_LOOP.getLength(),
      startedAt: performance.now() / 1000,
    }),
    [],
  )

  // ---- enter / leave explore mode ------------------------------------------
  useEffect(() => {
    dive.game = true
    dive.squidU = 0
    lensFocus.active = true
    const s = SITES[player.zone]
    if (player.pos.y > s.top + 1 || player.pos.y < s.floor - 2) player.pos.set(...s.spawn)
    st.yawT = player.yaw
    st.pitchT = player.pitch
    useGameStore.getState().setZone(player.zone)
    const setIntro = useSceneStore.getState().setIntro
    setIntro(false)
    return () => {
      dive.game = false
      lensFocus.active = false
      diverUniforms.uDiverStrength.value = 0
      if (document.pointerLockElement) document.exitPointerLock()
      Object.assign(input, { fwd: 0, strafe: 0, up: 0, turn: 0, joyX: 0, joyY: 0, lookX: 0, lookY: 0, zoomHeld: false, shoot: false, sonar: false })
    }
  }, [st])

  // ---- keyboard + mouse (touch lives in <TouchControls/>) ---------------------
  useEffect(() => {
    const canvas = gl.domElement
    const typing = (e: Event) => (e.target as Element | null)?.closest?.('input, textarea, select')
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey) return
      if (e.code === 'Tab' || e.code === 'KeyL') {
        e.preventDefault()
        toggleAlbum()
        return
      }
      if (useExperienceStore.getState().logbook) return
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      st.keys.add(e.code)
      if (e.repeat) return
      if (e.code === 'KeyF' || e.code === 'Enter') input.shoot = true
      if (e.code === 'KeyR') input.sonar = true
      if (e.code === 'KeyZ') input.zoomToggle = !input.zoomToggle
    }
    const onKeyUp = (e: KeyboardEvent) => st.keys.delete(e.code)
    const onBlur = () => st.keys.clear()

    const onLockChange = () => {
      player.locked = document.pointerLockElement === canvas
    }
    const onLockError = () => {
      player.lockFailed = true
    }
    const requestLock = () => {
      try {
        const r = canvas.requestPointerLock?.() as unknown
        if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(onLockError)
        if (!canvas.requestPointerLock) onLockError()
      } catch {
        onLockError()
      }
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if ((e.target as Element | null)?.closest?.(UI_SELECTOR)) return
      const exp = useExperienceStore.getState()
      if (!exp.started || exp.logbook || exp.open) return
      if (e.button === 2) {
        input.zoomHeld = true
        return
      }
      if (e.button !== 0) return
      if (player.locked) {
        input.shoot = true
        return
      }
      if (!player.lockFailed) {
        requestLock()
        return
      }
      // no pointer lock: drag to look, click to shoot
      const d = st.drag
      d.on = true
      d.x = d.sx = e.clientX
      d.y = d.sy = e.clientY
      d.t = performance.now()
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (player.locked) {
        input.lookX += e.movementX
        input.lookY += e.movementY
        return
      }
      const d = st.drag
      if (!d.on) return
      input.lookX += (e.clientX - d.x) * 1.8
      input.lookY += (e.clientY - d.y) * 1.8
      d.x = e.clientX
      d.y = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      if (e.button === 2) input.zoomHeld = false
      const d = st.drag
      if (e.button !== 0 || !d.on) return
      d.on = false
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6 && performance.now() - d.t < 400) input.shoot = true
    }
    const onWheel = (e: WheelEvent) => {
      st.zoomLevel = THREE.MathUtils.clamp(st.zoomLevel - e.deltaY * 0.0012, 0, 1)
      input.zoomToggle = false
    }
    const onContext = (e: Event) => e.preventDefault()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('pointerlockchange', onLockChange)
    document.addEventListener('pointerlockerror', onLockError)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('pointerlockchange', onLockChange)
      document.removeEventListener('pointerlockerror', onLockError)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [gl, st])

  // dev handle for the automated tests
  useEffect(() => {
    if (!import.meta.env.DEV) return
    Object.assign(window, {
      __game: {
        player,
        input,
        store: useGameStore,
        /** Put the sub in front of a zone's hero creature (or at `at`). */
        teleport: (zone: number, at?: [number, number, number], yaw = 0, pitch = 0) => {
          player.zone = zone
          player.pos.set(...(at ?? SITES[zone].spawn))
          player.vel.set(0, 0, 0)
          player.yaw = st.yawT = yaw
          player.pitch = st.pitchT = pitch
          useGameStore.getState().setZone(zone)
        },
        lookAt: (x: number, y: number, z: number) => {
          const d = st.tmp.set(x, y, z).sub(player.pos)
          player.yaw = st.yawT = Math.atan2(-d.x, -d.z)
          player.pitch = st.pitchT = Math.atan2(d.y, Math.hypot(d.x, d.z))
        },
      },
    })
  }, [st])

  // ---- zone transitions -------------------------------------------------------
  const beginTransition = (to: number, emergency = false) => {
    const tr = st.tr
    if (tr.active) return
    const from = player.zone
    const s = SITES[to]
    tr.active = true
    tr.t = 0
    tr.to = to
    tr.swapped = false
    tr.emergency = emergency
    if (emergency) {
      tr.arrive.set(...SITES[0].spawn)
    } else if (to > from) {
      // down the vent: arrive at the top of the next zone's bubble column
      tr.arrive.set(s.vent[0], s.top - 2.2, s.vent[1])
    } else {
      // back up: arrive just above the vent on the floor of the zone above
      tr.arrive.set(s.vent[0], floorAt(to, s.vent[0], s.vent[1]) + 3, s.vent[1])
    }
    const dx = s.cx - tr.arrive.x, dz = s.cz - tr.arrive.z
    tr.yaw = emergency ? 0 : Math.atan2(-dx, -dz)
    oceanAudio.bubbles(8)
  }

  const warnHull = (now: number) => {
    if (now < st.nextHullWarn) return
    st.nextHullWarn = now + 3.5
    const photos = Object.keys(useGameStore.getState().photos) as (keyof typeof DISCOVERY_BY_ID)[]
    const up = nextUpgrade(photos)
    const rating = HULL[useGameStore.getState().hull].rating
    useGameStore.getState().toast({
      title: `Vỏ tàu chỉ chịu được ${rating.toLocaleString('vi-VN')} m`,
      sub: up ? `Chụp thêm ${up.need - up.have} loài ở các vùng đã mở để nâng cấp` : undefined,
      tone: 'warn',
    })
    oceanAudio.hullCreak()
  }

  // ---- shots --------------------------------------------------------------
  const finishShot = (f: Framing | null, stars: number, img: string) => {
    const game = useGameStore.getState()
    if (!f) return
    const d = DISCOVERY_BY_ID[f.id]
    const prev = game.photos[f.id]?.stars ?? 0
    const res = game.addPhoto(f.id, stars, img)
    useExperienceStore.getState().discover(f.id)
    spawnBurst(f.world, player.zone, 0.7)
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars)
    game.toast({
      title: `${starStr}  ${d.name}`,
      sub: res.isNew ? 'Loài mới — đã thêm vào album' : res.better ? 'Ảnh đẹp hơn — đã thay vào album' : `Album đã có ảnh ${prev} ★`,
      stars,
      tone: res.isNew || res.better ? 'good' : 'info',
    })
    if (res.isNew) oceanAudio.discover()
    else oceanAudio.revisit()
    if (res.upgraded) {
      const h = HULL[useGameStore.getState().hull]
      window.setTimeout(() => {
        useGameStore.getState().toast({
          title: `Nâng cấp vỏ tàu: ${h.rating.toLocaleString('vi-VN')} m`,
          sub: `Đã mở ${ZONE_TITLES[h.maxZone]} — tìm cột bọt khí để lặn xuống`,
          tone: 'good',
        })
        oceanAudio.complete()
      }, 900)
    }
    const all = DISCOVERIES.every((x) => useGameStore.getState().photos[x.id])
    if (all && res.isNew) {
      window.setTimeout(() => {
        celebration.start = performance.now() / 1000
        oceanAudio.complete()
        useGameStore.getState().setWon(true)
        if (document.pointerLockElement) document.exitPointerLock()
      }, 1400)
    }
  }

  // capture right after the composer has drawn this frame
  useFrame((state) => {
    if (NO_FX) state.gl.render(state.scene, state.camera)
    const p = st.pending
    if (!p) return
    st.pending = null
    const img = p.f ? captureThumbnail(gl.domElement) : ''
    finishShot(p.f, p.stars, img)
  }, 2)

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    const now = performance.now() / 1000
    const exp = useExperienceStore.getState()
    const game = useGameStore.getState()
    const paused = !exp.started || exp.logbook || !!exp.open || game.won
    const tr = st.tr
    const controls = !paused && !(tr.active && !tr.swapped)
    const touch = isTouch()

    // ---- inputs --------------------------------------------------------------
    const k = st.keys
    const has = (...codes: string[]) => codes.some((c) => k.has(c))
    let fwd = 0, strafe = 0, up = 0, turn = 0
    if (controls) {
      fwd = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0) - input.joyY
      strafe = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0) + input.joyX
      up = (has(...UP_KEYS) || input.btnUp ? 1 : 0) - (has(...DOWN_KEYS) || input.btnDown ? 1 : 0)
      turn = (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0)
    }
    const zoomT = input.zoomHeld || input.zoomToggle ? 1 : st.zoomLevel
    player.zoom = damp(player.zoom, controls ? zoomT : 0, 7, dt)

    // ---- look ------------------------------------------------------------------
    const aspect = size.width / size.height
    const wide = aspect < 1 ? 72 : WIDE_FOV
    const fov = THREE.MathUtils.lerp(wide, TELE_FOV, player.zoom)
    const sens = (player.locked ? 0.0022 : 0.0034) * (fov / wide)
    if (controls) {
      st.yawT -= input.lookX * sens + turn * 1.7 * dt * (fov / wide)
      st.pitchT = THREE.MathUtils.clamp(st.pitchT - input.lookY * sens, -1.35, 1.35)
    }
    input.lookX = input.lookY = 0
    const py = player.yaw, pp = player.pitch
    player.yaw = damp(player.yaw, st.yawT, 22, dt)
    player.pitch = damp(player.pitch, st.pitchT, 22, dt)
    const rate = (Math.abs(player.yaw - py) + Math.abs(player.pitch - pp)) / Math.max(dt, 1e-3)
    player.turnRate = damp(player.turnRate, rate, 10, dt)

    // ---- swim ------------------------------------------------------------------
    const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw), cp = Math.cos(player.pitch)
    st.fwd.set(-sy * cp, Math.sin(player.pitch), -cy * cp)
    st.right.set(cy, 0, -sy)
    const wish = st.wish.set(0, 0, 0).addScaledVector(st.fwd, fwd).addScaledVector(st.right, strafe)
    wish.y += up
    const wl = wish.length()
    if (wl > 1) wish.divideScalar(wl)
    const top = MAX_SPEED * (1 - player.zoom * 0.45)
    player.vel.lerp(wish.multiplyScalar(top), 1 - Math.exp(-(wl > 0.01 ? 1.9 : 0.9) * dt))
    player.pos.addScaledVector(player.vel, dt)
    if (wl > 0.01) st.moved += dt
    if (game.help && (st.moved > 1.5 || now - st.startedAt > 25)) game.setHelp(false)

    // ---- the site's limits -----------------------------------------------------
    const zone = player.zone
    const s = SITES[zone]
    const pos = player.pos
    const dx = pos.x - s.cx, dz = pos.z - s.cz
    const d = Math.hypot(dx, dz)
    if (d > s.r) {
      // a soft current turns you back at the edge of the site
      const nx = dx / d, nz = dz / d
      const over = d - s.r
      const f = 1 - Math.exp(-5 * dt)
      pos.x -= nx * over * f
      pos.z -= nz * over * f
      const vr = player.vel.x * nx + player.vel.z * nz
      if (vr > 0) {
        player.vel.x -= nx * vr * f * 2
        player.vel.z -= nz * vr * f * 2
      }
      if (over > 2) {
        pos.x = s.cx + nx * (s.r + 2)
        pos.z = s.cz + nz * (s.r + 2)
      }
    }
    const floor = floorAt(zone, pos.x, pos.z) + FLOOR_CLEAR
    if (pos.y < floor) {
      pos.y = floor
      if (player.vel.y < 0) player.vel.y = 0
    }
    if (pos.y > s.top) {
      if (zone === 0 || tr.active) {
        pos.y = Math.min(pos.y, s.top + (zone === 0 ? 0 : 0.8))
        if (player.vel.y > 0) player.vel.y *= 0.5
      } else if (controls) beginTransition(zone - 1)
    }

    // creatures are solid-ish: a gentle push out of the big ones
    for (const [, dd] of discoverables) {
      if (dd.zone !== zone || (dd.active && !dd.active())) continue
      dd.sample((c, r) => {
        if (r < 0.8) return
        const min = r + 0.45
        const dist2 = c.distanceToSquared(pos)
        if (dist2 >= min * min) return
        const dist = Math.sqrt(dist2)
        st.push.copy(pos).sub(c).divideScalar(Math.max(dist, 1e-3))
        pos.addScaledVector(st.push, (min - dist) * (1 - Math.exp(-8 * dt)))
      }, now)
    }

    // ---- vent: oxygen, and the way down ----------------------------------------
    const vdist = Math.hypot(pos.x - s.vent[0], pos.z - s.vent[1])
    const inVent = vdist < VENT_R
    const nearVentFloor = inVent && pos.y < floor + 1.6
    let prompt = ''
    if (inVent && zone < 3) {
      const allowed = zone + 1 <= HULL[game.hull].maxZone
      if (nearVentFloor) {
        prompt = allowed
          ? `Giữ ${touch ? '▼' : 'Shift'} để lặn xuống ${ZONE_TITLES[zone + 1]}`
          : `Vỏ tàu chưa đủ sâu cho ${ZONE_TITLES[zone + 1]}`
        if (controls && up < 0) {
          if (allowed) beginTransition(zone + 1)
          else warnHull(now)
        }
      } else prompt = `Trạm lặn · xuống đáy cột bọt khí để tới ${ZONE_TITLES[zone + 1]}`
    } else if (zone > 0 && pos.y > s.top - 1.8) {
      prompt = `Bơi lên để trở về ${ZONE_TITLES[zone - 1]}`
    }
    const surface = zone === 0 && pos.y > s.top - 1
    if (!paused && !tr.active) {
      if (inVent || surface) player.oxygen = Math.min(1, player.oxygen + REFILL * dt)
      else player.oxygen = Math.max(0, player.oxygen - DRAIN[zone] * dt)
    }
    if ((inVent || surface) && player.oxygen < 0.995 && !prompt) prompt = 'Đang nạp dưỡng khí…'
    if (player.oxygen < 0.25 && !paused) {
      if (!st.warnedLow) {
        st.warnedLow = true
        game.toast({ title: 'Dưỡng khí sắp cạn', sub: zone === 0 ? 'Nổi lên mặt nước hoặc tìm cột bọt khí' : 'Tìm cột bọt khí (dấu ◎) để nạp lại', tone: 'warn' })
      }
      if (now > st.nextBeep) {
        st.nextBeep = now + 4
        oceanAudio.oxygenLow()
      }
    } else if (player.oxygen > 0.4) st.warnedLow = false
    if (player.oxygen <= 0 && !tr.active) {
      beginTransition(0, true)
      game.toast({ title: 'Hết dưỡng khí!', sub: 'Tàu tự động nổi về mặt nước. Ảnh đã chụp vẫn được giữ.', tone: 'warn' })
    }
    player.prompt = prompt

    // ---- transition ----------------------------------------------------------
    if (tr.active) {
      tr.t += dt
      if (!tr.swapped && tr.t >= 0.5) {
        tr.swapped = true
        player.zone = tr.to
        pos.copy(tr.arrive)
        player.vel.set(0, 0, 0)
        player.yaw = st.yawT = tr.yaw
        player.pitch = st.pitchT = -0.12
        if (tr.emergency) player.oxygen = 1
        game.setZone(tr.to)
        st.frameTick = 1
      }
      player.fade = tr.t < 0.5 ? tr.t / 0.5 : Math.max(0, 1 - (tr.t - 0.65) / 0.7)
      if (tr.t > 1.4) {
        tr.active = false
        player.fade = 0
      }
    }

    // ---- the world follows the sub ---------------------------------------------
    const z = player.zone
    dive.stageF = z
    dive.p = STAGE_P[z]
    dive.depth = depthAt(z, pos.y)
    dive.squidU = (dive.squidU + (dt * SQUID_SPEED) / st.squidLen) % 1
    const scene = useSceneStore.getState()
    if (scene.stage !== z) scene.setStage(z)
    if (scene.intro) scene.setIntro(false)

    // ---- camera ----------------------------------------------------------------
    const t = state.clock.elapsedTime
    const bob = reduced ? 0 : 1
    camera.position.copy(pos)
    camera.position.y += Math.sin(t * 0.9) * 0.035 * bob
    camera.rotation.set(player.pitch + Math.sin(t * 0.7) * 0.006 * bob, player.yaw, Math.sin(t * 0.5 + 1) * 0.012 * bob - strafe * 0.02, 'YXZ')
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()

    // the sub's lamp (particles brighten and part in front of it)
    diverUniforms.uDiverStrength.value = damp(diverUniforms.uDiverStrength.value, paused ? 0 : 0.85, 3, dt)
    diverUniforms.uDiverPos.value.copy(pos).addScaledVector(st.fwd, 3.5)

    // ---- viewfinder (10×/s) ------------------------------------------------------
    st.frameTick += dt
    if (st.frameTick >= 0.1) {
      st.frameTick = 0
      const f = evaluateFrame(camera, size.width, size.height, z, SITES[z].sight, now)
      const fr = player.frame
      fr.id = f?.id ?? null
      fr.quality = f?.quality ?? 0
      fr.x = f?.x ?? size.width / 2
      fr.y = f?.y ?? size.height / 2
      fr.r = f?.r ?? 0
      if (f) lensFocus.point.copy(f.world)
      else lensFocus.point.copy(pos).addScaledVector(st.fwd, 6)
    }

    // ---- shutter & sonar -------------------------------------------------------------
    if (input.shoot) {
      input.shoot = false
      if (controls && now >= st.nextShot) {
        st.nextShot = now + 0.55
        const f = evaluateFrame(camera, size.width, size.height, z, SITES[z].sight, now)
        player.flash = 1
        oceanAudio.shutter()
        if (f) {
          // copy: the framing's world point is shared scratch space
          f.world = f.world.clone()
          st.pending = { f, stars: starsFor(f.quality, player.vel.length(), player.turnRate) }
        } else if (now > st.emptyShotWarn) {
          st.emptyShotWarn = now + 4
          game.toast({ title: 'Không có sinh vật nào trong khung', sub: 'Đưa sinh vật vào giữa khung ngắm rồi chụp', tone: 'info' })
        }
      }
    }
    player.flash = damp(player.flash, 0, 9, dt)
    if (input.sonar) {
      input.sonar = false
      if (controls && now >= player.sonarReady) {
        player.sonarUntil = now + 4
        player.sonarReady = now + 9
        oceanAudio.sonarPing()
      }
    }

    // ---- the vent marker (for the HUD) ------------------------------------------------
    const v = player.vent
    const vs = SITES[z]
    st.tmp.set(vs.vent[0], THREE.MathUtils.clamp(pos.y, floorAt(z, vs.vent[0], vs.vent[1]) + 1, vs.top - 1), vs.vent[1])
    v.dist = st.tmp.distanceTo(pos)
    v.on = v.dist > VENT_R + 0.5 && !paused
    st.tmp.project(camera)
    const behind = st.tmp.z > 1
    let nx = behind ? -st.tmp.x : st.tmp.x
    let ny = behind ? -st.tmp.y : st.tmp.y
    // keep the marker clear of the depth gauge (right) and the panels
    const m = Math.max(Math.abs(nx) / 0.68, Math.abs(ny) / 0.8)
    v.edge = behind || m > 1
    if (v.edge) {
      nx /= Math.max(m, 1e-3)
      ny /= Math.max(m, 1e-3)
    }
    v.x = (nx * 0.5 + 0.5) * size.width
    v.y = (-ny * 0.5 + 0.5) * size.height
  })

  return null
}
