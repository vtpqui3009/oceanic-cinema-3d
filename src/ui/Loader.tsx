import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useLoadingStore } from '../state/useLoadingStore'
import { labelForUrl } from '../lib/models'

/**
 * Real progress: drei's network loads (models, textures) + procedural builds,
 * showing which creature is currently being prepared.
 */
export function Loader() {
  const { loaded, total, item, active } = useProgress()
  const tasks = useLoadingStore((s) => s.tasks)
  const current = useLoadingStore((s) => s.current)
  const [gone, setGone] = useState(false)

  const taskList = Object.values(tasks)
  const done = loaded + taskList.filter(Boolean).length
  const all = total + taskList.length
  const pct = all === 0 ? 0 : Math.round((done / all) * 100)
  const finished = all > 0 && done === all && !active
  const label = labelForUrl(item) ?? current ?? 'đại dương'

  useEffect(() => {
    if (!finished) return
    const t = setTimeout(() => setGone(true), 1400)
    return () => clearTimeout(t)
  }, [finished])

  if (gone) return null
  return (
    <div className={`loader ${finished ? 'loader--done' : ''}`} role="status" aria-live="polite">
      <div className="loader__inner">
        <p className="loader__eyebrow">Đang lặn xuống</p>
        <p className="loader__label">{finished ? 'Sẵn sàng' : `Đang tải ${label}...`}</p>
        <div className="loader__bar" aria-hidden>
          <div className="loader__fill" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="loader__pct">{pct}%</p>
      </div>
    </div>
  )
}
