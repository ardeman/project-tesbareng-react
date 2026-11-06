import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Chip, Dialog, Empty, ErrorBox, failToast, FeedbackChip, Field, fieldAria, NotFound, Skel, TesterChip, useToast } from '../components/bits'
import { IconSearch } from '../components/icons'
import { useAuth } from '../lib/auth'
import { usePageMeta } from '../lib/pageMeta'
import { errorText, restoreApp, updateTesterAsAdmin, useDeletedApps, useTesterSearch, type ModerationPatch } from '../lib/data'
import { daysActive, fmtDateTime, isoDate, relTime, testerStatusLabel, todayIso } from '../lib/progress'
import type { AdminTesterRow, AppDoc, TesterStatus } from '../lib/types'
import { Cohorts } from './AdminCohorts'

/**
 * Admin (PRD §10 `/admin`, ADR-009). One page, split into sections. Later tasks add cohort sections
 * (create / start / close, WhatsApp reminder panel) by adding an entry to SECTIONS; the section nav
 * appears by itself once there is more than one. Only sections that work today are listed (no placeholders).
 */
interface Section { id: string; label: string; summary: string; render: () => ReactNode }

const SECTIONS: Section[] = [
  {
    id: 'cohort',
    label: 'Cohort',
    summary: 'Bentuk cohort, tambahkan creator dengan aplikasinya, lalu mulai. Pasang link grup WhatsApp dan tandai lunas anggota yang berutang.',
    render: () => <Cohorts />,
  },
  {
    id: 'moderasi',
    label: 'Moderasi',
    summary: 'Pulihkan aplikasi yang terhapus dan rapikan entri tester, termasuk ringkasan feedback yang tidak pantas atau hasil salin-tempel.',
    render: () => <Moderation />,
  },
]

export function Admin() {
  const { user, profile, isAdmin, ready, signIn } = useAuth()
  const toast = useToast()
  // The role arrives after the session: wait for it instead of flashing "not found" at the admin.
  const pending = !ready || (!!user && !profile)
  usePageMeta(pending ? 'Memuat…' : !user ? 'Masuk' : isAdmin ? 'Admin' : 'Halaman tidak ditemukan')

  if (pending) return <PageSkeleton />
  if (!user) {
    // Neutral copy: a signed-out visitor learns nothing about what lives here.
    return (
      <div className="state-page">
        <h1 className="page-title">Masuk untuk melanjutkan</h1>
        <p>Halaman ini hanya bisa dibuka setelah Anda masuk dengan akun Google.</p>
        <button className="btn primary" onClick={() => signIn().catch((e) => toast(errorText(e)))}>Masuk dengan Google</button>
      </div>
    )
  }
  if (!isAdmin) return <NotFound what="Halaman" />
  return <AdminPage />
}

function AdminPage() {
  const params = new URLSearchParams(useLocation().search)
  const current = SECTIONS.find((s) => s.id === params.get('bagian')) ?? SECTIONS[0]
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Admin</h1>
          <p className="sub">{current.summary}</p>
        </div>
      </div>
      {SECTIONS.length > 1 && (
        <nav className="tabs" aria-label="Bagian admin">
          {SECTIONS.map((s) => (
            <Link key={s.id} to={`/admin?bagian=${s.id}`} className="tab" aria-current={s.id === current.id ? 'page' : undefined}>{s.label}</Link>
          ))}
        </nav>
      )}
      <div aria-label={current.label} role="region">{current.render()}</div>
    </>
  )
}

function Moderation() {
  return (
    <div className="grid">
      <DeletedApps />
      <TesterEntries />
    </div>
  )
}

// ---------- deleted apps: restore is not destructive, so no confirm; a toast reports the result ----------

