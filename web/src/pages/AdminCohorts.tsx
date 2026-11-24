import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Bar, Chip, Dialog, Empty, ErrorBox, failToast, Field, fieldAria, ShowAll, Skel, useToast } from '../components/bits'
import { IconExternal, IconPlus, IconSearch } from '../components/icons'
import { errorText, rows, useFetch, type Row } from '../lib/data'
import {
  addCohortMember, approveCohortRequest, closeCohort, REQUEST_REASON_MAX, rejectCohortRequest, usePendingRequestCounts, usePendingRequests, type CohortRequest, CLOSE_DAY, cohortDay, createCohort, fmtWib, LAST_JOIN_DAY, MIN_APPS, pinnedMessage,
  reassignSlot, removeCohortMember, resetCohort, setCohortLink, settleMember, startCohort,
  useAssignmentStatus, useCohort, useCohortLink, useCohorts, useMemberCandidates, useAppCandidates, useObligations,
  type Candidate, type AppCandidate, type CohortDetail, type CohortDoc, type CohortMember, type CohortStatus,
} from '../lib/cohorts'
import { useT } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { CohortChip, StandingChip, useFocusAfterClose } from '../components/cohortBits'
import { fmtDate, fmtDateTime } from '../lib/progress'
import './admin-cohorts.css'

/**
 * Admin › Cohort (PRD §5.6, §6.9 FR-29–31/37, §6.12 FR-49–53; ADR-007; ADR-009 §1, §6, §7).
 * Left: the cohorts, those needing the admin first. Right: the selected cohort, then its WhatsApp link and
 * the pinned-message template. The primary action follows the cohort's state: "Mulai cohort" while Forming.
 * Close, reassign and the reminder panel come with B7.
 */

const DAY = 86_400_000
const WA_PREFIX = 'https://chat.whatsapp.com/'
const NAME_MAX = 50
const DONE_PREVIEW = 4

// Status and standing chips are shared with /cohorts so both surfaces use the same words and glyphs.
const StatusChip = CohortChip

/** k per FR-32: full mesh up to 16 apps, then a ring of 14. */
const ringK = (n: number) => (n <= 16 ? n - 1 : 14)

// The list only knows each cohort's app ids, not standings: one extra read finds the closed cohorts with Owing members.
const NO_OWING = new Map<string, number>()
const useOwingCounts = () =>
  useFetch(async () => {
    const r = await rows<Row[]>(supabase.from('cohort_members').select('cohort_id').eq('standing', 'owing'))
    const m = new Map<string, number>()
    for (const x of r) m.set(x.cohort_id as string, (m.get(x.cohort_id as string) ?? 0) + 1)
    return m
  }, NO_OWING, [])

/** Same fallback as the public pages when a profile has no display name. */
const nameOf = (m: { displayName: string }, tr: ReturnType<typeof useT>) => m.displayName || tr('member_fallback')

const STATUS_ORDER: Record<CohortStatus, number> = { forming: 0, active: 1, closed: 2 }

export function Cohorts() {
  const t = useT()
  const list = useCohorts()
  const owing = useOwingCounts()
  const pending = usePendingRequestCounts()
  const [params, setParams] = useSearchParams()
  const [focusDetail, setFocusDetail] = useState(false)

  const { attention, done } = useMemo(() => {
    const sorted = [...list.data].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    return {
      attention: sorted.filter((c) => c.status !== 'closed' || (owing.data.get(c.id) ?? 0) > 0),
      done: sorted.filter((c) => c.status === 'closed' && !(owing.data.get(c.id) ?? 0)),
    }
  }, [list.data, owing.data])

  const selectedId = params.get('cohort') ?? attention[0]?.id ?? done[0]?.id ?? null
  const hrefFor = (id: string) => {
    const p = new URLSearchParams(params)
    p.set('cohort', id)
    return `?${p.toString()}`
  }
  const select = (id: string) => {
    setFocusDetail(true)
    setParams((p) => { const n = new URLSearchParams(p); n.set('cohort', id); return n })
  }
  const reloadList = () => { list.refresh(); owing.refresh(); pending.refresh() }

  return (
    <div className="grid ch-layout">
      <section className="panel flush span-4 ch-index" aria-labelledby="ch-list-h">
        <header><h2 id="ch-list-h">{t('admin_ch_list_h')}</h2>{!list.loading && list.data.length > 0 && <span className="meta num">{t('admin_ch_count', { n: list.data.length })}</span>}</header>
        <CreateCohort count={list.data.length} onCreated={(id) => { reloadList(); select(id) }} />
        {list.error ? (
          <div className="empty-pad"><ErrorBox text={t('admin_ch_list_error')} onRetry={list.retry} /></div>
        ) : list.loading ? (
          <div className="ch-group" aria-busy="true" aria-label={t('admin_ch_loading')}>{[0, 1, 2].map((i) => <div className="ch-row" key={i} aria-hidden="true"><Skel w={160} /><Skel w={120} h={12} /></div>)}</div>
        ) : list.data.length === 0 ? (
          <div className="empty-pad">
            <Empty title={t('admin_ch_empty_title')}>
              <p>{t('admin_ch_empty_body', { min: MIN_APPS })}</p>
            </Empty>
          </div>
        ) : (
          <>
            <CohortGroup id="ch-g-now" title={t('admin_ch_group_action')} items={attention} owing={owing.data} pending={pending.data} selectedId={selectedId} hrefFor={hrefFor} onPick={() => setFocusDetail(true)}
              empty={t('admin_ch_no_running')} />
            {done.length > 0 && (
              <CohortGroup id="ch-g-done" title={t('admin_ch_group_done')} items={done} owing={owing.data} pending={pending.data} selectedId={selectedId} hrefFor={hrefFor} onPick={() => setFocusDetail(true)} limit={DONE_PREVIEW} />
            )}
          </>
        )}
      </section>

      <div className="span-8 ch-detail">
        {selectedId ? (
          <CohortWork key={selectedId} id={selectedId} focus={focusDetail} onFocused={() => setFocusDetail(false)} onChanged={reloadList} />
        ) : !list.loading && !list.error ? (
          <section className="panel" aria-label={t('admin_ch_selected')}>
            <Empty title={t('admin_ch_pick_title')}>
              <p>{t('admin_ch_pick_body')}</p>
            </Empty>
          </section>
        ) : null}
      </div>
    </div>
  )
}

// ---------- list ----------

