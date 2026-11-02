import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { appStatusLabel, initial, TARGET_DAYS, TARGET_TESTERS, testerStatusLabel } from '../lib/progress'
import { BADGE_LABELS, BADGE_MIN, nextTier } from '../lib/badges'
import type { AppStatus, BadgeTier, TesterDoc } from '../lib/types'

/** Google photo inside an ink circle; otherwise the initial on white (no generated colours, ADR-001 §2.6). */
export function Avatar({ name, photo, size }: { name: string; photo?: string | null; id?: string; size?: 'lg' }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className={`avatar ${size ?? ''}`} aria-hidden="true">
      {photo && !broken ? <img src={photo} alt="" width={size === 'lg' ? 64 : 32} height={size === 'lg' ? 64 : 32} onError={() => setBroken(true)} referrerPolicy="no-referrer" /> : initial(name)}
    </span>
  )
}

// ---------- status chips: square, ink border, one status fill, glyph + uppercase text ----------
type Tone = 'pandan' | 'langit' | 'cabai' | 'soft' | 'putih'

export function Chip({ tone = 'putih', glyph, children, className }: { tone?: Tone; glyph: string; children: ReactNode; className?: string }) {
  return (
    <span className={`chip ${tone} ${className ?? ''}`}>
      <span className="g" aria-hidden="true">{glyph}</span>{children}
    </span>
  )
}

/** App status. Mencari tester = needs attention (white + "!"), Sedang diuji = in progress (langit),
 *  Ajukan produksi / Rilis produksi = done (pandan, ✓ / ✓✓). */
const APP_TONE: Record<AppStatus, [Tone, string]> = {
  recruiting: ['putih', '!'],
  testing: ['langit', '→'],
  applied: ['pandan', '✓'],
  live: ['pandan', '✓✓'],
}
export const StatusPill = ({ status }: { status: AppStatus }) => (
  <Chip tone={APP_TONE[status][0]} glyph={APP_TONE[status][1]}>{appStatusLabel[status]}</Chip>
)

/** Tester status: eligible (14+ days) is pandan, active is langit (opted in), the rest stay white. */
export function TesterChip({ t, days }: { t: TesterDoc; days: number }) {
  if (t.status === 'active' && days >= TARGET_DAYS) return <Chip tone="pandan" glyph="✓">Lulus 14 hari</Chip>
  if (t.status === 'active') return <Chip tone="langit" glyph="→">{testerStatusLabel.active}</Chip>
  return <Chip glyph={t.status === 'removed' ? '×' : '—'}>{testerStatusLabel[t.status]}</Chip>
}

/** Feedback state: none / sent / verified (PRD DR-3). */
export function FeedbackChip({ t, className }: { t: Pick<TesterDoc, 'feedbackSent' | 'feedbackVerified'>; className?: string }) {
  if (t.feedbackVerified) return <Chip tone="pandan" glyph="✓✓" className={className}>Terverifikasi</Chip>
  if (t.feedbackSent) return <Chip tone="langit" glyph="✓" className={className}>Terkirim</Chip>
  return <Chip glyph="—" className={className}>Belum</Chip>
}

// ---------- progress: counted cells, not a smooth bar ----------

/** Twelve seats: eligible (≥14 days) pandan, active langit, empty white. */
export function Seats({ active, eligible, label, className }: { active: number; eligible: number; label?: string; className?: string }) {
  return (
    <span className={`seats ${className ?? ''}`} role="img" aria-label={label ?? `${active} dari ${TARGET_TESTERS} tester aktif, ${eligible} sudah 14 hari`}>
      {Array.from({ length: TARGET_TESTERS }, (_, i) => (
        <i key={i} className={i < Math.min(eligible, TARGET_TESTERS) ? 'full' : i < Math.min(active, TARGET_TESTERS) ? 'on' : ''} />
      ))}
    </span>
  )
}

/** A ruled track of `max` cells (12 testers, 14 days, a tier threshold). Langit while counting,
 *  pandan once complete; `tone="ubi"` for badge progress only. Optional tabular "X / max" readout. */
