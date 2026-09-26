import { useEffect, useRef } from 'react'
import { oceanAudio } from '../audio/OceanAudio'
import { CHAPTERS, STAGE_P } from '../lib/dive'
import { DISCOVERIES, DISCOVERY_BY_ID, TOTAL_DISCOVERIES } from '../lib/discoveries'
import { cursorEl, hotspotEls } from '../interaction/domRefs'
import { useExperienceStore } from '../state/useExperienceStore'
import { useSceneStore } from '../state/useSceneStore'
import { diveTo } from './Overlay'
import { toggleAlbum } from '../game/PlayerController'
import { totalStars, useGameStore } from '../game/useGameStore'
import type { Photo } from '../game/useGameStore'

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n)

const ZONE_NAMES = ['Nước cạn', 'Chạng vạng', 'Nửa tối', 'Vực thẳm']

/** Top-left: sound + logbook. */
export function TopBar() {
  const started = useExperienceStore((s) => s.started)
  const sound = useExperienceStore((s) => s.sound)
  const setSound = useExperienceStore((s) => s.setSound)
  const found = useExperienceStore((s) => s.found.length)
  const setLogbook = useExperienceStore((s) => s.setLogbook)
  const logbook = useExperienceStore((s) => s.logbook)
  const mode = useExperienceStore((s) => s.mode)
  const setMode = useExperienceStore((s) => s.setMode)
  const photos = useGameStore((s) => s.photos)
  const game = mode === 'game'
  const shot = Object.keys(photos).length
  const pulse = useRef<HTMLSpanElement>(null)
  const count = game ? shot : found

  // a little pop on the counter whenever something new is found
  useEffect(() => {
    const el = pulse.current
    if (!el || count === 0) return
    el.classList.remove('topbar__count--pop')
    void el.offsetWidth
    el.classList.add('topbar__count--pop')
  }, [count])

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
      <button
        className="logbtn"
        onClick={() => {
          if (game) toggleAlbum()
          else {
            oceanAudio.ui(!logbook)
            setLogbook(!logbook)
          }
        }}
        aria-expanded={logbook}
      >
        {game ? 'Album ảnh' : 'Nhật ký lặn'}{' '}
        <span className="topbar__count" ref={pulse}>
          {count}/{TOTAL_DISCOVERIES}
        </span>
        {game && <span className="topbar__stars">{totalStars(photos)} ★</span>}
      </button>
      <button
        className="logbtn modebtn"
        onClick={() => {
          oceanAudio.ui(true)
          if (document.pointerLockElement) document.exitPointerLock()
          window.scrollTo(0, 0)
          setMode(game ? 'film' : 'game')
        }}
        title={game ? 'Chuyển sang xem phim tài liệu' : 'Chuyển sang chế độ thám hiểm, chụp ảnh'}
      >
        {game ? 'Xem phim' : 'Thám hiểm'}
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
  const game = useExperienceStore((s) => s.mode === 'game')
  const photos = useGameStore((s) => s.photos)
  // keep showing the last creature while the card fades out
  const shown = useRef(open)
  if (open) shown.current = open
  const d = shown.current ? DISCOVERY_BY_ID[shown.current] : null
  const index = shown.current ? found.indexOf(shown.current) + 1 : 0
  const photo: Photo | undefined = game && shown.current ? photos[shown.current] : undefined
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
          {photo && (
            <figure className="card__photo">
              {photo.img ? <img src={photo.img} alt={`Ảnh chụp ${d.name}`} /> : <span className="card__nophoto" />}
              <figcaption>{starText(photo.stars)}</figcaption>
            </figure>
          )}
          <p className="card__eyebrow">
            {d.secret ? 'Loài bí mật' : game ? 'Album ảnh' : `Sinh vật ${index}/${TOTAL_DISCOVERIES}`} · {ZONE_NAMES[d.zone]}
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
          {game ? (
            photo &&
            photo.stars < 3 && <p className="card__next">Mẹo: đưa sinh vật vào giữa khung, đủ gần và giữ tàu yên để được 3 ★.</p>
          ) : (
            found.length < TOTAL_DISCOVERIES && <p className="card__next">Còn {TOTAL_DISCOVERIES - found.length} loài nữa đang chờ bạn.</p>
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
  const game = useExperienceStore((s) => s.mode === 'game')
  const photos = useGameStore((s) => s.photos)
  const resetAlbum = useGameStore((s) => s.resetAlbum)
  const n = game ? Object.keys(photos).length : found.length
  const complete = n === TOTAL_DISCOVERIES

  useEffect(() => {
    if (!logbook) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLogbook(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [logbook, setLogbook])

  return (
    <section
      className={`logbook ${logbook ? 'logbook--on' : ''} ${game ? 'logbook--album' : ''}`}
      role="dialog"
      aria-label={game ? 'Album ảnh' : 'Nhật ký lặn'}
      aria-hidden={!logbook}
    >
      {logbook && (
        <div className="logbook__inner">
          <header className="logbook__head">
            <div>
              <p className="logbook__eyebrow">{game ? `Album ảnh · ${totalStars(photos)} / ${TOTAL_DISCOVERIES * 3} ★` : 'Nhật ký lặn'}</p>
              <h3 className="logbook__title">
                {complete
                  ? game
                    ? 'Nhiếp ảnh gia biển sâu'
                    : 'Nhà thám hiểm đại dương'
                  : `${n} / ${TOTAL_DISCOVERIES} loài ${game ? 'đã chụp' : 'đã gặp'}`}
              </h3>
            </div>
            <button className="card__close" onClick={() => setLogbook(false)} aria-label="Đóng nhật ký">
              ×
            </button>
          </header>
          <div className="logbook__bar" aria-hidden="true">
            <i style={{ transform: `scaleX(${n / TOTAL_DISCOVERIES})` }} />
          </div>
          {complete && !game && <p className="logbook__badge">Bạn đã gặp mọi sinh vật của chuyến lặn này. Đại dương vẫn còn hơn 80 % chưa được con người khám phá.</p>}
          <ul className="logbook__grid">
            {DISCOVERIES.map((d) => {
              const photo = game ? photos[d.id] : undefined
              const has = game ? !!photo : found.includes(d.id)
              return (
                <li key={d.id}>
                  <button
                    className={`entry ${has ? 'entry--found' : ''} ${photo ? 'entry--photo' : ''}`}
                    onClick={() => {
                      if (has) setOpen(d.id)
                      else if (!d.secret && !game) {
                        setLogbook(false)
                        diveTo(STAGE_P[d.zone])
                      }
                    }}
                  >
                    {photo?.img && <img className="entry__img" src={photo.img} alt="" />}
                    {photo && <span className="entry__stars">{starText(photo.stars)}</span>}
                    <span className="entry__zone">{CHAPTERS[d.zone].numeral}</span>
                    <span className="entry__name">{has ? d.name : '???'}</span>
                    <span className="entry__sub">{has ? d.latin : d.hint}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {n > 0 && (
            <button className="logbook__reset" onClick={game ? resetAlbum : reset}>
              {game ? 'Xoá album và chụp lại từ đầu' : 'Xoá nhật ký và khám phá lại'}
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
  const started = useExperienceStore((s) => s.started && s.mode === 'film')
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
