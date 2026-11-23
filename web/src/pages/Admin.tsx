import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Chip, Dialog, Empty, ErrorBox, failToast, FeedbackChip, Field, fieldAria, NotFound, Skel, TesterChip, useToast } from '../components/bits'
import { IconSearch } from '../components/icons'
import { useAuth } from '../lib/auth'
import { useT } from '../lib/i18n'
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

function useSections(): Section[] {
  const t = useT()
  return [
    {
      id: 'cohort',
      label: t('admin_section_cohort'),
      summary: t('admin_section_cohort_summary'),
      render: () => <Cohorts />,
    },
    {
      id: 'moderasi',
      label: t('admin_section_moderation'),
      summary: t('admin_section_moderation_summary'),
      render: () => <Moderation />,
    },
  ]
}

export function Admin() {
  const { user, profile, isAdmin, ready, signIn } = useAuth()
  const t = useT()
  const toast = useToast()
  // The role arrives after the session: wait for it instead of flashing "not found" at the admin.
  const pending = !ready || (!!user && !profile)
  usePageMeta(pending ? t('admin_meta_loading') : !user ? t('admin_meta_sign_in') : isAdmin ? t('admin_title') : t('admin_meta_not_found'))

  if (pending) return <PageSkeleton />
  if (!user) {
    // Neutral copy: a signed-out visitor learns nothing about what lives here.
    return (
      <div className="state-page">
        <h1 className="page-title">{t('admin_sign_in_title')}</h1>
        <p>{t('admin_sign_in_body')}</p>
        <button className="btn primary" onClick={() => signIn().catch((e) => toast(errorText(e, t)))}>{t('sign_in_google')}</button>
      </div>
    )
  }
  if (!isAdmin) return <NotFound what={t('admin_page')} />
  return <AdminPage />
}

