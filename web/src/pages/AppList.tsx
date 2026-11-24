import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Chip, Empty, ErrorBox, Skel, StatusPill, useToast } from '../components/bits'
import { AssignedChip } from '../components/cohortBits'
import { IconPlus, IconSearch } from '../components/icons'
import { useAuth } from '../lib/auth'
import { usePageMeta } from '../lib/pageMeta'
import { errorText, useApps, useEntriesOf } from '../lib/data'
import { daysActive, daysAgo, openSeats, relDay, TARGET_DAYS } from '../lib/progress'
import { useT } from '../lib/i18n'
import type { AppStatus } from '../lib/types'
import { useAppCohorts, useBelumTesApps, useCohorts, useMyAssignedApps, type AppCohort, type CohortStatus } from '../lib/cohorts'
import type { AppDoc, TesterDoc } from '../lib/types'

type Tab = 'all' | AppStatus
type Sort = 'need' | 'full' | 'creator' | 'new'
const TABS: Tab[] = ['all', 'recruiting', 'testing', 'applied', 'live']
const STILL_TESTING: AppStatus[] = ['recruiting', 'testing']

function appStatusText(t: ReturnType<typeof useT>, status: AppStatus) {
  return t(`app_status_${status}`)
}
function cohortStatusWord(t: ReturnType<typeof useT>, status: CohortStatus) {
  return t(`cohort_status_${status}`).toLowerCase()
}
/** `?cohort=` value for apps not in any forming or active cohort (closed-only history counts as none; owner 2026-11-03). */
const NO_COHORT = 'tanpa'

interface Assigned { cohortId: string; name: string }
interface Row { app: AppDoc; eligible: number; cohort?: AppCohort; assigned?: Assigned; belumTes?: boolean; own?: boolean; mine?: TesterDoc }

