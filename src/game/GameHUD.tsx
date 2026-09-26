import { useEffect, useRef, useState } from 'react'
import { DISCOVERY_BY_ID, TOTAL_DISCOVERIES } from '../lib/discoveries'
import { useExperienceStore } from '../state/useExperienceStore'
import { oceanAudio } from '../audio/OceanAudio'
import { isTouch } from './PlayerController'
import { starsFor } from './photo'
import { input, player, totalStars, useGameStore } from './useGameStore'
import { HULL, ZONE_TITLES, nextUpgrade } from './world'
import type { DiscoveryId } from '../lib/discoveries'

/**
 * Explore mode's heads-up display. Everything that changes per frame
 * (oxygen, viewfinder, vent marker, prompt, flash, fade) is written from a
 * requestAnimationFrame loop with transform / opacity / textContent only;
 * React renders just the rare things (toasts, hull, the end card).
 */
export function GameHUD() {
  const mode = useExperienceStore((s) => s.mode)
  const started = useExperienceStore((s) => s.started)
  if (mode !== 'game' || !started) return null
  return <HUD />
}

function HUD() {
  const fade = useRef<HTMLDivElement>(null!)
  const flash = useRef<HTMLDivElement>(null!)
  const low = useRef<HTMLDivElement>(null!)
  const oxy = useRef<HTMLElement>(null!)
  const oxyPct = useRef<HTMLElement>(null!)
  const target = useRef<HTMLDivElement>(null!)
  const label = useRef<HTMLSpanElement>(null!)
  const vf = useRef<HTMLDivElement>(null!)
  const vent = useRef<HTMLDivElement>(null!)
  const ventDist = useRef<HTMLSpanElement>(null!)
  const prompt = useRef<HTMLParagraphElement>(null!)
  const sonar = useRef<HTMLButtonElement>(null!)
  const lock = useRef<HTMLDivElement>(null!)
  const touch = isTouch()

  useEffect(() => {
    let raf = 0
    const last = { fade: '', flash: '', oxy: -1, prompt: '\0', label: '\0', vent: -1, sonar: '\0', lock: -1 }
    const tick = () => {
      const now = performance.now() / 1000
      const photos = useGameStore.getState().photos
      const exp = useExperienceStore.getState()
      const fo = player.fade.toFixed(3), fl = (player.flash * 0.85).toFixed(2)
      if (fo !== last.fade) fade.current.style.opacity = last.fade = fo
      if (fl !== last.flash) flash.current.style.opacity = last.flash = fl

      const o = Math.round(player.oxygen * 100)
      if (o !== last.oxy) {
        last.oxy = o
        oxy.current.style.transform = `scaleX(${player.oxygen})`
        oxyPct.current.textContent = `${o} %`
        oxy.current.parentElement!.parentElement!.classList.toggle('ghud__gauge--low', player.oxygen < 0.25)
        // (the pulsing animation only runs while the class is on)
        low.current.classList.toggle('ghud__low--on', player.oxygen < 0.25)
      }

      // viewfinder: the focus box follows the subject, stars estimate the shot
      const f = player.frame
      if (f.id) {
        const r = Math.min(Math.max(f.r, 22), Math.min(window.innerWidth, window.innerHeight) * 0.3)
        target.current.style.transform = `translate3d(${f.x}px, ${f.y}px, 0) scale(${r / 50})`
        target.current.style.opacity = '1'
        const stars = starsFor(f.quality, player.vel.length(), player.turnRate)
        const name = photos[f.id] ? DISCOVERY_BY_ID[f.id].name : 'Loài mới!'
        const text = `${name} · ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`
        if (text !== last.label) {
          last.label = text
          label.current.textContent = text
        }
        vf.current.classList.toggle('vf--good', stars === 3)
        vf.current.classList.add('vf--on')
      } else {
        target.current.style.opacity = '0'
        vf.current.classList.remove('vf--on', 'vf--good')
      }

      const v = player.vent
      vent.current.style.opacity = v.on ? '1' : '0'
      if (v.on) {
        vent.current.style.transform = `translate3d(${v.x}px, ${v.y}px, 0)`
        const d = Math.round(v.dist)
        if (d !== last.vent) {
          last.vent = d
          ventDist.current.textContent = `${d} m`
        }
      }

      if (player.prompt !== last.prompt) {
        last.prompt = player.prompt
        prompt.current.textContent = player.prompt
        prompt.current.style.opacity = player.prompt ? '1' : '0'
      }

      const wait = player.sonarReady - now
      const sText = wait > 0 ? `Sonar · ${Math.ceil(wait)} s` : touch ? 'Sonar' : 'Sonar · R'
      if (sText !== last.sonar) {
        last.sonar = sText
        sonar.current.textContent = sText
        sonar.current.disabled = wait > 0
      }

      const showLock = !touch && !player.locked && !player.lockFailed && !exp.logbook && !exp.open && !useGameStore.getState().won ? 1 : 0
      if (showLock !== last.lock) {
        last.lock = showLock
        lock.current.style.opacity = String(showLock)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [touch])

  return (
    <div className="ghud" aria-live="polite">
      <div className="ghud__low" ref={low} aria-hidden="true" />
      <div className="vf" ref={vf} aria-hidden="true">
        <i className="vf__c vf__c--tl" />
        <i className="vf__c vf__c--tr" />
        <i className="vf__c vf__c--bl" />
        <i className="vf__c vf__c--br" />
        <i className="vf__cross" />
      </div>
      <div className="vf-target" ref={target} style={{ opacity: 0 }} aria-hidden="true">
        <i className="vf-target__box" />
      </div>
      <p className="vf-label">
        <span ref={label} />
      </p>
      <div className="vent-marker" ref={vent} style={{ opacity: 0 }} aria-hidden="true">
        <span className="vent-marker__icon">◎</span>
        <span className="vent-marker__text">
          Trạm khí · <span ref={ventDist} />
        </span>
      </div>
      <p className="ghud__prompt" ref={prompt} style={{ opacity: 0 }} />

      <div className="ghud__panel">
        <div className="ghud__gauge">
          <span className="ghud__gauge-label">
            Dưỡng khí <b ref={oxyPct} />
          </span>
          <span className="ghud__bar">
            <i ref={oxy} />
          </span>
        </div>
        <Hull />
        <button
          className="ghud__sonar"
          ref={sonar}
          // (keyboard: R) — the controller owns the cooldown
          onClick={() => void (input.sonar = true)}
        />
      </div>

      <ZoneTitle />
      <Toasts />
      <Help touch={touch} />
      <div className="ghud__lock" ref={lock} style={{ opacity: 0 }} aria-hidden="true">
        Nhấp vào màn hình để điều khiển tàu lặn · Esc để nhả chuột
      </div>
      <WinCard />
      <div className="ghud__flash" ref={flash} aria-hidden="true" />
      <div className="ghud__fade" ref={fade} aria-hidden="true" />
    </div>
  )
}

function Hull() {
  const hull = useGameStore((s) => s.hull)
  const photos = useGameStore((s) => s.photos)
  const up = nextUpgrade(Object.keys(photos) as DiscoveryId[])
  return (
    <p className="ghud__hull">
      Vỏ tàu <b>{HULL[hull].rating.toLocaleString('vi-VN')} m</b>
      {up ? (
        <span>
          {' '}
          · nâng cấp {up.have}/{up.need} ảnh
        </span>
      ) : (
        <span> · tối đa</span>
      )}
    </p>
  )
}

function ZoneTitle() {
  const zone = useGameStore((s) => s.zone)
  const [shown, setShown] = useState(zone)
  const [on, setOn] = useState(true)
  useEffect(() => {
    setShown(zone)
    setOn(true)
    const t = window.setTimeout(() => setOn(false), 3600)
    return () => clearTimeout(t)
  }, [zone])
  return (
    <p className={`ghud__zone ${on ? 'ghud__zone--on' : ''}`} key={shown}>
      {ZONE_TITLES[shown]}
    </p>
  )
}

function Toasts() {
  const toasts = useGameStore((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.key} className={`toast toast--${t.tone ?? 'info'}`}>
          <p className="toast__title">{t.title}</p>
          {t.sub && <p className="toast__sub">{t.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function Help({ touch }: { touch: boolean }) {
  const help = useGameStore((s) => s.help)
  return (
    <aside className={`ghelp ${help ? 'ghelp--on' : ''}`} aria-hidden={!help}>
      <p className="ghelp__title">Nhiệm vụ: chụp ảnh cả {TOTAL_DISCOVERIES} loài</p>
      <p className="ghelp__line">
        Đưa sinh vật vào giữa khung, đủ lớn và giữ tàu yên để được 3 ★. Dưỡng khí cạn dần — nạp lại ở cột bọt khí ◎. Chụp đủ loài để nâng cấp
        vỏ tàu và lặn sâu hơn.
      </p>
      {touch ? (
        <ul className="ghelp__keys">
          <li>Cần điều khiển trái: bơi</li>
          <li>Kéo bên phải: nhìn</li>
          <li>▲ ▼: lên / xuống</li>
          <li>◉: chụp · 🔍: zoom</li>
        </ul>
      ) : (
        <ul className="ghelp__keys">
          <li>
            <kbd>W A S D</kbd> bơi
          </li>
          <li>
            <kbd>Chuột</kbd> nhìn
          </li>
          <li>
            <kbd>Space</kbd>/<kbd>Shift</kbd> lên / xuống
          </li>
          <li>
            <kbd>Click</kbd> chụp · <kbd>Chuột phải</kbd> zoom
          </li>
          <li>
            <kbd>R</kbd> sonar · <kbd>Tab</kbd> album
          </li>
        </ul>
      )}
    </aside>
  )
}

function WinCard() {
  const won = useGameStore((s) => s.won)
  const photos = useGameStore((s) => s.photos)
  const setWon = useGameStore((s) => s.setWon)
  const stars = totalStars(photos)
  return (
    <section className={`gwin ${won ? 'gwin--on' : ''}`} role="dialog" aria-hidden={!won}>
      <p className="endcard__eyebrow">Album hoàn chỉnh</p>
      <h2 className="endcard__title">Bạn đã chụp được cả {TOTAL_DISCOVERIES} loài sinh vật của đại dương.</h2>
      <p className="endcard__stat">
        Điểm nhiếp ảnh: <strong>{stars}</strong> / {TOTAL_DISCOVERIES * 3} ★
        {stars < TOTAL_DISCOVERIES * 3 ? ' · chụp lại để có ảnh 3 ★ cho mọi loài' : ' · hoàn hảo!'}
      </p>
      <div className="endcard__actions">
        <button
          className="btn btn--primary"
          tabIndex={won ? 0 : -1}
          onClick={() => {
            oceanAudio.ui(false)
            setWon(false)
          }}
        >
          Tiếp tục thám hiểm
        </button>
        <button
          className="btn"
          tabIndex={won ? 0 : -1}
          onClick={() => {
            setWon(false)
            useExperienceStore.getState().setLogbook(true)
          }}
        >
          Xem album
        </button>
      </div>
    </section>
  )
}