export function Bar({ value, max, label, tone, readout = false }: { value: number; max: number; label: string; tone?: 'ubi'; readout?: boolean }) {
  const v = Math.max(0, Math.min(value, max))
  const done = v >= max
  const segmented = max <= 30
  return (
    <div className="meter">
      <div
        className={`cells ${segmented ? '' : 'solid'} ${done && tone !== 'ubi' ? 'done' : ''} ${tone ?? ''}`}
        style={{ ['--n' as string]: segmented ? max : 1 }}
        role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={v} aria-valuetext={`${v} dari ${max}`}
      >
        {segmented
          ? Array.from({ length: max }, (_, i) => <i key={i} className={i < v ? 'on' : ''} />)
          : <i style={{ width: `${(v / max) * 100}%` }} />}
      </div>
      {readout && <span className="meter-readout num" aria-hidden="true">{v}<small> / {max}</small></span>}
    </div>
  )
}

/** Typographic rank mark per tier: the order reads without colour (PRD DR-3, no medal icons). */
const BADGE_MARK: Record<Exclude<BadgeTier, 'none'>, string> = { bronze: 'I', silver: 'II', gold: 'III', platinum: 'IV' }

/** Reciprocity badge (PRD FR-27g–l): pill, ink border, tier fill from --tier-*, tier name in text. */
export function Badge({ tier, size }: { tier: BadgeTier | undefined; size?: 'sm' }) {
  if (!tier || tier === 'none') return null
  const label = BADGE_LABELS[tier]
  return (
    <span className={`badge ${tier} ${size ?? ''}`} title={`Badge ${label}: ${BADGE_MIN[tier]}+ aplikasi diuji 14 hari`}>
      <span className="badge-mark" aria-hidden="true">{BADGE_MARK[tier]}</span>
      <span className="sr-only">Badge </span>{label}
    </span>
  )
}

/** Progress from the apps-tested count to the next tier threshold (FR-27k). */
export function TierProgress({ count, tier, nextAt }: { count: number; tier: BadgeTier; nextAt: number | null }) {
  const next = nextTier(tier)
  if (!next || nextAt === null) {
    return <p className="small muted" style={{ marginTop: 'var(--s-2)' }}>{count} aplikasi diuji 14+ hari. Platinum adalah tingkat tertinggi.</p>
  }
  const label = BADGE_LABELS[next]
  return (
    <div className="tier-progress">
      <Bar value={Math.min(count, nextAt)} max={nextAt} label={`Progres menuju badge ${label}`} tone="ubi" />
      <p className="small muted num"><span className="tier-count">{count} / {nextAt}</span> aplikasi menuju {label}</p>
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
      <span className="g" aria-hidden="true">!</span>
      <span>{text}</span>
      {onRetry && <button type="button" className="text-action" onClick={onRetry}>Coba lagi</button>}
    </div>
  )
}

/** Designed empty state. ADR-001 §2.6 wants a spot illustration here (empty tester list, empty
 *  Tugas saya, 404); add it once the asset pipeline exists, via the `art` slot. */
export function Empty({ title, children, art }: { title: string; children?: ReactNode; art?: ReactNode }) {
  return (
    <div className="empty">
      {art}
      <p className="t">{title}</p>
      {children}
    </div>
  )
}

export const Skel = ({ w, h = 14 }: { w: number | string; h?: number }) => (
  <span className="skeleton" style={{ width: w, height: h, maxWidth: '100%' }} aria-hidden="true" />
)

export function NotFound({ what }: { what: string }) {
  // ADR-001 §2.6: 404 spot illustration goes above the title when assets exist.
  return (
    <div className="state-page">
      <h1 className="page-title">{what} tidak ditemukan</h1>
      <p>Mungkin sudah dihapus pembuatnya, atau tautannya salah ketik.</p>
      <Link className="btn primary" to="/apps">Kembali ke daftar aplikasi</Link>
    </div>
  )
}

// ---------- toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg({ text: m, key: Date.now() })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 4000)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-region" aria-live="polite">{msg && <div className="toast" key={msg.key}>{msg.text}</div>}</div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
