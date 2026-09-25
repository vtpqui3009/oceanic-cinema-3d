import { useEffect, useRef } from 'react'
import { CHAPTERS, dive } from '../lib/dive'
import { useSceneStore } from '../state/useSceneStore'

/** Scroll track: its height sets how long the dive takes. */
export function DiveTrack() {
  return <div className="dive" aria-hidden="true" />
}

export function Overlay() {
  const stage = useSceneStore((s) => s.stage)
  const intro = useSceneStore((s) => s.intro)
  const c = CHAPTERS[stage]
  return (
    <>

      <section className={`intro ${intro ? '' : 'intro--gone'}`} aria-hidden={!intro}>
        <p className="intro__eyebrow">Một thước phim tài liệu 3D</p>
        <h1 className="intro__title">Abyssal Light</h1>
        <p className="intro__sub">Bốn sinh vật, bốn tầng ánh sáng. Cuộn xuống để lặn.</p>
        <span className="intro__cue" />
      </section>

      <article className={`chapter ${intro ? 'chapter--hidden' : ''}`} key={stage} aria-live="polite">
        <p className="chapter__zone">
          {c.numeral} — {c.zone} · <span className="nowrap">{c.range}</span>
        </p>
        <h2 className="chapter__name">{c.creature}</h2>
        <p className="chapter__latin">{c.latin}</p>
        <p className="chapter__line">{c.line}</p>
      </article>

      <DepthGauge />
    </>
  )
}

const TICKS = [0, 50, 200, 500, 1000, 2000]
/** Log-ish depth scale so the busy upper ocean isn't squashed. */
const scale = (m: number) => Math.log10(1 + m / 20) / Math.log10(1 + 2400 / 20)

function DepthGauge() {
  const marker = useRef<HTMLDivElement>(null!)
  const value = useRef<HTMLSpanElement>(null!)
  useEffect(() => {
    let raf = 0
    let last = -1
    const tick = () => {
      const m = Math.round(dive.depth)
      if (m !== last) {
        last = m
        marker.current.style.transform = `translateY(${scale(m) * 100}cqh)`
        value.current.textContent = `−${m.toLocaleString('vi-VN')} m`
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="gauge" aria-hidden="true">
      <div className="gauge__track">
        {TICKS.map((t) => (
          <span key={t} className="gauge__tick" style={{ top: `${scale(t) * 100}%` }}>
            {t.toLocaleString('vi-VN')}
          </span>
        ))}
        <div className="gauge__marker" ref={marker}>
          <span className="gauge__value" ref={value} />
        </div>
      </div>
    </div>
  )
}
