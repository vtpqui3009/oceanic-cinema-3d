import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useLoadingStore } from '../state/useLoadingStore'
import { useExperienceStore } from '../state/useExperienceStore'
import { labelForUrl } from '../lib/models'
import { oceanAudio } from '../audio/OceanAudio'
import { useSceneStore } from '../state/useSceneStore'

/**
 * Real progress: drei's network loads (models, textures) + procedural builds
 * and shader pre-compilation, naming what is being prepared. When everything
 * is ready it becomes the start gate: the click that starts the dive is also
 * the user gesture browsers require before any sound may play.
 */
export function Loader() {
  const { loaded, total, item, active } = useProgress()
  const tasks = useLoadingStore((s) => s.tasks)
  // the first job still running (not merely the last one registered)
  const current = useLoadingStore((s) => Object.entries(s.tasks).find(([, done]) => !done)?.[0] ?? null)
  const started = useExperienceStore((s) => s.started)
  const start = useExperienceStore((s) => s.start)
  const reduced = useSceneStore((s) => s.reducedMotion)
  const [gone, setGone] = useState(false)

  const taskList = Object.values(tasks)
  const done = loaded + taskList.filter(Boolean).length
  const all = total + taskList.length
  const pct = all === 0 ? 0 : Math.round((done / all) * 100)
  const finished = all > 0 && done === all && !active
  const label = labelForUrl(item) ?? current ?? 'đại dương'

  useEffect(() => {
    if (!started) return
    const t = setTimeout(() => setGone(true), 1400)
    return () => clearTimeout(t)
  }, [started])

  const begin = (sound: boolean) => {
    oceanAudio.reducedMotion = reduced
    if (sound) oceanAudio.start()
    start(sound)
  }

  if (gone) return null
  return (
    <div className={`loader ${started ? 'loader--done' : ''}`} role="status" aria-live="polite">
      <div className="loader__inner">
        <p className="loader__eyebrow">{finished ? 'Abyssal Light' : 'Đang chuẩn bị chuyến lặn'}</p>
        {!finished ? (
          <>
            <p className="loader__label">{`Đang tải ${label}...`}</p>
            <div className="loader__bar" aria-hidden>
              <div className="loader__fill" style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
            <p className="loader__pct">{pct}%</p>
          </>
        ) : (
          <div className="gate">
            <p className="gate__line">Đeo tai nghe để nghe tiếng đại dương.</p>
            <button className="btn btn--primary btn--big" onClick={() => begin(true)} autoFocus>
              Bắt đầu lặn
            </button>
            <button className="gate__quiet" onClick={() => begin(false)}>
              Lặn không âm thanh
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