export function AppList() {
  const t = useT()
  const apps = useApps()
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('need')
  usePageMeta(t('apps_meta_title'), t('apps_meta_desc'))

  // Cohort filter (FR-25) and "Ditugaskan ke saya" live in the URL, so a cohort page can link here (?cohort=<id>).
  const [params, setParams] = useSearchParams()
  const cohortParam = params.get('cohort') ?? ''
  const mineParam = params.get('ditugaskan') === '1'
  const setParam = (key: string, value: string | null) => setParams((p) => {
    const next = new URLSearchParams(p)
    if (value) next.set(key, value); else next.delete(key)
    return next
  }, { replace: true })

  // Cohort data is extra: if it fails, the list still works and only the cohort filter goes away (with a reason).
  const cohortList = useCohorts()
  const appCohorts = useAppCohorts()
  const assigned = useMyAssignedApps(user?.uid)
  const belumTes = useBelumTesApps()
  // The signed-in member's own tester entries, so each row says "Anda menguji" (or "Anda keluar").
  const entries = useEntriesOf(user?.uid)
  const myEntry = useMemo(() => new Map(entries.data.filter((t) => t.status !== 'removed').map((t) => [t.appId, t])), [entries.data])
  const cohortLoading = cohortList.loading || appCohorts.loading
  const cohortError = cohortList.error || appCohorts.error
  const retryCohorts = () => { cohortList.retry(); appCohorts.retry() }

  /** Open cohorts first (newest first, as fetched), then closed ones. */
  const cohortOptions = useMemo(
    () => [...cohortList.data.filter((c) => c.status !== 'closed'), ...cohortList.data.filter((c) => c.status === 'closed')],
    [cohortList.data],
  )
  const pickedCohort = cohortOptions.find((c) => c.id === cohortParam)
  const cohortFilter = !cohortLoading && !cohortError ? cohortParam : ''
  const mineFilter = mineParam && !!user && !assigned.loading && !assigned.error
  // While loading, the toggle holds its slot (disabled) so the toolbar does not jump; afterwards it stays only for
  // members with assignments (or a linked ?ditugaskan=1).
  const showMineToggle = !!user && !assigned.error && (assigned.loading || assigned.data.size > 0 || mineParam)
  const mineFailed = !!user && mineParam && !!assigned.error

  const rows = useMemo<Row[]>(() => apps.data.map((app) => ({
    app,
    eligible: app.eligibleCount,
    cohort: appCohorts.data.get(app.id)?.find((c) => c.status !== 'closed'),
    assigned: assigned.data.get(app.id),
    belumTes: !!user && belumTes.data.has(app.id),
    own: !!user && app.creatorUid === user.uid,
    mine: myEntry.get(app.id),
  })), [apps.data, appCohorts.data, assigned.data, belumTes.data, user, myEntry])

  // Cohort and "ditugaskan" narrow the base set; the status counts follow them, the search does not (as before).
  const base = useMemo(() => rows.filter((r) => {
    if (mineFilter && !r.assigned) return false
    if (!cohortFilter) return true
    const list = appCohorts.data.get(r.app.id)
    return cohortFilter === NO_COHORT ? !r.cohort : !!list?.some((c) => c.cohortId === cohortFilter)
  }), [rows, mineFilter, cohortFilter, appCohorts.data])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: base.length, recruiting: 0, testing: 0, applied: 0, live: 0 }
    for (const r of base) c[r.app.status]++
    return c
  }, [base])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = base.filter((r) => (tab === 'all' || r.app.status === tab) && (!needle || r.app.name.toLowerCase().includes(needle)))
    const still = (r: Row) => (STILL_TESTING.includes(r.app.status) ? 0 : 1)
    const created = (r: Row) => r.app.createdAt ?? 0
    return list.sort((a, b) => {
      if (sort === 'creator') return (b.app.creatorTestingCount ?? 0) - (a.app.creatorTestingCount ?? 0) || a.app.activeTesterCount - b.app.activeTesterCount
      if (sort === 'new') return created(b) - created(a)
      // ADR-012 §6 "Hampir penuh": fewest open seats first, full apps last.
      if (sort === 'full') {
        const open = (r: Row) => openSeats(r.app)
        return still(a) - still(b) || Number(open(a) <= 0) - Number(open(b) <= 0) || open(a) - open(b) || created(b) - created(a)
      }
      return still(a) - still(b) || openSeats(b.app) - openSeats(a.app) || a.app.activeTesterCount - b.app.activeTesterCount || created(b) - created(a)
    })
  }, [base, tab, q, sort])

  const short = rows.filter((r) => STILL_TESTING.includes(r.app.status) && openSeats(r.app) > 0).length
  const ready = rows.filter((r) => r.eligible >= r.app.testerSlots && r.app.status !== 'live').length
  // A linked ?cohort= or ?ditugaskan=1 view waits for its data instead of flashing the unfiltered list.
  const loading = apps.loading || (!!cohortParam && cohortLoading) || (mineParam && !!user && assigned.loading)

  const add = async () => {
    try {
      if (!user) await signIn('/apps/new')
      navigate('/apps/new')
    } catch (e) { toast(errorText(e, t)) }
  }

  const resetAll = () => {
    setQ(''); setTab('all')
    setParams((p) => { const next = new URLSearchParams(p); next.delete('cohort'); next.delete('ditugaskan'); return next }, { replace: true })
  }
  const filterWords: string[] = []
  if (q.trim()) filterWords.push(t('apps_filter_named', { q: q.trim() }))
  if (tab !== 'all') filterWords.push(t('apps_filter_status', { status: appStatusText(t, tab).toLowerCase() }))
  if (cohortFilter === NO_COHORT) filterWords.push(t('apps_filter_no_cohort'))
  else if (cohortFilter && pickedCohort) filterWords.push(t('apps_filter_in_cohort', { name: pickedCohort.name }))
  const unknownCohort = !!cohortFilter && cohortFilter !== NO_COHORT && !pickedCohort

  // Screen readers hear the count once the list settles (debounced), not on every search keystroke.
  const [said, setSaid] = useState('')
  useEffect(() => {
    if (loading) return
    const timer = setTimeout(() => setSaid(t('apps_count_apps', { n: shown.length })), 600)
    return () => clearTimeout(timer)
  }, [loading, shown.length, t])
  if (mineFilter) filterWords.push(t('apps_filter_assigned_you'))

  return (
    <>
      <div className="title-row">
        <div>
          <h1>{t('apps_title')}</h1>
          {(loading || rows.length > 0) && (
            <p className="sub">
              {loading ? <Skel w={360} h={16} /> : (
                <><b>{t('apps_sub_need_bold', { short, total: rows.length })}</b> {t('apps_sub_still_need')}{ready > 0 && t('apps_sub_ready', { ready })}{t('apps_sub_end')}</>
              )}
            </p>
          )}
        </div>
        <div className="actions">
          <button className="btn primary" onClick={add}><IconPlus />{t('apps_add')}</button>
        </div>
      </div>

      {/* A filter, not tabs: one list below, narrowed by status. Toggle buttons, one pressed at a time. */}
      <div className="tabs" role="group" aria-label={t('apps_filter_status_label')}>
        {TABS.map((tabKey) => (
          <button key={tabKey} type="button" className="tab" aria-pressed={tab === tabKey} onClick={() => setTab(tabKey)}>
            {tabKey === 'all' ? t('apps_tab_all') : appStatusText(t, tabKey)}<span className="n num">{loading ? '' : counts[tabKey]}</span>
          </button>
        ))}
      </div>

      <div className="toolbar app-toolbar">
        <label className="search">
          <span className="sr-only">{t('apps_search_label')}</span>
          <IconSearch />
          <input className="input" type="search" placeholder={t('apps_search_placeholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {cohortError ? (
          <span className="cohort-off">
            <span>{t('apps_cohort_filter_off')}</span>
            <button type="button" className="text-action" onClick={retryCohorts}>{t('apps_reload')}</button>
          </span>
        ) : (
          <>
            <label className="sr-only" htmlFor="cohort-filter">{t('apps_cohort_filter_label')}</label>
            <select
              id="cohort-filter" className="input cohort-select" value={cohortParam} disabled={cohortLoading}
              onChange={(e) => setParam('cohort', e.target.value || null)}
            >
              <option value="">{cohortLoading ? t('apps_cohort_loading') : t('apps_cohort_all')}</option>
              {cohortOptions.map((c) => <option key={c.id} value={c.id}>{c.name} · {cohortStatusWord(t, c.status)}</option>)}
              {cohortParam && cohortParam !== NO_COHORT && !cohortLoading && !pickedCohort && <option value={cohortParam}>{t('apps_cohort_not_found')}</option>}
              <option value={NO_COHORT}>{t('apps_cohort_none')}</option>
            </select>
          </>
        )}
        {showMineToggle && (
          <button
            type="button" className="tab mine-toggle" aria-pressed={mineParam} disabled={assigned.loading}
            onClick={() => setParam('ditugaskan', mineParam ? null : '1')}
          >
            {/* On/off shown by a check box glyph, not by the lifted shadow alone. */}
            <span className="tg" aria-hidden="true">{mineParam ? '✓' : ''}</span>
            {t('apps_filter_assigned_mine')}<span className="n num">{assigned.loading ? '' : assigned.data.size}</span>
          </button>
        )}
        {mineFailed && (
          <span className="cohort-off">
            <span>{t('apps_assigned_filter_off')}</span>
            <button type="button" className="text-action" onClick={assigned.retry}>{t('apps_reload')}</button>
          </span>
        )}
        {/* Count + sort stay together; when the filters fill the row they wrap as one group, right-aligned. */}
        <span className="tb-end">
          <span className="total num" aria-hidden="true">{loading ? '' : t('apps_count_apps', { n: shown.length })}</span>
          <span className="sr-only" role="status">{said}</span>
          <label className="sr-only" htmlFor="sort">{t('apps_sort_label')}</label>
          <select id="sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="need">{t('apps_sort_need')}</option>
            <option value="full">{t('apps_sort_full')}</option>
            <option value="creator">{t('apps_sort_creator')}</option>
            <option value="new">{t('apps_sort_new')}</option>
          </select>
        </span>
      </div>

      {apps.error && <ErrorBox text={t('apps_load_error')} onRetry={apps.retry} />}

      <div className="panel flush">
        <div className="table-wrap dtable">
          <table className="data app-table">
            <thead>
              <tr>
                <th className="col-app">{t('apps_col_app')}</th>
                <th className="num col-metric">{t('apps_prog_testers')}</th>
                <th className="num col-metric">{t('apps_prog_feedback')}</th>
                <th className="num col-metric">{t('apps_prog_days')}</th>
                <th className="num col-creator">{t('apps_col_creator_testing')}</th>
                <th className="num col-status">{t('apps_col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }, (_, i) => (
                    <tr key={i}>
                      <td className="app-main"><Skel w={160} /><br /><Skel w={220} h={12} /></td>
                      <td className="num"><Skel w={48} /></td>
                      <td className="num"><Skel w={48} /></td>
                      <td className="num"><Skel w={48} /></td>
                      <td><Skel w={120} /></td>
                      <td><Skel w={96} h={20} /></td>
                    </tr>
                  ))
                : shown.map((r) => <DesktopRow key={r.app.id} row={r} onOpen={() => navigate(`/apps/${r.app.id}`)} />)}
            </tbody>
          </table>
        </div>
        <div className="mlist">
          {loading
            ? Array.from({ length: 5 }, (_, i) => (
                <div className="mrow" key={i}>
                  <Skel w={150} /><Skel w={80} h={20} />
                  <span className="l2"><Skel w={220} h={12} /></span>
                  <span className="l2"><Skel w={260} h={28} /></span>
                </div>
              ))
            : shown.map((r) => <PhoneRow key={r.app.id} row={r} />)}
        </div>
        {!loading && shown.length === 0 && (
          <div className="empty-pad">
            {rows.length === 0 ? (
              <Empty title={t('apps_empty_none_title')}>
                <p>{t('apps_empty_none_body')}</p>
              </Empty>
            ) : unknownCohort ? (
              <Empty title={t('apps_empty_cohort_title')}>
                <p>{t('apps_empty_cohort_body')}</p>
                <button className="text-action" onClick={resetAll}>{t('apps_reset_filters')}</button>
              </Empty>
            ) : (
              <Empty title={t('apps_empty_filtered_title', { filters: filterWords.join(' ') })}>
                {pickedCohort && cohortFilter === pickedCohort.id && filterWords.length === 1 && (
                  <p>{t('apps_empty_cohort_join_hint', { cohort: pickedCohort.name })}</p>
                )}
                <button className="text-action" onClick={resetAll}>{t('apps_reset_filters')}</button>
              </Empty>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** Who the signed-in member is to this app: its creator, or one of its testers (active or left).
 *  Neutral fills: colour already means status/progress here (PRD DR-3), so glyph + text carry it. */
function MineChips({ own, mine }: Pick<Row, 'own' | 'mine'>) {
  const t = useT()
  if (own) return <Chip glyph="★" className="mine">{t('apps_chip_your_app')}</Chip>
  if (!mine) return null
  if (mine.status === 'left') return <Chip tone="soft" glyph="←" className="mine">{t('apps_chip_you_left')}</Chip>
  return <Chip glyph="●" className="mine">{t('apps_chip_you_testing')}<span className="num"> · {daysActive(mine)}{t('apps_days_unit')}</span></Chip>
}

/** One count for the list: "6/12" leads, a thin plain bar sits under it. 0 is muted; pandan only when `done`
 *  (default: target reached; feedback passes "all verified", since pandan means verified there, PRD DR-3).
 *  The number is for the eye; the progressbar's label carries the full sentence for screen readers. */
function Metric({ value, max, label, note, done }: { value: number; max: number; label: string; note?: ReactNode; done?: boolean }) {
  const t = useT()
  const v = Math.max(0, Math.min(value, max))
  const extra = Math.max(0, value - max)
  const state = value <= 0 ? 'zero' : (done ?? value >= max) ? 'done' : ''
  return (
    <span className={`metric ${state}`}>
      <span className="metric-n num" aria-hidden="true">
        {v}<small>/{max}</small>
        {extra > 0 && <span className="metric-x">+{extra}</span>}
        {note}
      </span>
      <span
        className="pbar" role="progressbar" aria-label={extra > 0 ? t('apps_bar_over', { label, extra }) : label}
        aria-valuemin={0} aria-valuemax={max} aria-valuenow={v}
        style={{ '--bar-max': max } as React.CSSProperties}
      >
        <i style={{ width: `${max > 0 ? (v / max) * 100 : 0}%` }} />
      </span>
    </span>
  )
}

function TesterMetric({ app }: { app: AppDoc }) {
  const t = useT()
  const active = Math.min(app.activeTesterCount, app.testerSlots)
  return <Metric value={app.activeTesterCount} max={app.testerSlots} label={t('seats_label', { active, total: app.testerSlots })} />
}

function FeedbackMetric({ app }: { app: AppDoc }) {
  const t = useT()
  const sent = app.feedbackSentCount
  const ver = Math.min(app.feedbackVerifiedCount, sent)
  return (
    <Metric
      value={sent} max={app.testerSlots} done={ver >= app.testerSlots}
      label={t('apps_fb_bar_label', { sent: Math.min(sent, app.testerSlots), slots: app.testerSlots, ver })}
      note={ver > 0 ? <span className="metric-note">✓{ver}</span> : undefined}
    />
  )
}

function DaysMetric({ app }: { app: AppDoc }) {
  const t = useT()
  const days = counted(app)
  return <Metric value={days} max={TARGET_DAYS} label={t('apps_days_bar_label', { v: days, max: TARGET_DAYS })} />
}

/** Readiness comes from the numbers (eligible >= slots, CLAUDE.md), so it leads; the creator-set status
 *  is demoted to a quiet line when it is behind. Glyph + text, pandan = eligible. Chips stay small: the name leads the row. */
function StatusCell({ row }: { row: Row }) {
  const t = useT()
  const { app, eligible } = row
  const ready = eligible >= app.testerSlots && (app.status === 'recruiting' || app.status === 'testing')
  if (!ready) return <span className="status-cell"><StatusPill status={app.status} /></span>
  return (
    <span className="status-cell">
      <Chip tone="pandan" glyph="✓">{t('apps_chip_ready')}</Chip>
      <span className="status-set">{t('apps_status_set', { status: appStatusText(t, app.status) })}</span>
    </span>
  )
}

function AppChips({ row }: { row: Row }) {
  const { assigned, own, mine } = row
  if (!own && !mine && !assigned) return null
  return (
    <span className="app-chips">
      <MineChips own={own} mine={mine} />
      {assigned && <AssignedChip cohort={assigned.name} />}
    </span>
  )
}

/** The quiet second line: creator (badge and "Belum tes" inline) · didaftarkan … · Kohort #1.
 *  Each dot belongs to the piece after it, which never breaks, so no line starts with a dot. */
function MetaLine({ row, link = false }: { row: Row; link?: boolean }) {
  const t = useT()
  const { app, cohort, belumTes } = row
  const listed = t('apps_registered_on', { when: relDay(app.createdAt) })
  const age = shortAge(t, app.createdAt)
  return (
    <span className="app-meta-line">
      <span className="app-meta-who">
        <span title={app.creatorName}>{app.creatorName}</span>
        <Badge tier={app.creatorBadgeTier} size="sm" />
        {belumTes && (
          <Chip tone="cabai" glyph="!" className="sm">
            {t('landing_cell_late_short')}<span className="sr-only"> {t('apps_late_creator_sr')}</span>
          </Chip>
        )}
      </span>
      <span className="app-meta-piece listed" title={listed}>
        <span aria-hidden="true">· {age}</span><span className="sr-only">{listed}</span>
      </span>
      {cohort && (
        <span className="app-meta-piece">
          <span aria-hidden="true">· </span>
          {link
            ? <Link to={`/cohorts/${cohort.cohortId}`} className="cohort-link" onClick={(e) => e.stopPropagation()}>{cohort.name}</Link>
            : cohort.name}
        </span>
      )}
    </span>
  )
}

/** Short listing age for the meta line: "hari ini", "3 hr lalu", "2 mgg lalu", "4 bln lalu", "1 thn lalu".
 *  The full "didaftarkan 2 minggu lalu" stays in the title and for screen readers. */
function shortAge(t: ReturnType<typeof useT>, createdAt?: number | null) {
  if (createdAt == null) return '—'
  const d = daysAgo(createdAt)
  if (d === 0) return t('apps_age_today')
  if (d < 7) return t('apps_age_days', { n: d })
  if (d < 30) return t('apps_age_weeks', { n: Math.floor(d / 7) })
  if (d < 365) return t('apps_age_months', { n: Math.floor(d / 30) })
  return t('apps_age_years', { n: Math.floor(d / 365) })
}

/** Days Google counts: all slots active together (app_stats.counted_days), capped at the 14 it needs. */
const counted = (app: AppDoc) => Math.min(app.countedDays, TARGET_DAYS)

/** "11 aplikasi · 11 feedback"; a creator who tests nothing yet gets a quiet dash (the words stay for screen readers). */
function CreatorTesting({ app }: { app: AppDoc }) {
  const t = useT()
  const n = app.creatorTestingCount ?? 0
  const f = app.creatorFeedbackSentCount ?? 0
  if (n === 0) {
    return <><span className="dash" aria-hidden="true" title={t('apps_creator_none')}>—</span><span className="sr-only">{t('apps_creator_none')}</span></>
  }
  return <span className="num">{t(n === 1 ? 'apps_creator_summary_one' : 'apps_creator_summary', { n, f })}</span>
}

function DesktopRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { app } = row
  return (
    <tr className="clickable" onClick={onOpen}>
      <td className="app-main">
        <span className="name-line">
          <Link to={`/apps/${app.id}`} className="app-name" onClick={(e) => e.stopPropagation()}>{app.name}</Link>
          <AppChips row={row} />
        </span>
        <MetaLine row={row} link />
      </td>
      <td className="num"><TesterMetric app={app} /></td>
      <td className="num"><FeedbackMetric app={app} /></td>
      <td className="num"><DaysMetric app={app} /></td>
      <td className="num creator-cell"><CreatorTesting app={app} /></td>
      <td className="num"><StatusCell row={row} /></td>
    </tr>
  )
}

/** Below 900 px: a card. Name and status on top, the quiet meta line, then the three counts in one row. */
function PhoneRow({ row }: { row: Row }) {
  const t = useT()
  const nameId = useId()
  const { app } = row
  // The link is named by the app name only; the rest of the card stays readable as its content.
  return (
    <Link to={`/apps/${app.id}`} className="mrow app-card" aria-labelledby={nameId}>
      <span className="l1" id={nameId}>{app.name}</span>
      <span className="r1"><StatusCell row={row} /></span>
      <span className="l2"><MetaLine row={row} /></span>
      {(row.own || row.mine || row.assigned) && <span className="l2"><AppChips row={row} /></span>}
      <span className="card-metrics">
        <span><span className="card-metric-l" aria-hidden="true">{t('apps_prog_testers')}</span><TesterMetric app={app} /></span>
        <span><span className="card-metric-l" aria-hidden="true">{t('apps_prog_feedback')}</span><FeedbackMetric app={app} /></span>
        <span><span className="card-metric-l" aria-hidden="true">{t('apps_prog_days')}</span><DaysMetric app={app} /></span>
      </span>
    </Link>
  )
}
