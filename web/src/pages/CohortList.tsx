// B2 · Cohort list (PRD §10 "Cohort list", §6.9). Public: visitors read it too.
// Grouped by status: Aktif first (where the work is), then Sedang dibentuk (where you can still join),
// then Selesai, folded by default because it only grows.
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Empty, ErrorBox, Skel } from '../components/bits'
import { IconChevron } from '../components/icons'
import { usePageMeta } from '../lib/pageMeta'
import { fmtDate } from '../lib/progress'
import { CLOSE_DAY, cohortDay, fmtWib, joinDeadline, joinOpen, LAST_JOIN_DAY, MIN_APPS, useCohorts, type CohortDoc } from '../lib/cohorts'
import { CohortChip } from '../components/cohortBits'
import { useT } from '../lib/i18n'

export function CohortList() {
  const t = useT()
  const cohorts = useCohorts()
  usePageMeta('Cohort', t('cohort_list_meta_desc'))
  const [showClosed, setShowClosed] = useState(false)
  const closedId = useId()

  const groups = useMemo(() => {
    const by = { active: [] as CohortDoc[], forming: [] as CohortDoc[], closed: [] as CohortDoc[] }
    for (const c of cohorts.data) by[c.status].push(c)
    // Closed: most recently closed first (the list arrives newest-created first).
    by.closed.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    return by
  }, [cohorts.data])

  const loading = cohorts.loading
  const total = cohorts.data.length
  const open = groups.forming.length + groups.active.filter((c) => joinOpen(c)).length

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Cohort</h1>
          <p className="sub">
            {loading ? <Skel w={360} h={16} /> : total === 0
              ? t('cohort_list_meta_desc')
              : <>{open > 0 ? <b>{t('cohort_list_open', { n: open })}</b> : t('cohort_list_none_open')} {t('cohort_list_duration', { n: CLOSE_DAY })} <Link className="link" to="/about">{t('cohort_how_link')}</Link></>}
          </p>
        </div>
      </div>

      {cohorts.error && <ErrorBox text={t('cohort_list_error')} onRetry={cohorts.retry} />}

      {loading ? (
        <section className="cohort-group" aria-busy="true" aria-label={t('cohort_list_loading')}>
          <div className="panel flush cohort-rows">{[0, 1, 2].map((i) => <RowSkeleton key={i} />)}</div>
        </section>
      ) : !cohorts.error && total === 0 ? (
        // ADR-001 §2.6: spot illustration slot (Empty `art`) once the asset pipeline exists.
        <Empty title={t('cohort_list_empty_title')}>
          <p>{t('cohort_list_empty_body')}</p>
          <Link className="text-action" to="/apps">{t('cohort_list_empty_link')}</Link>
        </Empty>
      ) : (
        <>
          <Group id="active" title={t('cohort_group_active')} note={t('cohort_group_active_note')} list={groups.active} />
          <Group id="forming" title={t('cohort_group_forming')} note={t('cohort_group_forming_note', { n: MIN_APPS })} list={groups.forming} />
          {groups.closed.length > 0 && (
            <section className="cohort-group" aria-labelledby="g-closed">
              <h2 id="g-closed" className="group-title">
                <button type="button" className="cohort-fold" aria-expanded={showClosed} aria-controls={closedId} onClick={() => setShowClosed((s) => !s)}>
                  <IconChevron />{t('cohort_group_closed')}<span className="n num">{groups.closed.length}</span>
                </button>
              </h2>
              {showClosed && (
                <div id={closedId} className="panel flush cohort-rows">
                  {groups.closed.map((c) => <CohortRow key={c.id} c={c} />)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}

function Group({ id, title, note, list }: { id: string; title: string; note: string; list: CohortDoc[] }) {
  if (list.length === 0) return null
  return (
    <section className="cohort-group" aria-labelledby={`g-${id}`}>
      <div className="group-head">
        <h2 id={`g-${id}`} className="group-title">{title}<span className="n num">{list.length}</span></h2>
        <p className="meta">{note}</p>
      </div>
      <div className="panel flush cohort-rows">
        {list.map((c) => <CohortRow key={c.id} c={c} />)}
      </div>
    </section>
  )
}

function CohortRow({ c }: { c: CohortDoc }) {
  const t = useT()
  const day = cohortDay(c)
  const members = (
    <span className="num">
      <b>{c.appCount}</b> {t('cohort_row_apps_unit')} · <b>{c.pureTesterCount}</b> {t('cohort_row_pure_unit')}
    </span>
  )
  let when: string
  if (c.status === 'forming') when = t('cohort_row_created', { date: fmtDate(c.createdAt) })
  else if (c.status === 'active') when = t('cohort_row_active_dates', { start: fmtDate(c.day0At), end: fmtDate(c.day0At! + CLOSE_DAY * 86_400_000) })
  else when = t('cohort_row_closed_dates', { start: fmtDate(c.day0At), end: fmtDate(c.closedAt) })

  return (
    <Link to={`/cohorts/${c.id}`} className="cohort-row">
      <span className="cr-main">
        <span className="cr-name"><b>{c.name}</b><CohortChip status={c.status} /></span>
        <span className="cr-meta num">{when}</span>
      </span>

      <span className="cr-progress">
        {c.status === 'active' && day != null && (
          <>
            <span className="cr-day num"><b>{t('cohort_row_day_of', { day, max: CLOSE_DAY })}</b>{day > CLOSE_DAY && <> · {t('cohort_row_waiting_close')}</>}</span>
            <Bar value={Math.min(day, CLOSE_DAY)} max={CLOSE_DAY} label={t('cohort_bar_active', { name: c.name, day, max: CLOSE_DAY })} />
          </>
        )}
        {c.status === 'forming' && (
          <>
            <span className="cr-day num"><b>{t('cohort_row_apps_of', { n: c.appCount, min: MIN_APPS })}</b></span>
            <Bar value={Math.min(c.appCount, MIN_APPS)} max={MIN_APPS} label={t('cohort_bar_forming', { name: c.name, n: c.appCount, min: MIN_APPS })} />
          </>
        )}
        {c.status === 'closed' && day != null && <span className="cr-day num">{t('cohort_row_closed_at_day', { day })}</span>}
      </span>

      <span className="cr-side">
        {members}
        {c.status === 'active' && joinOpen(c) && <span className="cr-open">{t('cohort_row_join_active', { day: LAST_JOIN_DAY - 1, time: fmtWib(joinDeadline(c.day0At)!, true) })}</span>}
        {c.status === 'forming' && <span className="cr-open">{t('cohort_row_join_forming')}</span>}
      </span>
    </Link>
  )
}

function RowSkeleton() {
  return (
    <div className="cohort-row" aria-hidden="true">
      <span className="cr-main"><Skel w={160} h={20} /><Skel w={220} h={12} /></span>
      <span className="cr-progress"><Skel w={120} /><Skel w="100%" h={16} /></span>
      <span className="cr-side"><Skel w={150} /></span>
    </div>
  )
}
