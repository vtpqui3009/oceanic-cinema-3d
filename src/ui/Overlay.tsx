import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { CHAPTERS, STAGE_P, depthFromP, dive } from '../lib/dive'
import { TOTAL_DISCOVERIES } from '../lib/discoveries'
import { useSceneStore } from '../state/useSceneStore'
import { useExperienceStore } from '../state/useExperienceStore'
import { oceanAudio } from '../audio/OceanAudio'
import { useGameStore } from '../game/useGameStore'
import { HULL } from '../game/world'

gsap.registerPlugin(ScrollToPlugin)

/** Scroll track: its height sets how long the dive takes. */
export function DiveTrack() {
  return <div className="dive" aria-hidden="true" />
}

/** Glide the page to a point of the dive (0…1). */
export function diveTo(p: number) {
  const reduced = useSceneStore.getState().reducedMotion
  const max = document.documentElement.scrollHeight - window.innerHeight
  const y = Math.max(0, Math.min(1, p)) * max
  const dist = Math.abs(window.scrollY - y) / Math.max(max, 1)
  gsap.to(window, { scrollTo: { y, autoKill: true }, duration: reduced ? 0 : 1.2 + dist * 3.5, ease: 'power2.inOut' })
}

export function Overlay() {
  const stage = useSceneStore((s) => s.stage)
  const game = useExperienceStore((s) => s.mode === 'game')
  const intro = useSceneStore((s) => s.intro) && !game
  const found = useExperienceStore((s) => s.found.length)
  const c = CHAPTERS[stage]
  return (
    <>
      <section className={`intro ${intro ? '' : 'intro--gone'}`} aria-hidden={!intro}>
        <p className="intro__eyebrow">Một thước phim tài liệu 3D</p>
        <h1 className="intro__title">Abyssal Light</h1>
        <p className="intro__sub">
          Bốn tầng ánh sáng, {TOTAL_DISCOVERIES} sinh vật đang chờ được gặp. Cuộn để lặn, chạm vào sinh vật để tìm hiểu.
        </p>
        <span className="intro__cue" />
      </section>

      <article className={`chapter ${intro || game ? 'chapter--hidden' : ''}`} key={stage} aria-live="polite">
        <p className="chapter__zone">
          {c.numeral} — {c.zone} · <span className="nowrap">{c.range}</span>
        </p>
        <h2 className="chapter__name">{c.creature}</h2>
        <p className="chapter__latin">{c.latin}</p>
        <p className="chapter__line">{c.line}</p>
        {found < 3 && (
          <p className="chapter__hint">
            <span className="chapter__hint-dot" aria-hidden="true" />
            Chạm vào những vòng sáng để khám phá sinh vật · chạm vào nước để thấy phù du phát quang
          </p>
        )}
      </article>

      <DepthGauge game={game} />
      {!game && <EndCard />}
    </>
  )
}

const TICKS = [0, 50, 200, 500, 1000, 2000]
/** Log-ish depth scale so the busy upper ocean isn't squashed. */
const scale = (m: number) => Math.log10(1 + m / 20) / Math.log10(1 + 2400 / 20)

// water temperature by depth (typical tropical profile, °C)
const TEMP: [number, number][] = [[0, 27], [50, 25], [200, 16], [500, 8], [1000, 4.5], [2400, 2.5]]
function temperature(d: number) {
  for (let i = 0; i < TEMP.length - 1; i++) {
    const [d0, t0] = TEMP[i], [d1, t1] = TEMP[i + 1]
    if (d <= d1) return t0 + ((t1 - t0) * (d - d0)) / (d1 - d0)
  }
  return TEMP[TEMP.length - 1][1]
}
/** Share of surface sunlight left (clear ocean water: ~1 % at 200 m). */
function sunlight(d: number) {
  const pct = 100 * Math.exp(-d / 43.4)
  if (pct >= 1) return `${Math.round(pct)} %`
  if (pct >= 0.01) return `${pct.toFixed(2).replace('.', ',')} %`
  return '0 %'
}