function AdminPage() {
  const t = useT()
  const sections = useSections()
  const params = new URLSearchParams(useLocation().search)
  const current = sections.find((s) => s.id === params.get('bagian')) ?? sections[0]
  return (
    <>
      <div className="title-row">
        <div>
          <h1>{t('admin_title')}</h1>
          <p className="sub">{current.summary}</p>
        </div>
      </div>
      {sections.length > 1 && (
        <nav className="tabs" aria-label={t('admin_nav_sections')}>
          {sections.map((s) => (
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
  const t = useT()
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
      toast(t('admin_toast_restored', { name: a.name }))
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
        <h2 id="deleted-h" ref={heading} tabIndex={-1}>{t('admin_deleted_h')}</h2>
        {!list.loading && shown.length > 0 && <span className="meta num">{t('admin_deleted_count', { n: shown.length })}</span>}
      </header>
      {list.error ? <ErrorBox text={t('admin_deleted_load_error')} onRetry={list.retry} /> : list.loading ? <RowsSkeleton /> : shown.length === 0 ? (
        <Empty title={t('admin_deleted_empty_title')}>
          <p>{t('admin_deleted_empty_body')}</p>
        </Empty>
      ) : (
        <ul className="deleted-list">
          {shown.map((a) => (
            <li className="row-line" key={a.id}>
              <span className="grow cell-2">
                <Link className="hit" to={`/apps/${a.id}`}><b>{a.name}</b></Link>
                <span>{a.creatorName} · <span className="num">{t('admin_active_testers', { n: a.activeTesterCount })}</span></span>
                {a.deletedAt != null && (
                  <span>{t('admin_deleted_rel')} <time dateTime={new Date(a.deletedAt).toISOString()}>{relTime(a.deletedAt)}</time><span className="num"> · {fmtDateTime(a.deletedAt)}</span></span>
                )}
              </span>
              <button type="button" className="btn sm" aria-disabled={busy === a.id || undefined} aria-busy={busy === a.id || undefined} onClick={() => restore(a)}>
                {busy === a.id ? t('admin_restoring') : <>{t('admin_restore')}<span className="sr-only"> {a.name}</span></>}
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
  const t = useT()
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

  const status = searching ? t('admin_searching')
    : res.error ? ''
    : rows.length === 0 ? (term ? t('admin_search_no_match', { term }) : '')
    : term
      ? t('admin_search_match', { n: rows.length, term }) + (rows.length >= MAX_ROWS ? t('admin_search_truncated', { max: MAX_ROWS }) : '.')
      : t('admin_search_recent', { n: rows.length }) + (rows.length >= MAX_ROWS ? t('admin_search_recent_truncated', { max: MAX_ROWS }) : '.')

  return (
    <section className="panel flush span-12" aria-labelledby="entries-h">
      <header>
        <h2 id="entries-h">{t('admin_entries_h')}</h2>
      </header>
      <div className="admin-search">
        <div className="field">
          <label htmlFor="ts-q">{t('admin_search_label')}</label>
          <span className="search">
            <IconSearch />
            <input id="ts-q" className="input" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={50}
              value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="ts-q-hint ts-q-status" />
          </span>
          <span className="hint" id="ts-q-hint">{t('admin_search_hint')}</span>
        </div>
        <p className="meta num" id="ts-q-status" role="status" aria-live="polite">{status}</p>
      </div>

      {res.error ? (
        <div className="empty-pad"><ErrorBox text={t('admin_entries_load_error')} onRetry={res.retry} /></div>
      ) : !searching && rows.length === 0 ? (
        <div className="empty-pad">
          {term ? (
            <Empty title={t('admin_empty_search_title', { term })}>
              <p>{t('admin_empty_search_body')}</p>
              <button type="button" className="text-action" onClick={() => setQ('')}>{t('admin_clear_search')}</button>
            </Empty>
          ) : (
            <Empty title={t('admin_empty_feedback_title')}>
              <p>{t('admin_empty_feedback_body')}</p>
            </Empty>
          )}
        </div>
      ) : (
        <>
          <div className="table-wrap sheet-scroll" tabIndex={0} role="region" aria-labelledby="entries-h">
            <table className="data sheet-table admin-table">
              <thead>
                <tr>
                  <th className="sticky">{t('admin_col_tester')}</th>
                  <th>{t('admin_col_app')}</th>
                  <th>{t('admin_col_status')}</th>
                  <th>{t('admin_col_summary')}</th>
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
                  : rows.map((row) => <EntryRow key={row.id} t={row} onOpen={() => setEditing(row)} />)}
              </tbody>
            </table>
          </div>
          {!searching && <p className="meta small scroll-hint" style={{ padding: '0 var(--s-3) var(--s-3)' }}>{t('admin_scroll_hint')}</p>}
        </>
      )}

      <Dialog open={!!editing} onClose={() => setEditing(null)} label={editing ? t('admin_edit_entry_named', { name: editing.displayName }) : t('admin_edit_entry')}>
        {editing && <EntryForm key={editing.id} t={editing} onClose={() => setEditing(null)} onSaved={res.refresh} />}
      </Dialog>
    </section>
  )
}

function EntryRow({ t: row, onOpen }: { t: AdminTesterRow; onOpen: () => void }) {
  const t = useT()
  return (
    <tr className="clickable" onClick={onOpen}>
      <td className="sticky">
        {/* The real control for keyboard and screen readers; the row click is a shortcut for the mouse. */}
        <button type="button" className="row-open cell-2" onClick={(e) => { e.stopPropagation(); onOpen() }}>
          <b>{row.displayName}</b>
          <span>{row.maskedEmail}</span>
          <span className="sr-only">{t('admin_edit_row_sr')}</span>
        </button>
      </td>
      <td>
        <span className="app-cell">
          <Link className="name-link hit" to={`/apps/${row.appId}`} onClick={(e) => e.stopPropagation()}><b>{row.appName || t('admin_app_word')}</b></Link>
          {row.appDeleted && <Chip glyph="×">{t('admin_deleted_chip')}</Chip>}
        </span>
      </td>
      <td>
        {/* Two short states stacked, so the summary (what gets moderated) keeps the width on desktop. */}
        <span className="state-cell">
          <TesterChip t={row} days={daysActive(row)} />
          <span><span className="sr-only">{t('admin_feedback_legend')}: </span><FeedbackChip t={row} /></span>
        </span>
      </td>
      <td className="summary-cell">{row.feedbackSummary ? <span className="clamp-2">{row.feedbackSummary}</span> : <span className="dash">—</span>}</td>
    </tr>
  )
}

/** Every moderation field in one form (PRD §7: admin edits status, date, note, Verified, Replied and feedback fields). */
function EntryForm({ t: row, onClose, onSaved }: { t: AdminTesterRow; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const toast = useToast()
  const [f, setF] = useState({
    status: row.status,
    optedInAt: isoDate(row.optedInAt),
    note: row.note ?? '',
    sent: row.feedbackSent,
    summary: row.feedbackSummary ?? '',
    verified: row.feedbackVerified,
    replied: row.replied,
  })
  const [showErr, setShowErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dateErr = !f.optedInAt ? t('admin_date_required') : f.optedInAt > todayIso() ? t('admin_date_future') : undefined
  // Turning "sent" off wipes the summary, its time and Verified on the server (updateTesterAsAdmin).
  const wiping = row.feedbackSent && !f.sent
  // Emptying or rewriting the tester's own summary cannot be undone either (ADR-009 §7): say so before saving.
  const oldSummary = (row.feedbackSummary ?? '').trim()
  const summaryEdit = !wiping && f.sent && !!oldSummary && f.summary.trim() !== oldSummary
    ? (f.summary.trim() ? 'replace' : 'clear') : null
  const destructive = wiping || !!summaryEdit

  const patch = (): ModerationPatch => {
    const p: ModerationPatch = {}
    if (f.status !== row.status) p.status = f.status
    if (f.optedInAt !== isoDate(row.optedInAt)) p.optedInAt = f.optedInAt
    if (f.note.trim() !== (row.note ?? '').trim()) p.note = f.note
    if (f.replied !== row.replied) p.replied = f.replied
    if (f.sent !== row.feedbackSent) p.feedbackSent = f.sent
    if (f.sent) {
      if (f.verified !== row.feedbackVerified) p.feedbackVerified = f.verified
      if (f.summary.trim() !== (row.feedbackSummary ?? '').trim()) p.feedbackSummary = f.summary
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
      await updateTesterAsAdmin(row, p)
      toast(wiping ? t('admin_toast_fb_removed', { name: row.displayName, app: row.appName }) : t('admin_toast_entry_saved', { name: row.displayName, app: row.appName }))
      onSaved()
      onClose()
    } catch (x) {
      setErr(errorText(x, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <div>
          <h2>{row.displayName}</h2>
          <p className="muted entry-sub">
            <span>{row.maskedEmail}</span>
            <span>{t('admin_at_app')} <b>{row.appName || t('admin_app_word')}</b></span>
            {row.appDeleted && <Chip glyph="×">{t('admin_deleted_chip')}</Chip>}
          </p>
        </div>

        <fieldset className="fieldset">
          <legend>{t('admin_participation')}</legend>
          <Field id="me-status" label={t('admin_status_label')} hint={t('admin_status_hint')}>
            <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TesterStatus })} {...fieldAria('me-status', { hint: true })}>
              {(['active', 'left', 'removed'] as TesterStatus[]).map((s) => <option key={s} value={s}>{testerStatusLabel[s]}</option>)}
            </select>
          </Field>
          <Field id="me-date" label={t('admin_optin_label')} hint={t('admin_optin_hint')} error={showErr ? dateErr : undefined}>
            <input type="date" className="input" max={todayIso()} value={f.optedInAt}
              onChange={(e) => setF({ ...f, optedInAt: e.target.value })} onBlur={() => setShowErr(true)}
              {...fieldAria('me-date', { hint: true, error: showErr ? dateErr : undefined })} />
          </Field>
          <Field id="me-note" label={t('admin_note_label')} optional hint={t('admin_note_hint')} count={`${f.note.length}/140`}>
            <input className="input" maxLength={140} autoComplete="off" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })}
              {...fieldAria('me-note', { hint: true })} />
          </Field>
        </fieldset>

        <fieldset className="fieldset">
          <legend>{t('admin_feedback_legend')}</legend>
          <label className="check">
            <input type="checkbox" checked={f.sent} onChange={(e) => setF({ ...f, sent: e.target.checked })} aria-describedby="me-sent-d" />
            <span><span className="t">{t('admin_fb_sent_t')}</span>
              <span className="d" id="me-sent-d">{row.feedbackSentAt ? <>{t('admin_fb_sent_d_marked')} <span className="num">{fmtDateTime(row.feedbackSentAt)}</span>.</> : t('admin_fb_sent_d_self')}</span></span>
          </label>
          {wiping && (
            <p className="notice admin-notice" role="status">
              <span className="chip"><span className="g" aria-hidden="true">!</span>{t('admin_attention')}</span>
              {t('admin_wipe_notice')}
            </p>
          )}
          <Field id="me-summary" label={t('admin_summary_label')} optional count={`${f.sent ? f.summary.length : 0}/500`}
            hint={f.sent ? t('admin_summary_hint_on') : t('admin_summary_hint_off')}>
            <textarea className="input" maxLength={500} disabled={!f.sent} value={f.sent ? f.summary : ''}
              onChange={(e) => setF({ ...f, summary: e.target.value })} {...fieldAria('me-summary', { hint: true })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={f.sent && f.verified} disabled={!f.sent} onChange={(e) => setF({ ...f, verified: e.target.checked })} />
            <span><span className="t">{t('admin_verified_t')}</span><span className="d">{t('admin_verified_d')}</span></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={f.replied} onChange={(e) => setF({ ...f, replied: e.target.checked })} />
            <span><span className="t">{t('admin_replied_t')}</span><span className="d">{t('admin_replied_d')}</span></span>
          </label>
          {summaryEdit && (
            <p className="notice admin-notice" role="status">
              <span className="chip"><span className="g" aria-hidden="true">!</span>{t('admin_attention')}</span>
              {summaryEdit === 'clear' ? t('admin_summary_clear_warn') : t('admin_summary_replace_warn')}{t('admin_summary_warn_end')}
            </p>
          )}
        </fieldset>

        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className={`btn ${destructive ? 'danger' : 'primary'}`} aria-busy={busy || undefined}>
          {busy ? t('saving') : wiping ? t('admin_save_wipe') : summaryEdit === 'clear' ? t('admin_save_clear') : summaryEdit ? t('admin_save_replace') : t('admin_save')}
        </button>
      </div>
    </form>
  )
}

function RowsSkeleton() {
  return <div aria-hidden="true">{[0, 1].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={180} /><br /><Skel w={240} h={12} /></span><Skel w={96} h={36} /></div>)}</div>
}

function PageSkeleton() {
  const t = useT()
  return (
    <div aria-busy="true" aria-label={t('admin_loading_page')}>
      <Skel w={160} h={32} />
      <div style={{ marginTop: 'var(--s-3)' }}><Skel w={420} h={16} /></div>
    </div>
  )
}
