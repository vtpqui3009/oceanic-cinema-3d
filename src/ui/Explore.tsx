import { useEffect, useRef } from 'react'
import { oceanAudio } from '../audio/OceanAudio'
import { CHAPTERS, STAGE_P } from '../lib/dive'
import { DISCOVERIES, DISCOVERY_BY_ID, TOTAL_DISCOVERIES } from '../lib/discoveries'
import { cursorEl, hotspotEls } from '../interaction/domRefs'
import { useExperienceStore } from '../state/useExperienceStore'
import { useSceneStore } from '../state/useSceneStore'
import { diveTo } from './Overlay'

const ZONE_NAMES = ['Nước cạn', 'Chạng vạng', 'Nửa tối', 'Vực thẳm']

/** Top-left: sound + logbook. */
export function TopBar() {
  const started = useExperienceStore((s) => s.started)
  const sound = useExperienceStore((s) => s.sound)
  const setSound = useExperienceStore((s) => s.setSound)
  const found = useExperienceStore((s) => s.found.length)
  const setLogbook = useExperienceStore((s) => s.setLogbook)
  const logbook = useExperienceStore((s) => s.logbook)
  const pulse = useRef<HTMLSpanElement>(null)

  // a little pop on the counter whenever something new is found
  useEffect(() => {
    const el = pulse.current
    if (!el || found === 0) return
    el.classList.remove('topbar__count--pop')
    void el.offsetWidth
    el.classList.add('topbar__count--pop')
  }, [found])

  if (!started) return null
  return (
    <div className="topbar">
      <button
        className={`sound ${sound ? 'sound--on' : ''}`}
        onClick={() => {
          // start() must run inside the click (browsers' autoplay rule)
          if (sound) oceanAudio.setMuted(true)
          else oceanAudio.start()
          setSound(!sound)
        }}
        aria-pressed={sound}
        aria-label={sound ? 'Tắt âm thanh' : 'Bật âm thanh'}
      >
        <span className="sound__bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="sound__label">{sound ? 'Âm thanh' : 'Tắt tiếng'}</span>
      </button>
      <button className="logbtn" onClick={() => { oceanAudio.ui(!logbook); setLogbook(!logbook) }} aria-expanded={logbook}>
        Nhật ký lặn{' '}
        <span className="topbar__count" ref={pulse}>
          {found}/{TOTAL_DISCOVERIES}
        </span>
      </button>
    </div>
  )
}

/** The creature card. */
export function DiscoveryCard() {
  const open = useExperienceStore((s) => s.open)
  const found = useExperienceStore((s) => s.found)
  const setOpen = useExperienceStore((s) => s.setOpen)
  const stage = useSceneStore((s) => s.stage)
  // keep showing the last creature while the card fades out
  const shown = useRef(open)
  if (open) shown.current = open
  const d = shown.current ? DISCOVERY_BY_ID[shown.current] : null
  const index = shown.current ? found.indexOf(shown.current) + 1 : 0
  const lastStage = useRef(stage)

  // close when the viewer dives on to another zone, or presses Esc
  useEffect(() => {
    if (stage !== lastStage.current) {
      lastStage.current = stage
      if (open) setOpen(null)
    }
  }, [stage, open, setOpen])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  return (
    <aside className={`card ${open ? 'card--on' : ''}`} role="dialog" aria-label={d?.name} aria-hidden={!open}>
      {d && (
        <>
          <button className="card__close" tabIndex={open ? 0 : -1} onClick={() => { oceanAudio.ui(false); setOpen(null) }} aria-label="Đóng">
            ×
          </button>
          <p className="card__eyebrow">
            {d.secret ? 'Loài bí mật' : `Sinh vật ${index}/${TOTAL_DISCOVERIES}`} · {ZONE_NAMES[d.zone]}
          </p>
          <h3 className="card__name">{d.name}</h3>
          <p className="card__latin">{d.latin}</p>
          <p className="card__depth">
            <span>Độ sâu sinh sống</span> {d.depth}
          </p>
          <ul className="card__facts">
            {d.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {found.length < TOTAL_DISCOVERIES && (
            <p className="card__next">Còn {TOTAL_DISCOVERIES - found.length} loài nữa đang chờ bạn.</p>
          )}
        </>
      )}
    </aside>
  )
}

/** The dive log: every species, found or still hidden. */
export function Logbook() {
  const logbook = useExperienceStore((s) => s.logbook)
  const found = useExperienceStore((s) => s.found)
  const setLogbook = useExperienceStore((s) => s.setLogbook)
  const setOpen = useExperienceStore((s) => s.setOpen)
  const reset = useExperienceStore((s) => s.reset)
  const complete = found.length === TOTAL_DISCOVERIES

  useEffect(() => {
    if (!logbook) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLogbook(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [logbook, setLogbook])

  return (
    <section className={`logbook ${logbook ? 'logbook--on' : ''}`} role="dialog" aria-label="Nhật ký lặn" aria-hidden={!logbook}>
      {logbook && (
        <div className="logbook__inner">
          <header className="logbook__head">
            <div>
              <p className="logbook__eyebrow">Nhật ký lặn</p>
              <h3 className="logbook__title">
                {complete ? 'Nhà thám hiểm đại dương' : `${found.length} / ${TOTAL_DISCOVERIES} loài đã gặp`}
              </h3>
            </div>
            <button className="card__close" onClick={() => setLogbook(false)} aria-label="Đóng nhật ký">
              ×
            </button>
          </header>
          <div className="logbook__bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${found.length / TOTAL_DISCOVERIES})` }} />
          </div>
          {complete && <p className="logbook__badge">Bạn đã gặp mọi sinh vật của chuyến lặn này. Đại dương vẫn còn hơn 80 % chưa được con người khám phá.</p>}
          <ul className="logbook__grid">
            {DISCOVERIES.map((d) => {
              const has = found.includes(d.id)
              return (
                <li key={d.id}>
                  <button
                    className={`entry ${has ? 'entry--found' : ''}`}
                    onClick={() => {
                      if (has) setOpen(d.id)
                      else if (!d.secret) {
                        setLogbook(false)
                        diveTo(STAGE_P[d.zone])
                      }
                    }}
                  >
                    <span className="entry__zone">{CHAPTERS[d.zone].numeral}</span>
                    <span className="entry__name">{has ? d.name : '???'}</span>
                    <span className="entry__sub">{has ? d.latin : d.hint}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {found.length > 0 && (
            <button className="logbook__reset" onClick={reset}>
              Xoá nhật ký và khám phá lại
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** Hint rings + the custom cursor, positioned by the render loop. */
export function WorldMarkers() {
  const hover = useExperienceStore((s) => s.hover)
  const started = useExperienceStore((s) => s.started)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
  }, [hover])
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="hotspot" ref={(el) => void (hotspotEls[i] = el)} style={{ opacity: 0 }} aria-hidden="true">
          <span className="hotspot__ring" />
        </div>
      ))}
      {started && (
        <div className={`cursor ${hover ? 'cursor--hover' : ''}`} ref={(el) => void (cursorEl.current = el)} style={{ opacity: 0 }} aria-hidden="true">
          <span className="cursor__ring" />
          <span className="cursor__label">{hover ? `Khám phá · ${DISCOVERY_BY_ID[hover].name}` : ''}</span>
        </div>
      )}
    </>
  )
}