function DepthGauge({ game }: { game: boolean }) {
  const hull = useGameStore((s) => s.hull)
  const marker = useRef<HTMLDivElement>(null!)
  const value = useRef<HTMLSpanElement>(null!)
  const pressure = useRef<HTMLElement>(null!)
  const temp = useRef<HTMLElement>(null!)
  const light = useRef<HTMLElement>(null!)
  const stage = useSceneStore((s) => s.stage)

  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      const m = Math.round(dive.depth)
      if (m !== last) {
        last = m
        // transform + textContent only: no layout work per frame
        marker.current.style.transform = `translateY(${scale(m) * 100}cqh)`
        value.current.textContent = `−${m.toLocaleString('vi-VN')} m`
        pressure.current.textContent = `${Math.round(1 + m / 10).toLocaleString('vi-VN')} atm`
        temp.current.textContent = `${temperature(m).toFixed(1).replace('.', ',')} °C`
        light.current.textContent = sunlight(m)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="gauge">
      <div className="gauge__track" aria-hidden="true">
        {TICKS.map((t) => (
          <span key={t} className="gauge__tick" style={{ top: `${scale(t) * 100}%` }}>
            {t.toLocaleString('vi-VN')}
          </span>
        ))}
        <div className="gauge__marker" ref={marker}>
          <span className="gauge__value" ref={value} />
        </div>
      </div>
      <nav className="gauge__nav" aria-label="Các vùng biển">
        {CHAPTERS.map((ch, i) => (
          <button
            key={ch.numeral}
            className={`gauge__stop ${stage === i ? 'gauge__stop--on' : ''} ${game && i > HULL[hull].maxZone ? 'gauge__stop--locked' : ''}`}
            style={{ top: `${scale(depthFromP(STAGE_P[i])) * 100}%` }}
            // explore mode: stops are a map (you get there by submarine)
            disabled={game}
            onClick={() => {
              oceanAudio.ui(true)
              diveTo(STAGE_P[i])
            }}
            aria-label={game ? ch.zone : `Lặn tới ${ch.zone}`}
            aria-current={stage === i ? 'true' : undefined}
          >
            <span className="gauge__stop-label">
              {ch.numeral} · {ch.zone}
              {game && i > HULL[hull].maxZone ? ' · 🔒' : ''}
            </span>
          </button>
        ))}
      </nav>
      <dl className="gauge__readout">
        <div>
          <dt>Áp suất</dt>
          <dd ref={pressure} />
        </div>
        <div>
          <dt>Nhiệt độ</dt>
          <dd ref={temp} />
        </div>
        <div>
          <dt>Ánh nắng</dt>
          <dd ref={light} />
        </div>
      </dl>
    </div>
  )
}

function EndCard() {
  const ending = useExperienceStore((s) => s.ending)
  const started = useExperienceStore((s) => s.started)
  const found = useExperienceStore((s) => s.found.length)
  const setLogbook = useExperienceStore((s) => s.setLogbook)
  const left = TOTAL_DISCOVERIES - found
  const show = ending && started
  return (
    <section className={`endcard ${show ? 'endcard--on' : ''}`} aria-hidden={!show}>
      <p className="endcard__eyebrow">Đáy vực · −2 400 m</p>
      <h2 className="endcard__title">Bạn đã lặn tới nơi ánh mặt trời chưa từng chạm tới.</h2>
      <p className="endcard__stat">
        Đã gặp <strong>{found}</strong> / {TOTAL_DISCOVERIES} loài
        {left > 0 ? ` · còn ${left} loài đang ẩn mình trên đường bạn vừa đi qua` : ' · bạn đã gặp tất cả'}
      </p>
      <div className="endcard__actions">
        <button
          className="btn btn--primary"
          tabIndex={show ? 0 : -1}
          onClick={() => {
            oceanAudio.bubbles(6)
            diveTo(0)
          }}
        >
          Lặn lại từ đầu
        </button>
        <button className="btn" tabIndex={show ? 0 : -1} onClick={() => setLogbook(true)}>
          Mở nhật ký lặn
        </button>
      </div>
    </section>
  )
}
