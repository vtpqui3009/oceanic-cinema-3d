import { useEffect, useRef, useState } from 'react'
import { useExperienceStore } from '../state/useExperienceStore'
import { isTouch } from './PlayerController'
import { input } from './useGameStore'

const JOY_R = 52

/**
 * Phones and tablets: a floating joystick (touch anywhere on the left),
 * drag on the right to look, and thumb buttons for up / down / zoom /
 * sonar / shutter. Pointer events on one layer with `touch-action: none`;
 * everything writes straight into the shared `input` object.
 */
export function TouchControls() {
  const mode = useExperienceStore((s) => s.mode)
  const started = useExperienceStore((s) => s.started)
  const [touch, setTouch] = useState(isTouch)
  useEffect(() => {
    // a touch screen laptop may only reveal itself on first touch
    const on = (e: PointerEvent) => e.pointerType === 'touch' && setTouch(true)
    window.addEventListener('pointerdown', on, { passive: true })
    return () => window.removeEventListener('pointerdown', on)
  }, [])
  if (mode !== 'game' || !started || !touch) return null
  return <Controls />
}

function Controls() {
  const base = useRef<HTMLDivElement>(null!)
  const knob = useRef<HTMLDivElement>(null!)
  const [zoom, setZoom] = useState(false)
  const st = useRef({ joy: -1, ox: 0, oy: 0, look: -1, lx: 0, ly: 0 })
  const logbook = useExperienceStore((s) => s.logbook)

  useEffect(
    () => () => {
      Object.assign(input, { joyX: 0, joyY: 0, btnUp: false, btnDown: false, zoomToggle: false })
    },
    [],
  )

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button')) return
    const s = st.current
    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.clientX < window.innerWidth * 0.45 && s.joy < 0) {
      s.joy = e.pointerId
      s.ox = e.clientX
      s.oy = e.clientY
      base.current.style.transform = `translate3d(${s.ox}px, ${s.oy}px, 0)`
      base.current.style.opacity = '1'
      knob.current.style.transform = 'translate3d(0, 0, 0)'
    } else if (s.look < 0) {
      s.look = e.pointerId
      s.lx = e.clientX
      s.ly = e.clientY
    }
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current
    if (e.pointerId === s.joy) {
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy
      const l = Math.hypot(dx, dy)
      if (l > JOY_R) {
        dx *= JOY_R / l
        dy *= JOY_R / l
      }
      knob.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      input.joyX = dx / JOY_R
      input.joyY = dy / JOY_R
    } else if (e.pointerId === s.look) {
      input.lookX += (e.clientX - s.lx) * 1.3
      input.lookY += (e.clientY - s.ly) * 1.3
      s.lx = e.clientX
      s.ly = e.clientY
    }
  }
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = st.current
    if (e.pointerId === s.joy) {
      s.joy = -1
      input.joyX = input.joyY = 0
      base.current.style.opacity = '0'
    } else if (e.pointerId === s.look) s.look = -1
  }
  const hold = (key: 'btnUp' | 'btnDown') => ({
    onPointerDown: () => void (input[key] = true),
    onPointerUp: () => void (input[key] = false),
    onPointerCancel: () => void (input[key] = false),
    onPointerLeave: () => void (input[key] = false),
  })

  return (
    <div className={`touch ${logbook ? 'touch--off' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="joy" ref={base} style={{ opacity: 0 }} aria-hidden="true">
        <div className="joy__knob" ref={knob} />
      </div>
      <div className="touch__col">
        <button className="tbtn" aria-label="Bơi lên" {...hold('btnUp')}>
          ▲
        </button>
        <button className="tbtn" aria-label="Lặn xuống" {...hold('btnDown')}>
          ▼
        </button>
      </div>
      <div className="touch__shoot">
        <button
          className={`tbtn tbtn--small ${zoom ? 'tbtn--on' : ''}`}
          aria-label="Zoom"
          aria-pressed={zoom}
          onPointerDown={() => {
            input.zoomToggle = !input.zoomToggle
            setZoom(input.zoomToggle)
          }}
        >
          🔍
        </button>
        <button className="shutter" aria-label="Chụp ảnh" onPointerDown={() => void (input.shoot = true)}>
          <i />
        </button>
      </div>
    </div>
  )
}
