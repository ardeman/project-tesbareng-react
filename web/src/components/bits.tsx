import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { appStatusLabel, appStatusTone, hueFor, initial, TARGET_TESTERS } from '../lib/progress'
import type { AppStatus } from '../lib/types'

export function Avatar({ name, photo, id, size }: { name: string; photo?: string | null; id?: string; size?: 'lg' }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className={`avatar ${size ?? ''}`} style={{ ['--h' as string]: hueFor(id ?? name) }} aria-hidden="true">
      {photo && !broken ? <img src={photo} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer" /> : initial(name)}
    </span>
  )
}

export const StatusPill = ({ status }: { status: AppStatus }) => (
  <span className={`pill ${appStatusTone[status]}`}>{appStatusLabel[status]}</span>
)

/** Twelve seats: eligible (≥14 days) in the full hue, active in the mid tint, empty in grey. */
export function Seats({ active, eligible, label }: { active: number; eligible: number; label?: string }) {
  return (
    <span className="seats" role="img" aria-label={label ?? `${active} dari ${TARGET_TESTERS} tester aktif, ${eligible} sudah 14 hari`}>
      {Array.from({ length: TARGET_TESTERS }, (_, i) => (
        <i key={i} className={i < Math.min(eligible, TARGET_TESTERS) ? 'full' : i < Math.min(active, TARGET_TESTERS) ? 'on' : ''} />
      ))}
    </span>
  )
}

export function Bar({ value, max, label, ends = true }: { value: number; max: number; label: string; ends?: boolean }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        {value > 0 && <i style={{ width: `${pct}%` }} />}
      </div>
      {ends && <div className="bar-ends"><span>0</span><span>{max}</span></div>}
    </div>
  )
}

export function Dialog({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="sheet" aria-label={label} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      {open && children}
    </dialog>
  )
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{text}</span>
      {onRetry && <button className="text-action" onClick={onRetry}>Coba lagi</button>}
    </div>
  )
}

export const Skel = ({ w, h = 14 }: { w: number | string; h?: number }) => (
  <span className="skeleton" style={{ width: w, height: h }} aria-hidden="true" />
)

export function NotFound({ what }: { what: string }) {
  return (
    <div className="stack-16" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 24, lineHeight: '30px', fontWeight: 700 }}>{what} tidak ditemukan</h1>
      <p className="muted">Mungkin sudah dihapus pembuatnya, atau tautannya salah ketik.</p>
      <p><Link className="link" to="/">Kembali ke daftar aplikasi</Link></p>
    </div>
  )
}

// ---------- toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite">{msg && <div className="toast">{msg}</div>}</div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