function CohortGroup({ id, title, items, owing, pending, selectedId, hrefFor, onPick, limit, empty }: {
  id: string; title: string; items: CohortDoc[]; owing: Map<string, number>; pending: Map<string, number>; selectedId: string | null
  hrefFor: (id: string) => string; onPick: () => void; limit?: number; empty?: string
}) {
  const t = useT()
  const [all, setAll] = useState(false)
  const shown = limit && !all ? items.slice(0, limit) : items
  return (
    <div className="ch-group">
      <h3 className="ch-group-h" id={`${id}-h`}>{title} <span className="num">({items.length})</span></h3>
      {items.length === 0 ? <p className="meta ch-group-empty">{empty}</p> : (
        <ul id={id} aria-labelledby={`${id}-h`}>
          {shown.map((c) => {
            const owe = owing.get(c.id) ?? 0
            const ask = c.status === 'forming' ? pending.get(c.id) ?? 0 : 0
            return (
              <li key={c.id}>
                <Link to={hrefFor(c.id)} className="ch-row" aria-current={c.id === selectedId ? 'true' : undefined} onClick={onPick}>
                  <span className="ch-row-top"><b>{c.name}</b><StatusChip status={c.status} /></span>
                  <span className="ch-row-meta num">
                    {c.status === 'forming' && t('admin_ch_row_apps', { n: c.appCount, min: MIN_APPS, testers: c.pureTesterCount })}
                    {c.status === 'active' && t('admin_ch_row_day', { day: cohortDay(c) ?? 0, n: c.appCount })}
                    {c.status === 'active' && (cohortDay(c) ?? 0) > CLOSE_DAY && <Chip tone="cabai" glyph="!">{t('admin_ch_past_day', { day: CLOSE_DAY })}</Chip>}
                    {c.status === 'closed' && t('admin_ch_finished_date', { date: fmtDate(c.closedAt) })}
                    {owe > 0 && <Chip tone="cabai" glyph="!">{t('admin_ch_owing_chip', { n: owe })}</Chip>}
                    {ask > 0 && <Chip tone="langit" glyph="◷">{t('admin_ch_requests_chip', { n: ask })}</Chip>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {limit && items.length > limit && <div className="ch-group-more"><ShowAll open={all} total={items.length} onToggle={() => setAll((x) => !x)} controls={id} /></div>}
    </div>
  )
}

function CreateCohort({ count, onCreated }: { count: number; onCreated: (id: string) => void }) {
  const t = useT()
  const toast = useToast()
  const [name, setName] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const v = name.trim()
  const fieldErr = !v ? t('admin_ch_name_required', { n: count + 1 }) : v.length > NAME_MAX ? t('admin_ch_name_max', { max: NAME_MAX }) : undefined
  const shownErr = touched ? fieldErr : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setTouched(true)
    if (fieldErr) { input.current?.focus(); return }
    setBusy(true); setErr(null)
    try {
      const id = await createCohort(v)
      toast(t('admin_ch_toast_created', { name: v }))
      setName(''); setTouched(false)
      onCreated(id)
    } catch (x) {
      setErr(errorText(x, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ch-create" onSubmit={submit} noValidate>
      <Field id="ch-new" label={t('admin_ch_new_label')} hint={t('admin_ch_new_hint', { max: NAME_MAX, n: count + 1 })} error={shownErr} count={`${name.length}/${NAME_MAX}`}>
        <input ref={input} className="input" maxLength={NAME_MAX} autoComplete="off" value={name}
          onChange={(e) => { setName(e.target.value); setErr(null) }} onBlur={() => { if (name) setTouched(true) }}
          {...fieldAria('ch-new', { hint: true, error: shownErr })} />
      </Field>
      {err && <ErrorBox text={err} />}
      <button className="btn" aria-busy={busy || undefined}><IconPlus aria-hidden="true" />{busy ? t('admin_ch_creating') : t('admin_ch_create')}</button>
    </form>
  )
}

// ---------- the selected cohort ----------

function CohortWork({ id, focus, onFocused, onChanged }: { id: string; focus: boolean; onFocused: () => void; onChanged: () => void }) {
  const t = useT()
  const d = useCohort(id)
  const heading = useRef<HTMLHeadingElement>(null)
  const c = d.data

  useEffect(() => {
    if (focus && c) { heading.current?.focus(); onFocused() }
  }, [focus, c, onFocused])

  if (d.error) return <section className="panel" aria-label={t('admin_ch_selected')}><ErrorBox text={t('admin_ch_detail_error')} onRetry={d.retry} /></section>
  if (d.loading || c === undefined) return <DetailSkeleton />
  if (c === null) {
    return (
      <section className="panel" aria-label={t('admin_ch_selected')}>
        <Empty title={t('admin_ch_not_found_title')}>
          <p>{t('admin_ch_not_found_body')}</p>
        </Empty>
      </section>
    )
  }
  const changed = () => { d.refresh(); onChanged() }
  return (
    <div className="ch-stack">
      <CohortPanel c={c} heading={heading} onChanged={changed} />
      {c.status === 'active' && <ReassignPanel c={c} />}
      {c.status === 'active' && <ReminderPanel c={c} />}
      <LinkPanel c={c} />
      <PinnedPanel c={c} />
    </div>
  )
}

function CohortPanel({ c, heading, onChanged }: { c: CohortDetail; heading: RefObject<HTMLHeadingElement | null>; onChanged: () => void }) {
  const t = useT()
  const day = cohortDay(c)
  return (
    <section className="panel ch-main" aria-labelledby="ch-h">
      <div className="ch-head">
        <div className="ch-title">
          <h2 id="ch-h" ref={heading} tabIndex={-1}>{c.name}</h2>
          <p className="ch-meta num">
            <StatusChip status={c.status} />
            {c.status === 'forming' && <span>{t('admin_ch_created', { date: fmtDate(c.createdAt) })}</span>}
            {c.status === 'active' && <span>{t('admin_ch_started', { day: day ?? 0, date: fmtDateTime(c.day0At) })}</span>}
            {c.status === 'active' && (day ?? 0) > CLOSE_DAY && <Chip tone="cabai" glyph="!">{t('admin_ch_past_day', { day: CLOSE_DAY })}</Chip>}
            {c.status === 'closed' && <span>{t('admin_ch_closed', { date: fmtDateTime(c.closedAt) })}</span>}
          </p>
        </div>
        {c.status === 'forming' && <StartAction c={c} heading={heading} onStarted={onChanged} />}
        {c.status === 'active' && (
          <div className="ch-active-actions">
            <CloseAction c={c} heading={heading} onClosed={onChanged} />
            <ResetAction c={c} heading={heading} onReset={onChanged} />
          </div>
        )}
      </div>

      {c.status === 'forming' && <FormingProgress c={c} />}
      {c.status === 'active' && <ActiveSummary c={c} />}
      {c.status === 'closed' && <Standings c={c} onChanged={onChanged} />}
      {c.status === 'forming' && <RequestsPanel c={c} onChanged={onChanged} />}
      {c.status !== 'closed' && <Members c={c} onChanged={onChanged} />}
    </section>
  )
}

function FormingProgress({ c }: { c: CohortDetail }) {
  const t = useT()
  const n = c.appCount
  const short = MIN_APPS - n
  return (
    <div className="ch-progress">
      <p className="ch-count num">{t('admin_ch_row_apps', { n, min: MIN_APPS, testers: c.pureTesterCount })}</p>
      <Bar value={Math.min(n, MIN_APPS)} max={MIN_APPS} label={t('admin_ch_bar_label', { n, min: MIN_APPS })} />
      <p className="meta">
        {short > 0
          ? t('admin_ch_need_short', { n: short, min: MIN_APPS })
          : t('admin_ch_ready', { k: ringK(n), extra: c.pureTesterCount > 0 ? t('admin_ch_ready_extra') : '' })}
      </p>
    </div>
  )
}

function ActiveSummary({ c }: { c: CohortDetail }) {
  const t = useT()
  const deadline = (c.day0At ?? 0) + 2 * DAY
  return (
    <div className="ch-progress">
      <dl className="ch-facts num">
        <div><dt>{t('admin_ch_fact_apps')}</dt><dd>{c.appCount}</dd></div>
        <div><dt>{t('admin_ch_fact_pure')}</dt><dd>{c.pureTesterCount}</dd></div>
        <div><dt>{t('admin_ch_fact_optin')}</dt><dd className="ch-fact-text">{fmtDateTime(deadline)}</dd></div>
      </dl>
      <Link className="text-action" to={`/cohorts/${c.id}`}>{t('admin_ch_open_page')}</Link>
    </div>
  )
}

// ---------- start (ADR-009 §1 primary, §7 confirm) ----------

function StartAction({ c, heading, onStarted }: { c: CohortDetail; heading: RefObject<HTMLHeadingElement | null>; onStarted: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  // The start button disappears once the cohort is active: land on the cohort heading instead.
  const focusHeading = useFocusAfterClose(open, heading)
  const deleted = c.members.filter((m) => m.appId && m.appDeleted)
  const why = c.appCount < MIN_APPS
    ? t('admin_ch_need_apps', { min: MIN_APPS, n: c.appCount })
    : deleted.length > 0
      ? t('admin_ch_deleted_apps', { apps: deleted.map((m) => m.appName ?? t('admin_ch_fact_apps')).join(', ') })
      : null
  const thin = !why && c.appCount === MIN_APPS && c.pureTesterCount === 0
  return (
    <div className="ch-start">
      <button type="button" className="btn primary" aria-disabled={why ? true : undefined} aria-describedby={why ? 'ch-start-why' : thin ? 'ch-start-thin' : undefined}
        onClick={() => { if (!why) setOpen(true) }}>
        {t('admin_ch_start')}
      </button>
      {why && <p className="meta ch-why" id="ch-start-why">{why}</p>}
      {thin && <p className="meta ch-why" id="ch-start-thin"><span className="ch-glyph" aria-hidden="true">!</span>{t('admin_ch_thin_buffer')}</p>}
      <Dialog open={open} onClose={() => setOpen(false)} label={t('admin_ch_start_label', { name: c.name })}>
        {open && <StartForm c={c} thin={thin} onClose={() => setOpen(false)} onStarted={() => { focusHeading(); onStarted() }} />}
      </Dialog>
    </div>
  )
}

function StartForm({ c, thin, onClose, onStarted }: { c: CohortDetail; thin: boolean; onClose: () => void; onStarted: () => void }) {
  const t = useT()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [now] = useState(() => Date.now())
  const k = ringK(c.appCount)
  const title = useRef<HTMLHeadingElement>(null)
  // showModal() focuses the first button, which scrolls a phone-height dialog to its foot: start at the title instead.
  useEffect(() => { const t = window.setTimeout(() => title.current?.focus(), 0); return () => window.clearTimeout(t) }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await startCohort(c.id)
      toast(t('admin_ch_toast_started', { name: c.name, deadline: fmtDateTime(Date.now() + 2 * DAY) }))
      onStarted()
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
        <h2 ref={title} tabIndex={-1}>{t('admin_ch_start_confirm', { name: c.name })}</h2>
        <p className="lede">{t('admin_ch_start_lede')}</p>
        <ol className="ch-steps num">
          <li>{t('admin_ch_start_s1', { n: c.appCount, k })}</li>
          {c.pureTesterCount > 0 && <li>{t('admin_ch_start_s2', { apps: Math.min(14, c.appCount), testers: c.pureTesterCount })}</li>}
          <li>{t('admin_ch_start_s3', { now: fmtDateTime(now), deadline: fmtDateTime(now + 2 * DAY) })}</li>
          <li>{t('admin_ch_start_s4', { day: LAST_JOIN_DAY - 1, time: fmtWib(now + LAST_JOIN_DAY * DAY) })}</li>
        </ol>
        {thin && (
          <p className="notice admin-notice ch-warn" role="note">
            <Chip tone="cabai" glyph="!">{t('admin_ch_thin_warn_chip')}</Chip>
            <span>{t('admin_ch_thin_warn', { min: MIN_APPS })}</span>
          </p>
        )}
        <p className="notice admin-notice" role="note">
          <span className="chip"><span className="g" aria-hidden="true">!</span>{t('admin_ch_irreversible')}</span>
          <span>{t('admin_ch_assign_stays')}</span>
        </p>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" aria-busy={busy || undefined}>{busy ? t('admin_ch_starting') : t('admin_ch_start_now')}</button>
      </div>
    </form>
  )
}

// ---------- members (forming: add and remove; active: read only) ----------

function Members({ c, onChanged }: { c: CohortDetail; onChanged: () => void }) {
  const t = useT()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const forming = c.status === 'forming'
  const creators = c.members.filter((m) => m.appId)
  const pure = c.members.filter((m) => !m.appId)

  // ADR-009 §7 (owner decision 2026-11-03): removing a member while Forming is reversible, so it acts at once
  // and offers "Urungkan" for 8 s instead of a confirm dialog. Undo re-adds the member with the same app.
  const remove = async (m: CohortMember) => {
    if (busyId) return
    setBusyId(m.userId)
    try {
      await removeCohortMember(c.id, m.userId)
      // The row and its button are gone after the refresh: keep focus in the section.
      heading.current?.focus()
      onChanged()
      const left = m.appId && c.appCount - 1 < MIN_APPS ? t('admin_ch_apps_left', { n: c.appCount - 1, min: MIN_APPS }) : ''
      toast({
        text: m.appId
          ? t('admin_ch_toast_removed_creator', { name: nameOf(m, t), app: m.appName ?? t('admin_ch_app_fallback'), cohort: c.name, rest: left })
          : t('admin_ch_toast_removed', { name: nameOf(m, t), cohort: c.name }),
        duration: 8000,
        action: {
          label: t('form_undo'),
          onClick: () => {
            addCohortMember(c.id, m.userId, m.appId).then(
              () => { toast(t('admin_ch_toast_restored_member', { name: nameOf(m, t), cohort: c.name })); onChanged() },
              (x) => toast(failToast(x)),
            )
          },
        },
      })
    } catch (x) {
      toast(failToast(x))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="ch-members">
      <div className="ch-members-head">
        <h3 ref={heading} tabIndex={-1}>{t('admin_ch_members')} <span className="num muted">({c.members.length})</span></h3>
        {forming && <button type="button" className="btn sm" onClick={() => setAdding(true)}><IconPlus aria-hidden="true" />{t('admin_ch_add_member')}</button>}
      </div>
      {c.members.length === 0 ? (
        <Empty title={t('admin_ch_no_members_title')}>
          <p>{t('admin_ch_no_members_body')}</p>
        </Empty>
      ) : (
        <>
          <MemberList title={t('admin_ch_creators_apps')} items={creators} forming={forming} busyId={busyId} onRemove={remove}
            empty={t('admin_ch_no_creators', { min: MIN_APPS })} />
          <MemberList title={t('admin_ch_fact_pure')} items={pure} forming={forming} busyId={busyId} onRemove={remove}
            empty={forming ? t('admin_ch_no_pure_forming') : t('admin_ch_no_pure')} />
        </>
      )}

      {forming && (
        <Dialog open={adding} onClose={() => setAdding(false)} label={t('admin_ch_add_dialog', { name: c.name })}>
          {adding && <AddMemberForm c={c} onClose={() => setAdding(false)} onAdded={onChanged} />}
        </Dialog>
      )}
    </div>
  )
}

function MemberList({ title, items, forming, busyId, onRemove, empty }: {
  title: string; items: CohortMember[]; forming: boolean; busyId: string | null; onRemove: (m: CohortMember) => void; empty: string
}) {
  const t = useT()
  return (
    <div className="ch-sub">
      <h4 className="ch-sub-h">{title} <span className="num">({items.length})</span></h4>
      {items.length === 0 ? <p className="meta">{empty}</p> : (
        <ul>
          {items.map((m) => (
            <li className="row-line ch-member" key={m.userId}>
              <Avatar name={nameOf(m, t)} photo={m.photoURL} />
              <span className="grow cell-2">
                <Link className="hit ch-name" to={`/u/${m.userId}`}><b>{nameOf(m, t)}</b></Link>
                {m.appId ? (
                  <span className="ch-app">
                    <Link className="hit" to={`/apps/${m.appId}`}>{m.appName ?? t('admin_ch_fact_apps')}</Link>
                    {m.appDeleted && <Chip tone="cabai" glyph="×">{t('admin_ch_deleted_chip')}</Chip>}
                  </span>
                ) : <span>{t('admin_ch_no_app')}</span>}
              </span>
              {forming && (
                // Quiet on purpose: a column of red buttons would shout. The toast carries the undo.
                <button type="button" className="btn sm" aria-busy={busyId === m.userId || undefined} onClick={() => onRemove(m)}>
                  {busyId === m.userId ? t('admin_ch_removing') : t('admin_ch_remove')}<span className="sr-only"> {nameOf(m, t)}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------- ADR-013: requests to bring an app, oldest first ----------

const reqFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })

function RequestsPanel({ c, onChanged }: { c: CohortDetail; onChanged: () => void }) {
  const t = useT()
  const toast = useToast()
  const list = usePendingRequests(c.id)
  const heading = useRef<HTMLHeadingElement>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<CohortRequest | null>(null)
  const items = list.data

  const approve = async (r: CohortRequest) => {
    if (busyId) return
    setBusyId(r.id)
    try {
      await approveCohortRequest(r.id)
      // The row and its button are gone after the refresh: keep focus in the section.
      heading.current?.focus()
      toast(t('admin_ch_toast_approved', { name: nameOf(r, t), app: r.appName, cohort: c.name }))
      list.refresh(); onChanged()
    } catch (x) {
      toast(failToast(x))
      list.refresh()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="ch-members ch-requests">
      <div className="ch-members-head">
        <h3 ref={heading} tabIndex={-1}>{t('admin_ch_requests')} <span className="num muted">({items.length})</span></h3>
      </div>
      {list.error ? <ErrorBox text={t('admin_ch_req_load_error')} onRetry={list.retry} /> : list.loading ? (
        <div aria-busy="true" aria-label={t('admin_ch_loading_requests')}>{[0, 1].map((i) => <div className="row-line" key={i} aria-hidden="true"><Skel w={32} h={32} /><span className="grow"><Skel w={160} /><br /><Skel w={120} h={12} /></span></div>)}</div>
      ) : items.length === 0 ? (
        <p className="meta">{t('admin_ch_no_requests')}</p>
      ) : (
        <>
          <p className="meta">{t('admin_ch_req_hint')}</p>
          <ul>
            {items.map((r) => (
              <li className="row-line ch-member ch-req" key={r.id}>
                <Avatar name={nameOf(r, t)} photo={r.photoURL} />
                <span className="grow cell-2">
                  <Link className="hit ch-name" to={`/u/${r.userId}`}><b>{nameOf(r, t)}</b></Link>
                  <span className="num">{r.maskedEmail}</span>
                  <span className="ch-app"><Link className="hit" to={`/apps/${r.appId}`}>{r.appName || t('admin_ch_fact_apps')}</Link></span>
                  <span className="num">{t('admin_ch_submitted_at', { date: `${reqFmt.format(r.createdAt)} WIB` })}</span>
                </span>
                <span className="ch-req-acts">
                  <button type="button" className="btn sm primary" aria-busy={busyId === r.id || undefined} onClick={() => { void approve(r) }}>
                    {busyId === r.id ? t('admin_ch_approving') : t('admin_ch_approve')}<span className="sr-only"> {nameOf(r, t)}</span>
                  </button>
                  <button type="button" className="btn sm" onClick={() => setRejecting(r)}>{t('admin_ch_reject')}<span className="sr-only"> {nameOf(r, t)}</span></button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <Dialog open={rejecting != null} onClose={() => setRejecting(null)} label={t('admin_ch_reject_dialog')}>
        {rejecting && (
          <RejectForm r={rejecting} c={c} onClose={() => setRejecting(null)}
            onDone={() => { heading.current?.focus(); list.refresh(); onChanged() }} />
        )}
      </Dialog>
    </div>
  )
}

function RejectForm({ r, c, onClose, onDone }: { r: CohortRequest; c: CohortDetail; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const over = reason.trim().length > REQUEST_REASON_MAX
  const fieldErr = over ? t('admin_ch_reason_max', { max: REQUEST_REASON_MAX }) : undefined
  const area = useRef<HTMLTextAreaElement>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (fieldErr) { area.current?.focus(); return }
    setBusy(true); setErr(null)
    try {
      await rejectCohortRequest(r.id, reason)
      toast(t('admin_ch_toast_rejected', { name: nameOf(r, t), app: r.appName }))
      onClose(); onDone()
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
          <h2>{t('admin_ch_reject_title')}</h2>
          <p className="lede">{t('admin_ch_reject_lede', { name: nameOf(r, t), app: r.appName, cohort: c.name })}</p>
        </div>
        <Field id="rj-reason" label={t('admin_ch_reason_label')} optional hint={t('admin_ch_reason_hint')} error={fieldErr} count={`${reason.trim().length}/${REQUEST_REASON_MAX}`}>
          <textarea ref={area} className="input" rows={3} autoComplete="off" value={reason}
            onChange={(e) => { setReason(e.target.value); setErr(null) }} {...fieldAria('rj-reason', { hint: true, error: fieldErr })} />
        </Field>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn danger" aria-busy={busy || undefined}>{busy ? t('admin_ch_rejecting') : t('admin_ch_reject_btn')}</button>
      </div>
    </form>
  )
}

// ---------- add member: search, pick, choose app or pure tester ----------

/** `inCohort`: undefined = available; null = in unnamed open cohort; string = that cohort's name. */
type Opt = { value: string; label: string; inCohort?: string | null }

function optionsFor(cand: Candidate): Opt[] {
  return [
    ...cand.apps.map((a) => ({ value: a.id, label: a.name, inCohort: a.inCohort !== null ? (a.inCohort ?? null) : undefined })),
    { value: 'pure', label: '' },
  ]
}
/** Opinionated default: the only free app, else pure tester when there is no free app; otherwise ask. */
function defaultChoice(cand: Candidate) {
  const free = cand.apps.filter((a) => a.inCohort == null)
  return free.length === 1 ? free[0].id : free.length === 0 ? 'pure' : ''
}
const isOptDisabled = (o: Opt) => o.inCohort !== undefined

type AddTab = 'member' | 'app'

function AddMemberForm({ c, onClose, onAdded }: { c: CohortDetail; onClose: () => void; onAdded: () => void }) {
  const t = useT()
  const toast = useToast()

  // shared
  const [added, setAdded] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<AddTab>('member')
  const members = useMemo(() => new Set([...c.members.map((m) => m.userId), ...added]), [c.members, added])

  // --- member tab ---
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setTerm(q.trim()), 250)
    return () => window.clearTimeout(id)
  }, [q])
  const res = useMemberCandidates(term, activeTab === 'member')
  const [pick, setPick] = useState<Candidate | null>(null)
  const [choice, setChoice] = useState('')
  const [showErr, setShowErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const firstOpt = useRef<HTMLInputElement>(null)
  const searching = !!q.trim() && (res.loading || term !== q.trim())

  // --- app tab ---
  const [appQ, setAppQ] = useState('')
  const [appTerm, setAppTerm] = useState('')
  useEffect(() => {
    const id = window.setTimeout(() => setAppTerm(appQ.trim()), 250)
    return () => window.clearTimeout(id)
  }, [appQ])
  const appRes = useAppCandidates(appTerm, activeTab === 'app')
  const [busyAppId, setBusyAppId] = useState<string | null>(null)
  const appSearchRef = useRef<HTMLInputElement>(null)
  const appSearching = !!appQ.trim() && (appRes.loading || appTerm !== appQ.trim())

  const switchTab = (tab: AddTab) => {
    setActiveTab(tab)
    setErr(null)
    if (tab === 'member') window.setTimeout(() => search.current?.focus(), 0)
    else window.setTimeout(() => appSearchRef.current?.focus(), 0)
  }

  // --- member tab handlers ---
  const blockedWhy = (cand: Candidate) =>
    members.has(cand.userId) ? t('already_member')
      : cand.owing ? t('creator_owing')
        : null

  const choose = (cand: Candidate) => {
    if (blockedWhy(cand)) return
    setPick(cand); setChoice(defaultChoice(cand)); setShowErr(false); setErr(null)
    window.setTimeout(() => firstOpt.current?.focus(), 0)
  }
  const back = () => {
    setPick(null); setErr(null)
    window.setTimeout(() => search.current?.focus(), 0)
  }

  const firstEnabled = pick ? optionsFor(pick).find((o) => !isOptDisabled(o))?.value : undefined
  const choiceErr = !choice ? t('pick_app_error') : undefined
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || !pick) return
    if (choiceErr) { setShowErr(true); firstOpt.current?.focus(); return }
    setBusy(true); setErr(null)
    const appId = choice === 'pure' ? null : choice
    try {
      await addCohortMember(c.id, pick.userId, appId)
      const app = pick.apps.find((a) => a.id === appId)
      toast(app
        ? t('toast_added_with_app', { name: nameOf(pick, t), app: app.name })
        : t('toast_added_pure', { name: nameOf(pick, t) }))
      setAdded((xs) => [...xs, pick.userId])
      onAdded()
      setPick(null); setQ(''); setTerm('')
      window.setTimeout(() => search.current?.focus(), 0)
    } catch (x) {
      setErr(errorText(x, t))
    } finally {
      setBusy(false)
    }
  }

  const memberStatus = !q.trim() ? '' : searching ? t('searching') : res.error ? '' : res.data.length === 0
    ? t('search_no_results', { term })
    : res.data.length >= 20
      ? t('search_members_count_max', { n: res.data.length })
      : t('search_members_count', { n: res.data.length })

  // --- app tab handlers ---
  const appBlockedWhy = (cand: AppCandidate) =>
    members.has(cand.creatorId) ? t('creator_already_member')
      : cand.inCohort !== null ? t('already_in_cohort', { cohort: cand.inCohort || t('in_unnamed_cohort') })
        : cand.creatorOwing ? t('creator_owing')
          : null

  const addApp = async (cand: AppCandidate) => {
    if (busyAppId) return
    setBusyAppId(cand.appId); setErr(null)
    try {
      await addCohortMember(c.id, cand.creatorId, cand.appId)
      toast(t('toast_added_app', { name: cand.creatorName || t('member_fallback'), app: cand.appName }))
      setAdded((xs) => [...xs, cand.creatorId])
      onAdded()
    } catch (x) {
      setErr(errorText(x, t))
    } finally {
      setBusyAppId(null)
    }
  }

  const appStatus = !appQ.trim() ? '' : appSearching ? t('searching') : appRes.error ? '' : appRes.data.length === 0
    ? t('search_no_app_results', { term: appTerm })
    : appRes.data.length >= 20
      ? t('search_apps_count_max', { n: appRes.data.length })
      : t('search_apps_count', { n: appRes.data.length })

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <div>
          <h2>{t('add_member_title')}</h2>
          <p className="lede">{t('add_member_to')} <b>{c.name}</b> · <span className="num">{c.appCount}/{MIN_APPS}</span> {t('add_member_apps_suffix')}</p>
        </div>

        <div className="tabs" role="tablist" aria-label={t('add_member_title')}>
          <button type="button" className="tab" role="tab" id="am-tab-member" aria-selected={activeTab === 'member'}
            aria-controls="am-panel-member" onClick={() => switchTab('member')}>
            {t('tab_members')}
          </button>
          <button type="button" className="tab" role="tab" id="am-tab-app" aria-selected={activeTab === 'app'}
            aria-controls="am-panel-app" onClick={() => switchTab('app')}>
            {t('tab_apps')}
          </button>
        </div>

        {/* ---- member tab panel ---- */}
        <div id="am-panel-member" role="tabpanel" aria-labelledby="am-tab-member" hidden={activeTab !== 'member'}>
          {!pick ? (
            <>
              <div className="field">
                <label htmlFor="am-q">{t('search_member_label')}</label>
                <span className="search">
                  <IconSearch aria-hidden="true" />
                  <input id="am-q" ref={search} className="input ch-search" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={50}
                    value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="am-q-hint am-q-status"
                    onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
                </span>
                <span className="hint" id="am-q-hint">{t('search_member_hint')}</span>
              </div>
              <p className="meta num" id="am-q-status" role="status" aria-live="polite">{memberStatus}</p>
              {res.error ? <ErrorBox text={t('search_failed')} onRetry={res.retry} /> : q.trim() && !searching && res.data.length > 0 && (
                <ul className="ch-cands" aria-label={t('search_results_label')}>
                  {res.data.map((cand) => {
                    const why = blockedWhy(cand)
                    const free = cand.apps.filter((a) => a.inCohort == null).length
                    return (
                      <li key={cand.userId}>
                        <button type="button" className="ch-cand" aria-disabled={why ? true : undefined} onClick={() => choose(cand)}
                          aria-describedby={`cand-${cand.userId}`}>
                          <Avatar name={nameOf(cand, t)} photo={cand.photoURL} />
                          <span className="cell-2 grow">
                            <b>{nameOf(cand, t)}</b>
                            <span>{cand.maskedEmail}</span>
                            <span id={`cand-${cand.userId}`} className="ch-cand-why">
                              {why ? <><span className="ch-glyph" aria-hidden="true">{cand.owing && !members.has(cand.userId) ? '!' : '✓'}</span>{why}</>
                                : cand.apps.length === 0 ? t('no_apps_pure_tester')
                                  : free < cand.apps.length
                                    ? t('cand_apps_count_some_free', { total: cand.apps.length, free })
                                    : t('cand_apps_count', { total: cand.apps.length })}
                            </span>
                          </span>
                          {!why && <span className="ch-cand-go" aria-hidden="true">{t('select_cand')}</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {q.trim() && !searching && !res.error && res.data.length === 0 && (
                <Empty title={t('empty_no_members_title', { term })}>
                  <p>{t('empty_no_members_body')}</p>
                </Empty>
              )}
            </>
          ) : (
            <>
              <div className="ch-picked">
                <Avatar name={nameOf(pick, t)} photo={pick.photoURL} />
                <span className="cell-2 grow"><b>{nameOf(pick, t)}</b><span>{pick.maskedEmail}</span></span>
                <button type="button" className="text-action" onClick={back}>{t('change_member')}</button>
              </div>
              <fieldset className="fieldset ch-opts" aria-describedby={showErr && choiceErr ? 'am-opt-err' : 'am-opt-hint'}>
                <legend>{t('join_as_legend')}</legend>
                <p className="hint ch-opt-hint" id="am-opt-hint">{t('one_app_per_member_hint')}</p>
                {optionsFor(pick).map((o) => {
                  const disabled = isOptDisabled(o)
                  const disabledReason = disabled
                    ? t('already_in_cohort', { cohort: o.inCohort ?? t('in_unnamed_cohort') })
                    : undefined
                  return (
                    <label key={o.value} className={`ch-opt ${disabled ? 'off' : ''}`}>
                      <input ref={o.value === firstEnabled ? firstOpt : undefined} type="radio" name="am-app" value={o.value} checked={choice === o.value} disabled={disabled}
                        onChange={() => { setChoice(o.value); setShowErr(false) }} aria-describedby={disabled ? `opt-${o.value}` : undefined} />
                      <span className="cell-2">
                        <b>{o.value === 'pure' ? t('pure_tester_option') : o.label}</b>
                        {disabled && <span id={`opt-${o.value}`}>{disabledReason}</span>}
                      </span>
                    </label>
                  )
                })}
                <span className={showErr && choiceErr ? 'hint err' : 'sr-only'} id="am-opt-err" aria-live="polite">{showErr ? choiceErr : ''}</span>
              </fieldset>
            </>
          )}
        </div>

        {/* ---- app tab panel ---- */}
        <div id="am-panel-app" role="tabpanel" aria-labelledby="am-tab-app" hidden={activeTab !== 'app'}>
          <div className="field">
            <label htmlFor="am-app-q">{t('search_app_label')}</label>
            <span className="search">
              <IconSearch aria-hidden="true" />
              <input id="am-app-q" ref={appSearchRef} className="input ch-search" type="search" enterKeyHint="search" autoComplete="off" spellCheck={false} maxLength={50}
                value={appQ} onChange={(e) => setAppQ(e.target.value)} aria-describedby="am-app-q-hint am-app-q-status"
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
            </span>
            <span className="hint" id="am-app-q-hint">{t('search_app_hint')}</span>
          </div>
          <p className="meta num" id="am-app-q-status" role="status" aria-live="polite">{appStatus}</p>
          {appRes.error ? <ErrorBox text={t('search_app_failed')} onRetry={appRes.retry} /> : appQ.trim() && !appSearching && appRes.data.length > 0 && (
            <ul className="ch-cands" aria-label={t('search_app_results_label')}>
              {appRes.data.map((cand) => {
                const why = appBlockedWhy(cand)
                const isBusy = busyAppId === cand.appId
                return (
                  <li key={cand.appId}>
                    <div className="ch-cand" style={{ cursor: 'default' }} aria-disabled={why ? true : undefined}>
                      <Avatar name={cand.appName} photo={null} />
                      <span className="cell-2 grow">
                        <b>{cand.appName}</b>
                        <span>{cand.creatorName || t('member_fallback')} · {cand.creatorMaskedEmail}</span>
                        {why && (
                          <span className="ch-cand-why">
                            <span className="ch-glyph" aria-hidden="true">!</span>{why}
                          </span>
                        )}
                      </span>
                      {!why && (
                        <button type="button" className="btn sm" aria-busy={isBusy || undefined}
                          onClick={() => addApp(cand)} disabled={!!busyAppId}>
                          {isBusy ? t('adding_app') : t('add_app')}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {appQ.trim() && !appSearching && !appRes.error && appRes.data.length === 0 && (
            <Empty title={t('empty_no_apps_title', { term: appTerm })}>
              <p>{t('empty_no_apps_body')}</p>
            </Empty>
          )}
        </div>

        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        {added.length > 0 && <span className="why num">{t('members_added', { n: added.length })}</span>}
        <button type="button" className="btn" onClick={onClose}>{added.length > 0 ? t('done') : t('close')}</button>
        {activeTab === 'member' && pick && <button className="btn primary" aria-busy={busy || undefined}>{busy ? t('adding') : t('add_to_cohort')}</button>}
      </div>
    </form>
  )
}

// ---------- closed: standings and settling (FR-37) ----------

function Standings({ c, onChanged }: { c: CohortDetail; onChanged: () => void }) {
  const t = useT()
  const [settling, setSettling] = useState<CohortMember | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const focusHeading = useFocusAfterClose(!!settling, heading)
  const owing = c.members.filter((m) => m.standing === 'owing')
  const settled = c.members.filter((m) => m.standing === 'settled')
  const good = c.members.filter((m) => m.standing === 'good').length
  return (
    <div className="ch-members">
      <dl className="ch-facts num">
        <div><dt>{t('admin_ch_standing_good')}</dt><dd>{good}</dd></div>
        <div><dt>{t('admin_ch_standing_owing')}</dt><dd>{owing.length}</dd></div>
        <div><dt>{t('admin_ch_standing_settled')}</dt><dd>{settled.length}</dd></div>
      </dl>
      <div className="ch-members-head"><h3 ref={heading} tabIndex={-1}>{t('admin_ch_unfinished')}</h3></div>
      {owing.length === 0 ? (
        <Empty title={t('admin_ch_no_owing_title')}>
          <p>{settled.length > 0 ? t('admin_ch_no_owing_settled') : t('admin_ch_no_owing_all')}{t('admin_ch_can_join_next')}</p>
        </Empty>
      ) : (
        <>
          <p className="meta">{t('admin_ch_owing_hint')}</p>
          <ul>
            {owing.map((m) => (
              <li className="row-line ch-member" key={m.userId}>
                <Avatar name={nameOf(m, t)} photo={m.photoURL} />
                <span className="grow cell-2">
                  <Link className="hit ch-name" to={`/u/${m.userId}`}><b>{nameOf(m, t)}</b></Link>
                  <span>{m.appId ? (m.appName ?? t('admin_ch_fact_apps')) : t('admin_ch_fact_pure')}</span>
                </span>
                <StandingChip standing="owing" />
                <button type="button" className="btn sm" onClick={() => setSettling(m)}>{t('admin_ch_mark_settled')}<span className="sr-only"> {nameOf(m, t)}</span></button>
              </li>
            ))}
          </ul>
        </>
      )}
      {settled.length > 0 && (
        <div className="ch-sub">
          <h4 className="ch-sub-h">{t('admin_ch_settled_h')} <span className="num">({settled.length})</span></h4>
          <ul>
            {settled.map((m) => (
              <li className="row-line ch-member" key={m.userId}>
                <Avatar name={nameOf(m, t)} photo={m.photoURL} />
                <span className="grow cell-2">
                  <Link className="hit ch-name" to={`/u/${m.userId}`}><b>{nameOf(m, t)}</b></Link>
                  <span className="num">{t('admin_ch_settled_at', { date: fmtDateTime(m.settledAt) })}</span>
                </span>
                <StandingChip standing="settled" />
              </li>
            ))}
          </ul>
        </div>
      )}
      <Dialog open={!!settling} onClose={() => setSettling(null)} label={settling ? t('admin_ch_settle_named', { name: nameOf(settling, t) }) : t('admin_ch_settle_dialog')}>
        {settling && <SettleForm c={c} m={settling} onClose={() => setSettling(null)} onSettled={() => { focusHeading(); setSettling(null); onChanged() }} />}
      </Dialog>
    </div>
  )
}

function SettleForm({ c, m, onClose, onSettled }: { c: CohortDetail; m: CohortMember; onClose: () => void; onSettled: () => void }) {
  const t = useT()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await settleMember(c.id, m.userId)
      toast(t('admin_ch_toast_settled', { name: nameOf(m, t) }))
      onSettled()
    } catch (x) {
      setErr(errorText(x, t))
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <h2>{t('admin_ch_settle_title', { name: nameOf(m, t) })}</h2>
        <p>{t('admin_ch_settle_body', { name: nameOf(m, t), cohort: c.name })}</p>
        <p className="notice admin-notice" role="note">
          <span className="chip"><span className="g" aria-hidden="true">!</span>{t('admin_ch_irreversible')}</span>
          <span>{t('admin_ch_settled_irreversible')}</span>
        </p>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" aria-busy={busy || undefined}>{busy ? t('saving') : t('admin_ch_mark_settled_btn')}</button>
      </div>
    </form>
  )
}

// ---------- B7: close cohort (FR-37) ----------

function CloseAction({ c, heading, onClosed }: { c: CohortDetail; heading: RefObject<HTMLHeadingElement | null>; onClosed: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const focusHeading = useFocusAfterClose(open, heading)
  return (
    <div className="ch-start">
      <button type="button" className="btn" onClick={() => setOpen(true)}>{t('admin_ch_close_btn')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t('admin_ch_close_label', { name: c.name })}>
        {open && <CloseForm c={c} onClose={() => setOpen(false)} onClosed={() => { focusHeading(); onClosed() }} />}
      </Dialog>
    </div>
  )
}

function CloseForm({ c, onClose, onClosed }: { c: CohortDetail; onClose: () => void; onClosed: () => void }) {
  const t = useT()
  const tr = useT()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { const t = window.setTimeout(() => title.current?.focus(), 0); return () => window.clearTimeout(t) }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await closeCohort(c.id)
      toast(t('admin_ch_toast_closed', { name: c.name }))
      onClosed(); onClose()
    } catch (x) {
      setErr(errorText(x, tr)); setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <h2 ref={title} tabIndex={-1}>{t('admin_ch_close_title', { name: c.name })}</h2>
        <p className="lede">{t('admin_ch_close_lede')}</p>
        <ol className="ch-steps">
          <li>{t('admin_ch_close_s1')}</li>
          <li>{t('admin_ch_close_s2')}</li>
        </ol>
        <p className="notice admin-notice" role="note">
          <span className="chip"><span className="g" aria-hidden="true">!</span>{t('admin_ch_irreversible')}</span>
          <span>{t('admin_ch_close_standing')}</span>
        </p>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn danger" aria-busy={busy || undefined}>{busy ? t('admin_ch_closing') : t('admin_ch_close_btn')}</button>
      </div>
    </form>
  )
}

// ---------- reset active cohort back to forming ----------

function ResetAction({ c, heading, onReset }: { c: CohortDetail; heading: RefObject<HTMLHeadingElement | null>; onReset: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const focusHeading = useFocusAfterClose(open, heading)
  return (
    <div className="ch-start">
      <button type="button" className="btn" onClick={() => setOpen(true)}>{t('admin_ch_reset_btn')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t('admin_ch_reset_label', { name: c.name })}>
        {open && <ResetForm c={c} onClose={() => setOpen(false)} onReset={() => { focusHeading(); onReset() }} />}
      </Dialog>
    </div>
  )
}

function ResetForm({ c, onClose, onReset }: { c: CohortDetail; onClose: () => void; onReset: () => void }) {
  const t = useT()
  const tr = useT()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => { const t = window.setTimeout(() => title.current?.focus(), 0); return () => window.clearTimeout(t) }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr(null)
    try {
      await resetCohort(c.id)
      toast(t('admin_ch_toast_reset', { name: c.name }))
      onReset(); onClose()
    } catch (x) {
      setErr(errorText(x, tr)); setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <h2 ref={title} tabIndex={-1}>{t('admin_ch_reset_title', { name: c.name })}</h2>
        <p className="lede">{t('admin_ch_reset_lede')}</p>
        <ol className="ch-steps">
          <li>{t('admin_ch_reset_s1')}</li>
          <li>{t('admin_ch_reset_s2')}</li>
          <li>{t('admin_ch_reset_s3')} <b>{t('cohort_status_forming')}</b>{t('admin_ch_reset_s3b')}</li>
        </ol>
        <p className="meta">{t('admin_ch_reset_note')}</p>
        <p className="notice admin-notice" role="note">
          <span className="chip"><span className="g" aria-hidden="true">!</span>{t('admin_ch_assign_lost')}</span>
          <span>{t('admin_ch_assign_lost_note')}</span>
        </p>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn danger" aria-busy={busy || undefined}>{busy ? t('admin_ch_resetting') : t('admin_ch_reset_btn')}</button>
      </div>
    </form>
  )
}

// ---------- B7: reassign behind slot ----------

function ReassignPanel({ c }: { c: CohortDetail }) {
  const t = useT()
  const status = useAssignmentStatus(c.id)
  const [slot, setSlot] = useState<{ appId: string; testerId: string; appName: string } | null>(null)
  const panelHead = useRef<HTMLHeadingElement>(null)
  const focusHead = useFocusAfterClose(!!slot, panelHead)

  const behindSlots = useMemo(() => status.data.filter((s) => s.isBehind && s.cell === 'not_joined'), [status.data])

  if (status.loading && behindSlots.length === 0) return null
  if (status.error) return (
    <section className="panel" aria-label={t('admin_ch_slots_sr')}>
      <p className="meta cabai">{t('admin_ch_slots_load_error')} <button type="button" className="link" onClick={status.retry}>{t('retry')}</button></p>
    </section>
  )
  if (behindSlots.length === 0) return null

  return (
    <section className="panel" aria-labelledby="reassign-h">
      <header>
        <h2 id="reassign-h" ref={panelHead} tabIndex={-1}>{t('admin_ch_slots_sr')}</h2>
        <Chip tone="cabai" glyph="!">{t('admin_ch_slots_chip', { n: behindSlots.length })}</Chip>
      </header>
      <p className="meta">{t('admin_ch_slots_hint')}</p>
      <ul>
        {behindSlots.slice(0, 10).map((s) => {
          const app = c.members.find((m) => m.appId === s.appId)
          const tester = c.members.find((m) => m.userId === s.testerId)
          return (
            <li className="row-line" key={`${s.appId}:${s.testerId}`}>
              <span className="grow cell-2">
                <b>{app?.appName ?? t('admin_ch_fact_apps')}</b>
                <span>{tester?.displayName || t('admin_ch_tester_fallback')} · {t('admin_ch_not_opted')}</span>
              </span>
              <button type="button" className="btn sm"
                onClick={() => setSlot({ appId: s.appId, testerId: s.testerId, appName: app?.appName ?? t('admin_ch_fact_apps') })}>
                {t('admin_ch_move')}<span className="sr-only"> {t('admin_ch_move_slot')} {app?.appName}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <Dialog open={!!slot} onClose={() => setSlot(null)} label={slot ? t('admin_ch_move_named', { app: slot.appName }) : t('admin_ch_move_slot')}>
        {slot && <ReassignForm c={c} slot={slot} onClose={() => setSlot(null)} onDone={() => { focusHead(); setSlot(null) }} />}
      </Dialog>
    </section>
  )
}

function ReassignForm({ c, slot, onClose, onDone }: {
  c: CohortDetail; slot: { appId: string; testerId: string; appName: string }; onClose: () => void; onDone: () => void
}) {
  const t = useT()
  const toast = useToast()
  const [newId, setNewId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const candidates = c.members.filter((m) => m.userId !== slot.testerId && m.appId !== slot.appId)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!newId || busy) return
    setBusy(true); setErr(null)
    try {
      await reassignSlot(c.id, slot.appId, slot.testerId, newId)
      const name = c.members.find((m) => m.userId === newId)?.displayName ?? t('admin_ch_new_tester')
      toast(t('admin_ch_toast_moved', { app: slot.appName, name }))
      onDone()
    } catch (x) {
      setErr(errorText(x, t)); setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <h2>{t('admin_ch_move_title', { app: slot.appName })}</h2>
        <p className="lede">{t('admin_ch_move_lede')}</p>
        <fieldset className="fieldset ch-opts">
          <legend>{t('admin_ch_replace_legend')}</legend>
          {candidates.length === 0
            ? <p className="meta">{t('admin_ch_no_candidates')}</p>
            : candidates.map((m) => (
              <label key={m.userId} className="ch-opt">
                <input type="radio" name="ra-new" value={m.userId} checked={newId === m.userId} onChange={() => setNewId(m.userId)} />
                <span className="cell-2"><b>{nameOf(m, t)}</b><span>{m.appId ? (m.appName ?? t('admin_ch_creator')) : t('admin_ch_fact_pure')}</span></span>
              </label>
            ))}
        </fieldset>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" disabled={!newId} aria-busy={busy || undefined}>{busy ? t('admin_ch_moving') : t('admin_ch_move_slot')}</button>
      </div>
    </form>
  )
}

// ---------- B7: WA reminder text for behind members ----------

function ReminderPanel({ c }: { c: CohortDetail }) {
  const t = useT()
  const oblig = useObligations(c.id)
  const behind = useMemo(() => oblig.data.filter((o) => o.isBehind), [oblig.data])

  if (oblig.loading && behind.length === 0) return null
  if (oblig.error) return (
    <section className="panel" aria-label={t('admin_ch_behind_sr')}>
      <p className="meta cabai">{t('admin_ch_behind_load_error')} <button type="button" className="link" onClick={oblig.retry}>{t('retry')}</button></p>
    </section>
  )
  if (behind.length === 0) return null

  const lines = behind.map((o) => {
    const m = c.members.find((mm) => mm.userId === o.userId)
    const name = m?.displayName || t('admin_ch_members')
    return o.owesOptIn
      ? t('admin_ch_reminder_line', { name, count: o.optInMissing })
      : t('admin_ch_reminder_milestones', { name })
  })

  return (
    <section className="panel" aria-labelledby="remind-h">
      <header>
        <h2 id="remind-h">{t('admin_ch_behind_sr')}</h2>
        <Chip tone="cabai" glyph="!">{behind.length}</Chip>
      </header>
      <p className="meta">{t('admin_ch_behind_hint')}</p>
      <ul className="ch-behind-list">
        {behind.map((o) => {
          const m = c.members.find((mm) => mm.userId === o.userId)
          return (
            <li className="row-line" key={o.userId}>
              <span className="grow cell-2">
                <b>{m?.displayName || t('admin_ch_members')}</b>
                <span className="num">{o.owesOptIn ? t('admin_ch_slots_behind', { n: o.optInMissing }) : t('admin_ch_milestones_behind')}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <textarea
        className="input ch-pin" readOnly
        value={`${t('admin_ch_reminder_prefix')}\n${lines.join('\n')}`}
        rows={behind.length + 2}
        aria-label={t('admin_ch_reminder_aria')}
      />
    </section>
  )
}

// ---------- WhatsApp link (FR-49–51, FR-53) ----------

function waError(v: string, tr: ReturnType<typeof useT>): string | undefined {
  const s = v.trim()
  if (!s) return undefined
  if (!s.startsWith(WA_PREFIX)) return tr('admin_ch_wa_prefix_err', { prefix: WA_PREFIX })
  if (s.length <= WA_PREFIX.length || /\s/.test(s)) return tr('admin_ch_wa_incomplete')
  return undefined
}

function LinkPanel({ c }: { c: CohortDetail }) {
  const t = useT()
  const link = useCohortLink(c.id, true)
  const toast = useToast()
  // What the server holds after our own save, until the background refresh catches up.
  const [saved, setSaved] = useState<string | null | undefined>(undefined)
  const current = saved !== undefined ? saved : link.data
  const [v, setV] = useState<string | null>(null)
  const value = v ?? current ?? ''
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const fieldErr = waError(value, t)
  const shownErr = touched ? fieldErr : undefined
  const removing = !value.trim() && !!current
  const unchanged = value.trim() === (current ?? '')

  const save = async (url: string) => {
    await setCohortLink(c.id, url)
    const next = url.trim() || null
    setSaved(next); setV(null); setTouched(false)
    link.refresh()
    return next
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setTouched(true); setNote('')
    if (fieldErr) { input.current?.focus(); return }
    if (unchanged) { setNote(current ? t('admin_ch_saved_same') : t('admin_ch_nothing_save')); return }
    setBusy(true); setErr(null)
    const prev = current ?? null
    try {
      const next = await save(value)
      if (next) toast(t('admin_ch_toast_link_saved', { name: c.name }))
      else {
        toast({
          text: t('admin_ch_toast_link_removed', { name: c.name }), duration: 8000,
          action: prev ? { label: t('form_undo'), onClick: () => { save(prev).then(() => toast(t('admin_ch_toast_link_restored')), (x) => toast(failToast(x))) } } : undefined,
        })
      }
    } catch (x) {
      setErr(errorText(x, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="wa-h">
      <header>
        <h2 id="wa-h">{t('admin_ch_wa_h')}</h2>
        {!link.loading && !link.error && (current ? <Chip glyph="✓">{t('admin_ch_wa_on')}</Chip> : <Chip glyph="—">{t('admin_ch_wa_off')}</Chip>)}
      </header>
      {c.status === 'closed' && current && (
        <p className="notice admin-notice ch-notice" role="note">
          <span className="chip"><span className="g" aria-hidden="true">!</span>{t('admin_ch_wa_closed_chip')}</span>
          <span>{t('admin_ch_wa_closed_note')}</span>
        </p>
      )}
      {link.error ? <ErrorBox text={t('admin_ch_wa_load_error')} onRetry={link.retry} /> : (
        <form className="ch-link-form" onSubmit={submit} noValidate>
          <Field id="wa-url" label={t('admin_ch_wa_label')} error={shownErr}
            hint={<>{t('admin_ch_wa_hint_prefix')} <span className="ch-code">{WA_PREFIX}</span>{t('admin_ch_wa_hint')}</>}>
            <input ref={input} className="input" type="url" inputMode="url" autoComplete="off" spellCheck={false} disabled={link.loading}
              value={link.loading ? '' : value} onChange={(e) => { setV(e.target.value); setErr(null); setNote('') }} onBlur={() => setTouched(true)}
              {...fieldAria('wa-url', { hint: true, error: shownErr })} />
          </Field>
          {err && <ErrorBox text={err} />}
          <div className="ch-link-foot">
            <button className={`btn ${removing ? 'danger' : ''}`} aria-busy={busy || undefined} disabled={link.loading}>
              {busy ? t('saving') : removing ? t('admin_ch_remove_link') : t('admin_ch_save_link')}
            </button>
            {current && !link.loading && (
              <a className="text-action ch-ext" href={current} target="_blank" rel="noreferrer">{t('admin_ch_open_group')}<IconExternal aria-hidden="true" /><span className="sr-only">{t('coh_new_tab')}</span></a>
            )}
            <span className="meta" role="status" aria-live="polite">{note}</span>
          </div>
        </form>
      )}
    </section>
  )
}

// ---------- pinned-message template (FR-52) ----------

function PinnedPanel({ c }: { c: CohortDetail }) {
  const t = useT()
  const toast = useToast()
  const area = useRef<HTMLTextAreaElement>(null)
  const msg = pinnedMessage(c)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg)
      toast(t('admin_ch_toast_copied'))
    } catch {
      // Clipboard blocked (permissions, older WebView): select the text so one Ctrl+C / "Salin" finishes the job.
      area.current?.focus()
      area.current?.select()
      toast({ text: t('admin_ch_toast_copy_fail'), duration: 8000 })
    }
  }
  return (
    <section className="panel" aria-labelledby="pin-h">
      <header>
        <h2 id="pin-h">{t('admin_ch_pin_h')}</h2>
        <button type="button" className="btn sm" onClick={copy}>{t('admin_ch_copy_pin')}</button>
      </header>
      <p className="meta ch-pin-note" id="pin-d">
        {t('admin_ch_pin_note')}{c.status === 'forming' ? t('admin_ch_pin_forming') : ''}
      </p>
      <textarea ref={area} className="input ch-pin" readOnly value={msg} rows={msg.split('\n').length} aria-labelledby="pin-h" aria-describedby="pin-d" />
    </section>
  )
}

function DetailSkeleton() {
  const t = useT()
  return (
    <section className="panel" aria-busy="true" aria-label={t('admin_ch_loading')}>
      <Skel w={220} h={24} />
      <div style={{ marginTop: 'var(--s-3)' }}><Skel w="100%" h={16} /></div>
      <div style={{ marginTop: 'var(--s-4)' }}>{[0, 1, 2].map((i) => <div className="row-line" key={i}><Skel w={32} h={32} /><span className="grow"><Skel w={160} /><br /><Skel w={120} h={12} /></span></div>)}</div>
    </section>
  )
}

