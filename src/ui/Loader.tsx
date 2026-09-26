import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useLoadingStore } from '../state/useLoadingStore'
import { useExperienceStore } from '../state/useExperienceStore'
import { labelForUrl } from '../lib/models'
import { TOTAL_DISCOVERIES } from '../lib/discoveries'
import { oceanAudio } from '../audio/OceanAudio'
import { useSceneStore } from '../state/useSceneStore'
import type { Mode } from '../state/useExperienceStore'

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
  const [quiet, setQuiet] = useState(false)

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

  const begin = (mode: Mode) => {
    const sound = !quiet
    oceanAudio.reducedMotion = reduced
    if (sound) oceanAudio.start()
    start(sound, mode)
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
            <div className="gate__modes">
              <button className="mode mode--film" onClick={() => begin('film')} autoFocus>
                <span className="mode__title">Bắt đầu lặn</span>
                <span className="mode__kind">Xem phim tài liệu</span>
                <span className="mode__sub">Cuộn để lặn qua bốn tầng biển, chạm vào sinh vật để tìm hiểu.</span>
              </button>
              <button className="mode mode--game" onClick={() => begin('game')}>
                <span className="mode__title">Thám hiểm</span>
                <span className="mode__kind">Nhiếp ảnh gia biển sâu</span>
                <span className="mode__sub">Tự lái tàu lặn, chụp ảnh {TOTAL_DISCOVERIES} loài, quản lý dưỡng khí và lặn ngày càng sâu.</span>
              </button>
            </div>
            <label className="gate__quiet">
              <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Lặn không âm thanh
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
