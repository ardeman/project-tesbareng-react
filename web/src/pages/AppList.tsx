import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Chip, Empty, ErrorBox, Seats, Skel, StatusPill, useToast } from '../components/bits'
import { AssignedChip } from '../components/cohortBits'
import { IconPlus, IconSearch } from '../components/icons'
import { useAuth } from '../lib/auth'
import { usePageMeta } from '../lib/pageMeta'
import { errorText, useApps, useEntriesOf } from '../lib/data'
import { daysActive, openSeats, relDay, TARGET_DAYS } from '../lib/progress'
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
    belumTes: belumTes.data.has(app.id),
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
                <th className="col-id">{t('apps_col_app')}</th>
                <th>{t('apps_col_active_testers')}</th>
                <th className="num md-hide">{t('apps_col_counted_days')}</th>
                <th className="num">{t('apps_col_feedback_play')}</th>
                <th className="md-hide">{t('apps_col_creator_testing')}</th>
                <th>{t('apps_col_status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td className="cell-2"><Skel w={160} /><br /><Skel w={110} h={12} /></td>
                      <td><Skel w={150} /></td><td className="num md-hide"><Skel w={40} /></td><td className="num"><Skel w={90} /></td>
                      <td className="md-hide"><Skel w={140} /></td><td><Skel w={120} h={24} /></td>
                    </tr>
                  ))
                : shown.map((r) => <DesktopRow key={r.app.id} row={r} onOpen={() => navigate(`/apps/${r.app.id}`)} />)}
            </tbody>
          </table>
        </div>
        <div className="mlist">
          {loading
            ? Array.from({ length: 5 }, (_, i) => <div className="mrow" key={i}><Skel w={150} /><Skel w={40} /><span className="l2"><Skel w={220} h={12} /></span></div>)
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

/** ADR-012 §6: open seats against the app's slots. Chip removed — the X/slots count already conveys this. */
function SlotChip(_: { app: AppDoc }) {
  return null
}

function SeatCell({ app }: { app: AppDoc }) {
  return (
    <span className="seat-cell">
      <Seats active={app.activeTesterCount} total={app.testerSlots} />
      <span className="seat-count num">{app.activeTesterCount}<small> / {app.testerSlots}</small></span>
      <SlotChip app={app} />
    </span>
  )
}

/** Days Google counts: all slots active together (app_stats.counted_days), capped at the 14 it needs. */
const counted = (app: AppDoc) => Math.min(app.countedDays, TARGET_DAYS)

function creatorLine(app: AppDoc) {
  const t = app.creatorTestingCount ?? 0
  const f = app.creatorFeedbackSentCount ?? 0
  const v = app.creatorFeedbackVerifiedCount ?? 0
  return { t, f, v }
}

function DesktopRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const t = useT()
  const { app, cohort, assigned, belumTes, own, mine } = row
  const c = creatorLine(app)
  return (
    <tr className="clickable" onClick={onOpen}>
      <td className="cell-2">
        <div className="name-line">
          <Link to={`/apps/${app.id}`} onClick={(e) => e.stopPropagation()}><b>{app.name}</b></Link>
          <MineChips own={own} mine={mine} />
          {assigned && <AssignedChip cohort={assigned.name} />}
          {belumTes && <Chip tone="cabai" glyph="!">{t('landing_cell_late_short')}</Chip>}
        </div>
        {/* One meta line only — creator testing stays in its own column when there is room (not folded in). */}
        <span className="app-meta">
          {app.creatorName}
          <Badge tier={app.creatorBadgeTier} size="sm" />
          {t('apps_registered_on', { when: relDay(app.createdAt) })}
          {cohort && <> · {cohort.name}</>}
        </span>
      </td>
      <td className="cell-2">
        <SeatCell app={app} />
        {/* Folded days: compact X/14, not a full sentence under the seats. */}
        <span className="md-show num app-days-fold">{counted(app)} / {TARGET_DAYS}</span>
      </td>
      <td className="num md-hide"><b>{counted(app)}</b><span className="of"> / {TARGET_DAYS}</span></td>
      <td className="num">
        {app.feedbackSentCount === 0
          ? <span className="dash">0</span>
          : (
            <>
              <b>{app.feedbackSentCount}</b>
              {app.feedbackVerifiedCount > 0 && (
                <span className="muted fb-ver">{t('apps_feedback_verified_n', { n: app.feedbackVerifiedCount })}</span>
              )}
            </>
          )}
      </td>
      <td className="muted md-hide">
        <span className="creator-nums">
          {c.t === 0
            ? <span>{t('apps_creator_none')}</span>
            : <span><b style={{ color: 'var(--ink)' }}>{t('apps_creator_apps_feedback', { n: c.t })}</b>{t('apps_creator_feedback_n', { n: c.f })}</span>}
        </span>
      </td>
      <td><StatusPill status={app.status} /></td>
    </tr>
  )
}

function PhoneRow({ row }: { row: Row }) {
  const t = useT()
  const { app, cohort, assigned, belumTes, own, mine } = row
  return (
    <Link to={`/apps/${app.id}`} className="mrow">
      <span className="l1">{app.name}</span>
      <span className="r1 num">{app.activeTesterCount}<span className="of"> / {app.testerSlots}</span></span>
      <span className="l2">
        <Seats active={app.activeTesterCount} total={app.testerSlots} />
        <SlotChip app={app} />
        <span className="num">{counted(app)} / {TARGET_DAYS}</span>
        {app.feedbackSentCount > 0 && <span className="num">feedback {app.feedbackSentCount}</span>}
      </span>
      <span className="l2">
        <StatusPill status={app.status} />
        <MineChips own={own} mine={mine} />
        {assigned && <AssignedChip cohort={assigned.name} />}
        {belumTes && <Chip tone="cabai" glyph="!">{t('landing_cell_late_short')}</Chip>}
        <span className="app-meta">
          {app.creatorName}
          <Badge tier={app.creatorBadgeTier} size="sm" />
          {cohort && <span className="mrow-cohort"> · {cohort.name}</span>}
        </span>
      </span>
    </Link>
  )
}
