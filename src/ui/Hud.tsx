import { CREATURES } from '../lib/models'
import { useSceneStore } from '../state/useSceneStore'

export function Hud() {
  const lights = useSceneStore((s) => s.lights)
  const toggle = useSceneStore((s) => s.toggleLight)
  const autoRotate = useSceneStore((s) => s.autoRotate)
  const setAutoRotate = useSceneStore((s) => s.setAutoRotate)
  const quality = useSceneStore((s) => s.quality)
  const c = CREATURES.anglerfish

  return (
    <>
      <div className="letterbox letterbox--top" />
      <div className="letterbox letterbox--bottom" />
      <header className="title">
        <p className="title__chapter">IV — Vực thẳm · 1 000 m+</p>
        <h1 className="title__name">{c.label}</h1>
        <p className="title__latin">{c.latin}</p>
        <p className="title__line">Ở độ sâu này, ánh sáng duy nhất là chiếc “đèn” sinh học nó tự mang theo.</p>
      </header>
      <aside className="panel" aria-label="Bảng duyệt ánh sáng">
        <p className="panel__title">Duyệt ánh sáng · bước 1</p>
        <Toggle label="Key — đèn mồi (luôn bật)" on disabled />
        <Toggle label="Fill — xanh lạnh" on={lights.fill} onClick={() => toggle('fill')} />
        <Toggle label="Rim — viền ngược sáng" on={lights.rim} onClick={() => toggle('rim')} />
        <Toggle label="Contact shadows" on={lights.contact} onClick={() => toggle('contact')} />
        <Toggle label="Tự xoay camera" on={autoRotate} onClick={() => setAutoRotate(!autoRotate)} />
        <p className="panel__hint">Kéo để xoay · cuộn để zoom · chất lượng: {quality}</p>
      </aside>
    </>
  )
}

function Toggle({ label, on, onClick, disabled }: { label: string; on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button className={`toggle ${on ? 'toggle--on' : ''}`} onClick={onClick} disabled={disabled} aria-pressed={on}>
      <span className="toggle__dot" />
      {label}
    </button>
  )
}