function DeletedApps() {
  const list = useDeletedApps(true)
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [restored, setRestored] = useState<Set<string>>(() => new Set())
  const heading = useRef<HTMLHeadingElement>(null)
  const shown = list.data.filter((a) => !restored.has(a.id))

  const restore = async (a: AppDoc) => {
    if (busy) return
    setBusy(a.id)
    try {
      await restoreApp(a.id)
      setRestored((s) => new Set(s).add(a.id))
      // The row (and its button) disappears: put focus somewhere stable (WCAG 2.4.3).
      heading.current?.focus()
      toast(`${a.name} dipulihkan dan tampil lagi di daftar aplikasi.`)
      list.refresh()
    } catch (e) {
      toast(failToast(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="panel span-12" aria-labelledby="deleted-h">
      <header>
        <h2 id="deleted-h" ref={heading} tabIndex={-1}>Aplikasi terhapus</h2>
        {!list.loading && shown.length > 0 && <span className="meta num">{shown.length} aplikasi</span>}
      </header>
      {list.error ? <ErrorBox text="Daftar aplikasi terhapus gagal dimuat." onRetry={list.retry} /> : list.loading ? <RowsSkeleton /> : shown.length === 0 ? (
        <Empty title="Tidak ada aplikasi terhapus.">
          <p>Aplikasi yang dihapus creator-nya muncul di sini. Creator bisa mengurungkan sendiri dalam 10 menit; setelah itu hanya admin yang bisa memulihkannya.</p>
        </Empty>
      ) : (
        <ul className="deleted-list">
          {shown.map((a) => (
            <li className="row-line" key={a.id}>
              <span className="grow cell-2">
                <Link className="hit" to={`/apps/${a.id}`}><b>{a.name}</b></Link>
                <span>{a.creatorName} · <span className="num">{a.activeTesterCount}</span> tester aktif</span>
                {a.deletedAt != null && (
                  <span>Dihapus <time dateTime={new Date(a.deletedAt).toISOString()}>{relTime(a.deletedAt)}</time><span className="num"> · {fmtDateTime(a.deletedAt)}</span></span>
                )}
              </span>
              <button type="button" className="btn sm" aria-disabled={busy === a.id || undefined} aria-busy={busy === a.id || undefined} onClick={() => restore(a)}>
                {busy === a.id ? 'Memulihkan…' : <>Pulihkan<span className="sr-only"> {a.name}</span></>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---------- tester entries: search, a sheet with a sticky name column, one edit dialog ----------

const MAX_ROWS = 50

function TesterEntries() {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 250)
    return () => window.clearTimeout(t)
  }, [q])
  const res = useTesterSearch(term, true)
  const [editing, setEditing] = useState<AdminTesterRow | null>(null)
  const rows = res.data
  const searching = res.loading || term !== q.trim()

  const status = searching ? 'Mencari…'
    : res.error ? ''
    : rows.length === 0 ? (term ? `Tidak ada entri yang cocok dengan “${term}”.` : '')
    : term
      ? `${rows.length} entri cocok dengan “${term}”${rows.length >= MAX_ROWS ? `. Hanya ${MAX_ROWS} pertama yang tampil; persempit pencarian.` : '.'}`
      : `${rows.length} ringkasan feedback terbaru${rows.length >= MAX_ROWS ? `, ${MAX_ROWS} paling baru yang tampil` : ''}.`

  return (
    <section className="panel flush span-12" aria-labelledby="entries-h">
      <header>
        <h2 id="entries-h">Entri tester</h2>
      </header>
      <div className="admin-search">
        <div className="field">
          <label htmlFor="ts-q">Cari tester</label>
          <span className="search">
            <IconSearch />
            <input id="ts-q" className="input" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={50}
              value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="ts-q-hint ts-q-status" />
          </span>
          <span className="hint" id="ts-q-hint">Nama atau email tersamar, misalnya “bu”. Kosongkan untuk melihat ringkasan feedback terbaru.</span>
        </div>
        <p className="meta num" id="ts-q-status" role="status" aria-live="polite">{status}</p>
      </div>

      {res.error ? (
        <div className="empty-pad"><ErrorBox text="Entri tester gagal dimuat." onRetry={res.retry} /></div>
      ) : !searching && rows.length === 0 ? (
        <div className="empty-pad">
          {term ? (
            <Empty title={`Tidak ada tester dengan nama atau email “${term}”.`}>
              <p>Periksa ejaannya, atau cari bagian nama yang lebih pendek.</p>
              <button type="button" className="text-action" onClick={() => setQ('')}>Hapus pencarian</button>
            </Empty>
          ) : (
            <Empty title="Belum ada ringkasan feedback untuk diperiksa.">
              <p>Ringkasan muncul di sini begitu tester menandai feedback-nya terkirim. Cari nama tester untuk mengubah entri lain.</p>
            </Empty>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap sheet-scroll" tabIndex={0} role="region" aria-labelledby="entries-h">
            <table className="data sheet-table admin-table">
              <thead>
                <tr>
                  <th className="sticky">Tester</th>
                  <th>Aplikasi</th>
                  <th>Status &amp; feedback</th>
                  <th>Ringkasan feedback</th>
                </tr>
              </thead>
              <tbody aria-busy={searching || undefined}>
                {searching
                  ? Array.from({ length: 5 }, (_, i) => (
                      <tr key={i}>
                        <td className="sticky"><Skel w={140} /><br /><Skel w={110} h={12} /></td>
                        <td><Skel w={120} /></td><td><Skel w={110} h={24} /><br /><Skel w={110} h={24} /></td><td><Skel w={260} /></td>
                      </tr>
                    ))
                  : rows.map((t) => <EntryRow key={t.id} t={t} onOpen={() => setEditing(t)} />)}
              </tbody>
            </table>
          </div>
          {!searching && <p className="meta small scroll-hint" style={{ padding: '0 var(--s-3) var(--s-3)' }}>Geser tabel ke samping untuk melihat status dan ringkasan.</p>}
        </>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} label={editing ? `Ubah entri ${editing.displayName}` : 'Ubah entri tester'}>
        {editing && <EntryForm key={editing.id} t={editing} onClose={() => setEditing(null)} onSaved={res.refresh} />}
      </Dialog>
    </section>
  )
}

function EntryRow({ t, onOpen }: { t: AdminTesterRow; onOpen: () => void }) {
  return (
    <tr className="clickable" onClick={onOpen}>
      <td className="sticky">
        {/* The real control for keyboard and screen readers; the row click is a shortcut for the mouse. */}
        <button type="button" className="row-open cell-2" onClick={(e) => { e.stopPropagation(); onOpen() }}>
          <b>{t.displayName}</b>
          <span>{t.maskedEmail}</span>
          <span className="sr-only">, ubah entri</span>
        </button>
      </td>
      <td>
        <span className="app-cell">
          <Link className="name-link hit" to={`/apps/${t.appId}`} onClick={(e) => e.stopPropagation()}><b>{t.appName || 'Aplikasi'}</b></Link>
          {t.appDeleted && <Chip glyph="×">Terhapus</Chip>}
        </span>
      </td>
      <td>
        {/* Two short states stacked, so the summary (what gets moderated) keeps the width on desktop. */}
        <span className="state-cell">
          <TesterChip t={t} days={daysActive(t)} />
          <span><span className="sr-only">Feedback: </span><FeedbackChip t={t} /></span>
        </span>
      </td>
      <td className="summary-cell">{t.feedbackSummary ? <span className="clamp-2">{t.feedbackSummary}</span> : <span className="dash">—</span>}</td>
    </tr>
  )
}

/** Every moderation field in one form (PRD §7: admin edits status, date, note, Verified, Replied and feedback fields). */
function EntryForm({ t, onClose, onSaved }: { t: AdminTesterRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({
    status: t.status,
    optedInAt: isoDate(t.optedInAt),
    note: t.note ?? '',
    sent: t.feedbackSent,
    summary: t.feedbackSummary ?? '',
    verified: t.feedbackVerified,
    replied: t.replied,
  })
  const [showErr, setShowErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dateErr = !f.optedInAt ? 'Pilih tanggal tester opt-in.' : f.optedInAt > todayIso() ? 'Tanggal opt-in tidak boleh di masa depan.' : undefined
  // Turning "sent" off wipes the summary, its time and Verified on the server (updateTesterAsAdmin).
  const wiping = t.feedbackSent && !f.sent
  // Emptying or rewriting the tester's own summary cannot be undone either (ADR-009 §7): say so before saving.
  const oldSummary = (t.feedbackSummary ?? '').trim()
  const summaryEdit = !wiping && f.sent && !!oldSummary && f.summary.trim() !== oldSummary
    ? (f.summary.trim() ? 'replace' : 'clear') : null
  const destructive = wiping || !!summaryEdit

  const patch = (): ModerationPatch => {
    const p: ModerationPatch = {}
    if (f.status !== t.status) p.status = f.status
    if (f.optedInAt !== isoDate(t.optedInAt)) p.optedInAt = f.optedInAt
    if (f.note.trim() !== (t.note ?? '').trim()) p.note = f.note
    if (f.replied !== t.replied) p.replied = f.replied
    if (f.sent !== t.feedbackSent) p.feedbackSent = f.sent
    if (f.sent) {
      if (f.verified !== t.feedbackVerified) p.feedbackVerified = f.verified
      if (f.summary.trim() !== (t.feedbackSummary ?? '').trim()) p.feedbackSummary = f.summary
    }
    return p
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (dateErr) { setShowErr(true); document.getElementById('me-date')?.focus(); return }
    const p = patch()
    if (Object.keys(p).length === 0) { onClose(); return }
    setBusy(true); setErr(null)
    try {
      await updateTesterAsAdmin(t, p)
      toast(wiping ? `Feedback ${t.displayName} di ${t.appName} dihapus.` : `Entri ${t.displayName} di ${t.appName} disimpan.`)
      onSaved()
      onClose()
    } catch (x) {
      setErr(errorText(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <div>
          <h2>{t.displayName}</h2>
          <p className="muted entry-sub">
            <span>{t.maskedEmail}</span>
            <span>di <b>{t.appName || 'aplikasi'}</b></span>
            {t.appDeleted && <Chip glyph="×">Terhapus</Chip>}
          </p>
        </div>

        <fieldset className="fieldset">
          <legend>Keikutsertaan</legend>
          <Field id="me-status" label="Status" hint="Tester yang dikeluarkan tidak bisa gabung lagi ke aplikasi ini.">
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TesterStatus })} {...fieldAria('me-status', { hint: true })}>
              {(['active', 'left', 'removed'] as TesterStatus[]).map((s) => <option key={s} value={s}>{testerStatusLabel[s]}</option>)}
            </select>
          </Field>
          <Field id="me-date" label="Opt-in sejak" hint="Mengubah tanggal ini mengubah hitungan hari aktif." error={showErr ? dateErr : undefined}>
            <input type="date" className="input" max={todayIso()} value={f.optedInAt}
              onChange={(e) => setF({ ...f, optedInAt: e.target.value })} onBlur={() => setShowErr(true)}
              {...fieldAria('me-date', { hint: true, error: showErr ? dateErr : undefined })} />
          </Field>
          <Field id="me-note" label="Catatan" optional hint="Terlihat oleh semua anggota." count={`${f.note.length}/140`}>
            <input className="input" maxLength={140} autoComplete="off" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })}
              {...fieldAria('me-note', { hint: true })} />
          </Field>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Feedback</legend>
          <label className="check">
            <input type="checkbox" checked={f.sent} onChange={(e) => setF({ ...f, sent: e.target.checked })} aria-describedby="me-sent-d" />
            <span><span className="t">Feedback sudah dikirim di Play</span>
              <span className="d" id="me-sent-d">{t.feedbackSentAt ? <>Ditandai tester <span className="num">{fmtDateTime(t.feedbackSentAt)}</span>.</> : 'Biasanya ditandai sendiri oleh tester.'}</span></span>
          </label>
          {wiping && (
            <p className="notice admin-notice" role="status">
              <span className="chip"><span className="g" aria-hidden="true">!</span>Perhatian</span>
              Saat disimpan, ringkasan, waktu kirim dan tanda terverifikasi ikut terhapus dan tidak bisa dikembalikan.
            </p>
          )}
          <Field id="me-summary" label="Ringkasan feedback" optional count={`${f.sent ? f.summary.length : 0}/500`}
            hint={f.sent ? 'Terlihat oleh semua anggota. Kosongkan untuk menghapus ringkasan yang tidak pantas atau hasil salin-tempel.' : 'Hanya bisa diisi jika feedback sudah dikirim.'}>
            <textarea className="input" maxLength={500} disabled={!f.sent} value={f.sent ? f.summary : ''}
              onChange={(e) => setF({ ...f, summary: e.target.value })} {...fieldAria('me-summary', { hint: true })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={f.sent && f.verified} disabled={!f.sent} onChange={(e) => setF({ ...f, verified: e.target.checked })} />
            <span><span className="t">Terverifikasi di Play Console</span><span className="d">Biasanya dicentang creator setelah melihat feedback-nya.</span></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={f.replied} onChange={(e) => setF({ ...f, replied: e.target.checked })} />
            <span><span className="t">Sudah dibalas creator</span><span className="d">Balasan dikirim dari Play Console.</span></span>
          </label>
          {summaryEdit && (
            <p className="notice admin-notice" role="status">
              <span className="chip"><span className="g" aria-hidden="true">!</span>Perhatian</span>
              {summaryEdit === 'clear' ? 'Saat disimpan, ringkasan tulisan tester terhapus' : 'Saat disimpan, ringkasan tulisan tester diganti'} dan tidak bisa dikembalikan.
            </p>
          )}
        </fieldset>

        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>Batal</button>
        <button className={`btn ${destructive ? 'danger' : 'primary'}`} aria-busy={busy || undefined}>
          {busy ? 'Menyimpan…' : wiping ? 'Hapus feedback dan simpan' : summaryEdit === 'clear' ? 'Hapus ringkasan dan simpan' : summaryEdit ? 'Ganti ringkasan dan simpan' : 'Simpan perubahan'}
        </button>
      </div>
    </form>
  )
}

function RowsSkeleton() {
  return <div aria-hidden="true">{[0, 1].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={180} /><br /><Skel w={240} h={12} /></span><Skel w={96} h={36} /></div>)}</div>
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat halaman">
      <Skel w={160} h={32} />
      <div style={{ marginTop: 'var(--s-3)' }}><Skel w={420} h={16} /></div>
    </div>
  )
}
