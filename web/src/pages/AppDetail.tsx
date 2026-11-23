import { Fragment, forwardRef, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Avatar, Badge, Bar, Chip, Dialog, Empty, ErrorBox, failToast, FeedbackChip, NotFound, OverflowMenu, RelTime, Seats, ShowAll, Skel,
  StatusPill, TesterChip, useToast, type MenuItem,
} from '../components/bits'
import { IconBack, IconChevron, IconExternal, IconPlus, IconSort, IconSortNone } from '../components/icons'
import { Board, BoardLegend } from '../components/Board'
import { BuildDialog, FeedbackDialog, JoinDialog, ManualTesterDialog, TesterDialog } from '../components/dialogs'
import { AssignedChip } from '../components/cohortBits'
import { useAuth } from '../lib/auth'
import { useMyAssignedApps } from '../lib/cohorts'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { usePageMeta } from '../lib/pageMeta'
import { api, errorCode, markEmailListed, updateTesterAsCreator, useApp, useBadgesOf, useBuilds, useEmailListings, useMyEmailListing, useTesters } from '../lib/data'
import { checkIn, milestones, useCheckIns, type CheckIn, type CheckInKind, type Milestone } from '../lib/checkins'
import { useT } from '../lib/i18n'
import type { Keys } from '../locales/id'
import {
  groupPlayStepsDone, hasStoreUrl, isLikelyMobile, isLiveApp, markResumeJoin, openPlayInstall, playInstallUrl,
  readGroupJoinProgress, takeResumeJoin, writeGroupJoinProgress, type GroupJoinProgress,
} from '../lib/joinProgress'
import {
  computeProgress, daysActive, fmtDate, fmtDateTime, fmtDayHeading, inDays, isNewBuild, isoDate, openSeats, relTime, TARGET_BUILDS, TARGET_DAYS, TARGET_TESTERS,
  type Progress,
} from '../lib/progress'
import type { AppDoc, BuildDoc, TesterDoc, TesterStatus } from '../lib/types'

type DialogKind = null | 'join' | 'feedback' | 'build' | 'manual' | 'leave' | { tester: TesterDoc }

type Tr = ReturnType<typeof useT>

function testerStatusTr(t: Tr, s: TesterStatus): string {
  return t(`tester_status_${s}` as Keys)
}

function milestoneLabelTr(t: Tr, m: Milestone): string {
  if (m.kind === 'updated_build') {
    return t('appd_ci_updated_version', { version: m.label })
  }
  const key: Record<Exclude<CheckInKind, 'updated_build'>, Keys> = {
    used_app: 'appd_ci_used_app',
    still_opted_in: 'appd_ci_still_opted_in',
  }
  return t(key[m.kind as Exclude<CheckInKind, 'updated_build'>])
}

function playOpenLabel(t: Tr, storeOk: boolean, live: boolean): string {
  return storeOk || live ? t('appd_act_open_play_store') : t('appd_act_open_optin')
}

/** One action in the header zone: the primary, a secondary, or an overflow item (ADR-009 §1, §7). */
interface Action { label: string; icon?: ReactNode; onClick?: () => void; href?: string; to?: string; busy?: boolean; blocked?: boolean }
interface Actions { primary?: Action; secondary: Action[]; overflow: MenuItem[]; note?: string }

export function AppDetail() {
  const t = useT()
  const { id } = useParams()
  const app = useApp(id)
  const testers = useTesters(id)
  const builds = useBuilds(id)
  const { user, isAdmin, signIn } = useAuth()
  // "Ditugaskan" in the header (PRD §5.2 step 2). If it fails to load, the label is simply absent.
  const myAssigned = useMyAssignedApps(user?.uid)
  const toast = useToast()
  const [dialog, setDialog] = useState<DialogKind>(null)
  // Placed only once app, testers and builds are in, so the KPI block does not jump after first paint.
  const kpiPlace = useKpiPlacement(!!app.data && !testers.loading && !builds.loading)
  usePageMeta(
    app.data && !app.data.deleted ? app.data.name : t('nav_apps'),
    app.data && !app.data.deleted ? app.data.description : undefined,
    app.data && !app.data.deleted && id
      ? { image: `/api/og/app?id=${encodeURIComponent(id)}`, url: `/apps/${id}` }
      : undefined,
  )

  const progress = useMemo(
    () => (app.data ? computeProgress(app.data, testers.data, builds.data) : null),
    [app.data, testers.data, builds.data],
  )
  // Called before the early returns (hook order); only loads for the member's own Active entry.
  const ownActive = user ? testers.data.find((t) => t.uid === user.uid && t.status === 'active') : undefined
  // Email-list apps (ADR-011): the header follows the member's own request (ask → wait → opt in).
  const emailFlow = !!app.data && app.data.testerMethod === 'email_list' && !!user && app.data.creatorUid !== user.uid && !isAdmin
  const myListing = useMyEmailListing(emailFlow ? id : undefined, user?.uid)
  const flow = useCheckInFlow(id, user && app.data && !app.data.deleted && app.data.creatorUid !== user.uid && !isAdmin ? ownActive : undefined, builds.data.map((b) => b.id).join(','))
  const guideRef = useRef<HTMLElement>(null)
  const [guideTick, setGuideTick] = useState(0)
  const appId = app.data?.id
  const groupProgress = useMemo(() => (appId ? readGroupJoinProgress(appId) : {}), [appId, guideTick])

  // After Google OAuth, reopen the join wizard on this app.
  useEffect(() => {
    if (!user || !appId) return
    const resume = takeResumeJoin()
    if (resume === appId) setDialog('join')
  }, [user, appId])

  if (app.error) return <ErrorBox text={t('form_load_error')} onRetry={app.retry} />
  if (app.data === null || (app.data && app.data.deleted && !isAdmin)) return <NotFound what={t('nav_apps')} />
  if (!app.data || !progress) return <DetailSkeleton />

  const a = app.data
  const isCreator = !!user && (user.uid === a.creatorUid || isAdmin)
  const mine = user ? testers.data.find((t) => t.uid === user.uid) : undefined
  const loading = testers.loading || builds.loading
  const playUrl = playInstallUrl(a)
  const storeOk = hasStoreUrl(a)
  const isBeginner = !isCreator && mine?.status !== 'active' && mine?.status !== 'removed'

  const needLogin = async (then: DialogKind) => {
    try {
      if (!user) {
        if (then === 'join') markResumeJoin(a.id)
        await signIn()
      }
      setDialog(then)
    } catch (e) { toast(failToast(e)) }
  }

  const focusGuide = () => {
    guideRef.current?.scrollIntoView({ block: 'start' })
    guideRef.current?.focus({ preventScroll: true })
  }

  const openJoinOrLogin = () => { void needLogin('join') }

  // ADR-009 §1: one primary per role, up to two secondary, the rest behind "…".
  const actions: Actions = (() => {
    const live = isLiveApp(a)
    const playLabel = playOpenLabel(t, storeOk, live)
    if (isCreator) {
      const overflow: MenuItem[] = []
      if (storeOk) overflow.push({ label: t('appd_act_open_play_page'), href: a.storeUrl! })
      if (a.optInUrl) overflow.push({ label: t('appd_act_open_optin'), href: a.optInUrl })
      overflow.push({ label: t('appd_act_share_whatsapp'), onSelect: () => shareToWhatsApp(t, a.name, openSeats(a), a.id) })
      return {
        primary: { label: t('dlg_build_submit'), icon: <IconPlus />, onClick: () => setDialog('build') },
        secondary: [
          { label: t('dlg_manual_label'), onClick: () => setDialog('manual') },
          { label: t('form_title_edit'), to: `/apps/${a.id}/edit` },
        ],
        overflow,
      }
    }
    if (mine?.status === 'active') {
      const since = mine.feedbackSentAt ?? mine.optedInAt
      const latest = builds.data[0]
      const buildWaiting = isNewBuild(a) && a.lastBuildAt != null && a.lastBuildAt > since && !(latest && flow.isDone('updated_build', latest.id))
      const leave: MenuItem = { label: t('appd_act_stop_testing'), danger: true, onSelect: () => setDialog('leave') }
      const play: Action = { label: playLabel, icon: <IconExternal />, href: playUrl }
      const editNote: Action = { label: live ? t('appd_act_edit_review_note') : t('appd_act_edit_feedback_note'), onClick: () => setDialog('feedback') }
      if (!mine.feedbackSent) {
        return {
          primary: { label: live ? t('appd_act_mark_review_sent') : t('dlg_mark_sent'), onClick: () => setDialog('feedback') },
          secondary: [play],
          overflow: [leave],
        }
      }
      if (buildWaiting) return { primary: { label: t('appd_act_test_new_build'), icon: <IconExternal />, href: playUrl }, secondary: [editNote], overflow: [leave] }
      const next = flow.next
      if (next) {
        const label = milestoneLabelTr(t, next)
        const primary: Action = { label: t('appd_act_checkin', { label }), onClick: () => flow.run(next), busy: flow.pending === next.key, blocked: !!flow.pending && flow.pending !== next.key }
        return { primary, secondary: [play, editNote], overflow: [leave] }
      }
      return { secondary: [play, editNote], overflow: [leave] }
    }
    const playAction: Action = { label: playLabel, icon: <IconExternal />, href: playUrl }
    const storeOverflow: MenuItem[] = []
    if (storeOk && a.optInUrl) storeOverflow.push({ label: t('appd_act_optin_backup'), href: a.optInUrl })
    storeOverflow.push({ label: t('appd_act_share_whatsapp'), onSelect: () => shareToWhatsApp(t, a.name, openSeats(a), a.id) })
    if (mine?.status === 'removed') return { secondary: [playAction], overflow: storeOverflow }
    if (live) {
      if (groupPlayStepsDone(groupProgress)) {
        return {
          primary: { label: t('appd_act_record_reviewer'), onClick: openJoinOrLogin },
          secondary: [playAction],
          overflow: storeOverflow,
          note: user ? t('appd_note_live_installed_logged') : t('appd_note_live_installed_anon'),
        }
      }
      return {
        primary: { label: t('appd_act_start_review'), onClick: focusGuide },
        secondary: [playAction],
        overflow: storeOverflow,
        note: t('appd_note_live_flow'),
      }
    }
    if (a.testerMethod === 'email_list') {
      const l = myListing.data
      if (user && myListing.loading) return { secondary: [], overflow: storeOverflow }
      if (!l) {
        return {
          primary: { label: t('appd_act_request_add'), onClick: () => needLogin('join') },
          secondary: [],
          overflow: storeOverflow,
          note: user ? t('appd_note_email_request_logged') : t('appd_note_email_request_anon'),
        }
      }
      if (l.listedAt == null) {
        return {
          secondary: [{ label: t('appd_act_view_request'), onClick: () => setDialog('join') }],
          overflow: storeOverflow,
          note: t('appd_note_email_waiting', { date: fmtDate(l.requestedAt) }),
        }
      }
      return {
        primary: { label: t('appd_act_continue_install'), onClick: () => setDialog('join') },
        secondary: [playAction],
        overflow: storeOverflow,
        note: t('appd_note_email_ready'),
      }
    }
    if (groupPlayStepsDone(groupProgress)) {
      return {
        primary: { label: t('appd_act_record_tester'), onClick: openJoinOrLogin },
        secondary: [playAction],
        overflow: storeOverflow,
        note: user ? t('appd_note_play_done_logged') : t('appd_note_play_done_anon'),
      }
    }
    return {
      primary: { label: t('appd_act_start_test'), onClick: focusGuide },
      secondary: [playAction],
      overflow: storeOverflow,
      note: storeOk ? t('appd_note_beginner_store') : t('appd_note_beginner_optin'),
    }
  })()

  return (
    <>
      <Link to="/apps" className="crumb"><IconBack />{t('nav_apps')}</Link>
      <RecordHead app={a} p={progress} loading={testers.loading} actions={actions} assigned={myAssigned.data.get(a.id)} />

      <Finding app={a} p={progress} loading={loading} description={a.description} />

      {isNewBuild(a) && builds.data[0] && !(mine?.status === 'active' && flow.isDone('updated_build', builds.data[0].id)) && (
        <div className="notice info" role="status">
          <span>{t('appd_new_build_line', { version: builds.data[0].versionName, time: relTime(builds.data[0].uploadedAt) })}</span>
          <span className="spacer" />
          <a className="link" href={playUrl} target="_blank" rel="noreferrer">{t('appd_open_in_play')}</a>
        </div>
      )}

      <div className="grid">
        {/* Beginners: guide first so social-share visitors see how to install before the KPI board. */}
        {isBeginner && (
          <BeginnerGuide
            ref={guideRef}
            app={a}
            progress={groupProgress}
            emailListed={a.testerMethod === 'email_list' ? (myListing.data ? (myListing.data.listedAt ? 'listed' : 'waiting') : (user ? 'none' : 'signed_out')) : undefined}
            onProgress={() => setGuideTick((n) => n + 1)}
            onRecord={openJoinOrLogin}
            onAskEmail={() => needLogin('join')}
            onOpenJoin={() => setDialog('join')}
          />
        )}

        {/* KPIs move under the board only when the aside is clearly taller (few seats); otherwise full width below both. */}
        <div className="span-8 col-fill">
          <section className="panel" aria-labelledby="board-h" ref={kpiPlace.board}>
            <header>
              <h2 id="board-h" className="num">{t('appd_board_heading', { target: progress.target })}</h2>
              <BoardLegend />
            </header>
            {testers.error ? <ErrorBox text={t('appd_testers_load_error')} onRetry={testers.retry} /> : <Board seats={progress.seats} loading={testers.loading} total={progress.target} counted={progress.testDay} />}
          </section>
          {kpiPlace.beside && <Kpis p={progress} app={a} loading={loading} />}
        </div>

        <aside className="span-4 col-fill" ref={kpiPlace.aside}>
          <InfoPanel app={a} p={progress} mine={mine} isCreator={isCreator} flow={flow} beginnerGuideOutside={isBeginner} />
          <CreatorCard app={a} />
        </aside>

        {!kpiPlace.beside && <Kpis p={progress} app={a} loading={loading} wide />}

        <TesterTable
          app={a} testers={testers.data} loading={testers.loading} isCreator={isCreator} myUid={user?.uid}
          appPassed={progress.testDay >= TARGET_DAYS}
          onEdit={(t) => setDialog({ tester: t })}
        />

        {a.testerMethod === 'email_list' && user?.uid === a.creatorUid && <EmailListPanel app={a} />}

        <section className="panel split-host span-12" aria-label={t('appd_build_feedback_aria')}>
          <div className="split">
            <BuildLog builds={builds.data} loading={builds.loading} error={builds.error} retry={builds.retry} p={progress} app={a} isCreator={isCreator} />
            <FeedbackList testers={testers.data} loading={testers.loading} />
          </div>
        </section>
      </div>

      <JoinDialog open={dialog === 'join'} onClose={() => setDialog(null)} app={a} rejoin={mine?.status === 'left'} />
      <FeedbackDialog open={dialog === 'feedback'} onClose={() => setDialog(null)} app={a} entry={mine} />
      <BuildDialog open={dialog === 'build'} onClose={() => setDialog(null)} app={a} />
      <ManualTesterDialog open={dialog === 'manual'} onClose={() => setDialog(null)} app={a} />
      <TesterDialog open={typeof dialog === 'object' && dialog !== null} onClose={() => setDialog(null)} app={a} tester={typeof dialog === 'object' && dialog ? dialog.tester : undefined} />
      {mine?.status === 'active' && <LeaveDialog open={dialog === 'leave'} onClose={() => setDialog(null)} app={a} days={daysActive(mine)} />}
    </>
  )
}

// ---------- header zone: name, status, slot progress (ADR-012), the role's actions (ADR-009 §4) ----------

function ActionButton({ a, primary, small }: { a: Action; primary?: boolean; small?: boolean }) {
  const t = useT()
  const cls = `btn ${primary ? 'primary' : ''} ${small ? 'sm' : ''}`
  if (a.href) return <a className={cls} href={a.href} target="_blank" rel="noreferrer">{a.icon}{a.label}</a>
  if (a.to) return <Link className={cls} to={a.to}>{a.icon}{a.label}</Link>
  return (
    <button type="button" className={cls} onClick={a.blocked ? undefined : a.onClick} aria-busy={a.busy || undefined} aria-disabled={a.blocked || undefined}>
      {a.icon}{a.busy ? t('saving') : a.label}
    </button>
  )
}

function RecordHead({ app, p, loading, actions, assigned }: {
  app: AppDoc; p: Progress; loading: boolean; actions: Actions; assigned?: { cohortId: string; name: string }
}) {
  const t = useT()
  const head = useRef<HTMLElement>(null)
  const [stuck, setStuck] = useState(false)
  // Once the header scrolls away, a slim bar keeps name, progress and the primary action in view.
  useEffect(() => {
    const el = head.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  // Google counts a day only while all slots are active together: the same clock as the board's pandan columns.
  const counted = Math.min(p.testDay, TARGET_DAYS)
  const count = loading ? <Skel w={56} h={24} /> : <><b>{counted}</b><small> / {TARGET_DAYS}</small></>
  const daysLabel = t('appd_days_seats_label', { counted, target: TARGET_DAYS, active: p.active, slots: p.target })
  return (
    <>
      <header ref={head} className="record-head">
        <div className="rh-main">
          <h1>{app.name}</h1>
          <div className="meta-line">
            <StatusPill status={app.status} />
            <Link to={`/u/${app.creatorUid}`} className="creator-link">
              <Avatar name={app.creatorName} photo={app.creatorPhotoURL} /><span>{app.creatorName}</span>
            </Link>
            {assigned && (
              <Link to={`/cohorts/${assigned.cohortId}`} className="creator-link">
                <AssignedChip /><span className="assigned-via">{t('appd_assigned_via', { name: assigned.name })}</span>
              </Link>
            )}
            {app.packageName && <span className="pkg">{app.packageName}</span>}
          </div>
        </div>
        <div className="rh-progress">
          <p className="rh-count num">{count}<span className="rh-label">{t('appd_days_counted')}</span></p>
          <Seats active={counted} eligible={counted} total={TARGET_DAYS} className="wide" label={daysLabel} />
          <p className="rh-sub num">{p.active >= p.target ? t('appd_seats_full', { active: p.active, target: p.target }) : t('appd_seats_open', { active: p.active, target: p.target })}</p>
        </div>
        <div className="rh-actions">
          {actions.primary && <ActionButton a={actions.primary} primary />}
          {(actions.secondary.length > 0 || actions.overflow.length > 0) && (
            <div className="rh-more">
              {actions.secondary.slice(0, 2).map((a) => <ActionButton key={a.label} a={a} />)}
              <OverflowMenu items={actions.overflow} label={t('more_actions')} />
            </div>
          )}
          {actions.note && <p className="muted small">{actions.note}</p>}
        </div>
      </header>
      <div className={`record-bar ${stuck ? 'show' : ''}`} inert={!stuck} aria-hidden={!stuck}>
        <span className="rb-name">{app.name}</span>
        <span className="rb-count num"><b>{Math.min(p.testDay, TARGET_DAYS)}</b> / {TARGET_DAYS}<span className="sr-only"> {t('appd_days_counted')}</span></span>
        {actions.primary && <ActionButton a={actions.primary} primary small />}
      </div>
    </>
  )
}

function Finding({ app, p, loading, description }: { app: AppDoc; p: Progress; loading: boolean; description: string }) {
  const t = useT()
  if (loading) return <div className="finding"><Skel w={420} h={20} /></div>
  const outside = p.target < TARGET_TESTERS ? TARGET_TESTERS - Math.max(p.active, p.target) : 0
  let text: string
  if (app.status === 'live') {
    text = p.active > 0
      ? t('appd_find_live_active', { active: p.active })
      : t('appd_find_live_idle')
  }
  else if (p.ready) text = t('appd_find_ready', { eligible: p.eligible })
  else if (p.active < p.target) {
    const need = p.target - p.active
    text = t('appd_find_need_more', { need }) + (p.active > 0 ? t('appd_find_need_fast', { target: p.target }) : t('appd_find_need_none'))
  } else {
    text = t('appd_find_seats_filled', { counted: p.testDay, days: TARGET_DAYS }) +
      t('appd_find_seats_ready', { when: inDays(TARGET_DAYS - p.testDay), target: p.target })
  }
  return (
    <div className="finding">
      <p className="verdict num">{text}</p>
      {outside > 0 && (
        <p className="muted small num">
          {t('appd_find_target_base', { target: p.target })}{p.active > p.target ? t('appd_find_target_extra', { active: p.active }) : ''}{t('appd_find_target_outside', { outside })}
        </p>
      )}
      <p className="desc">{description}</p>
      {p.lowEngagement && app.status !== 'live' && (
        <p className="flag">
          <Chip glyph="!">{t('appd_low_engagement')}</Chip>
          <span>{p.builds === 0 ? t('appd_low_engagement_no_build') : t('appd_low_engagement_low_fb')}{t('appd_low_engagement_google')}</span>
        </p>
      )}
    </div>
  )
}

/** Context for the role; the actions themselves live in the header zone. */
function InfoPanel({ app, p, mine, isCreator, flow, beginnerGuideOutside }: {
  app: AppDoc; p: Progress; mine?: TesterDoc; isCreator: boolean; flow: CheckInFlow; beginnerGuideOutside?: boolean
}) {
  const t = useT()
  const sentBefore = useRef(mine?.feedbackSent)
  const [stamp, setStamp] = useState(false)
  useEffect(() => {
    if (mine?.feedbackSent && sentBefore.current === false) setStamp(true)
    sentBefore.current = mine?.feedbackSent
  }, [mine?.feedbackSent])
  const guide = app.feedbackGuide ? (
    <div className="stack-8">
      <h3>{t('form_preview_title')}</h3>
      <TestingMissions guide={app.feedbackGuide} appId={app.id} uid={mine?.uid ?? undefined} />
    </div>
  ) : (
    <p className="muted">{t('appd_guide_empty')}</p>
  )

  if (isCreator) {
    return (
      <section className="panel stack-16" aria-label={t('appd_panel_your_app_aria')}>
        <h2>{t('appd_panel_your_app')}</h2>
        <dl className="kv">
          <dt>{t('appd_panel_unverified')}</dt><dd className="num">{p.feedbackSent - p.feedbackVerified}</dd>
          <dt>{t('appd_panel_unreplied')}</dt><dd className="num">{p.feedbackSent - p.replied}</dd>
        </dl>
        <p className="muted small">{t('appd_panel_play_console_hint')}</p>
        {guide}
      </section>
    )
  }

  if (mine?.status === 'active') {
    const d = daysActive(mine)
    return (
      <section className="panel stack-16" aria-label={t('appd_panel_tester_aria')}>
        <div>
          <h2>{t('appd_panel_you_tester')}</h2>
          <p className="lead-num num" style={{ marginTop: 'var(--s-2)' }}>{Math.min(d, 999)}<small> / {TARGET_DAYS}{t('apps_days_unit')}</small></p>
          <div style={{ marginTop: 'var(--s-2)' }}><Bar value={Math.min(d, TARGET_DAYS)} max={TARGET_DAYS} label={t('appd_panel_your_days')} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--s-2)' }}>
            <p className="muted small num" style={{ margin: 0 }}>{t('appd_panel_since', { date: fmtDate(mine.optedInAt) })}</p>
            {mine.optedInAt && (
              <button
                type="button"
                className="text-action"
                style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                onClick={() => {
                  const targetDay = d < 5 ? 5 : TARGET_DAYS
                  const targetTime = new Date(mine.optedInAt + targetDay * 24 * 60 * 60 * 1000)
                  const title = targetDay === 5 ? t('appd_cal_title_day5', { name: app.name }) : t('appd_cal_title_day14', { name: app.name })
                  const desc = t('appd_cal_desc', { name: app.name, url: window.location.href })
                  window.open(createCalendarUrl(title, desc, targetTime), '_blank')
                }}
                title={t('appd_cal_btn_title')}
              >
                {t('appd_cal_btn')}
              </button>
            )}
          </div>
        </div>
        <CheckIns flow={flow} />
        {mine.feedbackSent ? (
          <div className="stack-8">
            <p className="creator-nums">
              <span className="strong">{t('appd_feedback_word')}</span>
              <FeedbackChip t={mine} className={stamp ? 'stamp' : undefined} />
              {mine.feedbackSentAt && <RelTime t={mine.feedbackSentAt} />}
              {mine.replied && <span className="muted small">{t('appd_replied')}</span>}
            </p>
            {mine.feedbackSummary && <p className="guide-quote">{mine.feedbackSummary}</p>}
          </div>
        ) : guide}
      </section>
    )
  }

  if (mine?.status === 'removed') {
    return (
      <section className="panel stack-8" aria-label={t('appd_panel_removed_aria')}>
        <h2>{t('appd_panel_removed')}</h2>
        <p className="muted">{t('appd_panel_removed_body')}{mine.note ? `: “${mine.note}”` : '.'}{t('appd_panel_removed_contact')}</p>
      </section>
    )
  }

  // When BeginnerGuide sits above the board, this panel only keeps the feedback missions.
  if (beginnerGuideOutside) {
    return (
      <section className="panel stack-16" aria-label={t('appd_panel_after_install')}>
        <h2>{mine?.status === 'left' ? t('appd_panel_retest') : t('appd_panel_after_install')}</h2>
        {mine?.status === 'left' && <p className="muted">{t('appd_panel_left_on', { date: fmtDate(mine.leftAt) })}</p>}
        <p className="muted small">{t('appd_panel_after_hint')}</p>
        {guide}
      </section>
    )
  }

  return (
    <section className="panel stack-16" aria-label={t('appd_panel_join_test_aria')}>
      <h2>{mine?.status === 'left' ? t('appd_panel_retest') : t('appd_panel_join_test')}</h2>
      {mine?.status === 'left' && <p className="muted">{t('appd_panel_left_on', { date: fmtDate(mine.leftAt) })}</p>}
      {guide}
    </section>
  )
}

type EmailGuideState = 'signed_out' | 'none' | 'waiting' | 'listed'

/** Play-first path for social-share visitors: Group → Play Store → Catat (no login until Catat). */
const BeginnerGuide = forwardRef(function BeginnerGuide({
  app, progress, emailListed, onProgress, onRecord, onAskEmail, onOpenJoin,
}: {
  app: AppDoc
  progress: GroupJoinProgress
  emailListed?: EmailGuideState
  onProgress: () => void
  onRecord: () => void
  onAskEmail: () => void
  onOpenJoin: () => void
}, ref: Ref<HTMLElement>) {
  const tr = useT()
  const playUrl = playInstallUrl(app)
  const storeOk = hasStoreUrl(app)
  const email = app.testerMethod === 'email_list'
  const playBtn = playOpenLabel(tr, storeOk, isLiveApp(app))

  const mark = (patch: GroupJoinProgress) => {
    writeGroupJoinProgress(app.id, { ...progress, ...patch })
    onProgress()
  }

  const afterGroup = () => {
    mark({ group: true })
    if (isLikelyMobile()) openPlayInstall(app)
  }

  if (isLiveApp(app)) {
    const step = !progress.installed ? 1 : 2
    return (
      <section ref={ref} tabIndex={-1} className="panel stack-16 span-12 beginner-guide" aria-labelledby="beginner-h" id="cara-dapat-app">
        <div>
          <h2 id="beginner-h">{tr('appd_beginner_review_h')}</h2>
          <p className="muted">{tr('appd_beginner_review_lede')}</p>
        </div>
        <ol className="beginner-steps">
          <li className={progress.installed ? 'done' : step === 1 ? 'current' : undefined}>
            <span className="num" aria-hidden="true">{progress.installed ? '✓' : '1'}</span>
            <div className="beginner-step-body">
              <p className="t">{tr('appd_beginner_step_play_t')}</p>
              <p className="d">{tr('appd_beginner_step_play_d')}</p>
              {step === 1 && (
                <div className="beginner-step-actions">
                  <a className="btn primary sm" href={playUrl} target="_blank" rel="noreferrer"><IconExternal />{tr('appd_act_open_play_store')}</a>
                  <button type="button" className="btn sm" onClick={() => mark({ installed: true, group: true })}>{tr('appd_beginner_already_installed')}</button>
                </div>
              )}
            </div>
          </li>
          <li className={step === 2 ? 'current' : undefined}>
            <span className="num" aria-hidden="true">2</span>
            <div className="beginner-step-body">
              <p className="t">{tr('appd_beginner_review_step2_t')}</p>
              <p className="d">{tr('appd_beginner_review_step2_d')}</p>
              {step === 2 && (
                <button type="button" className="btn primary sm" onClick={onRecord}>{tr('appd_act_record_reviewer')}</button>
              )}
            </div>
          </li>
        </ol>
      </section>
    )
  }

  if (email) {
    const state = emailListed ?? 'signed_out'
    return (
      <section ref={ref} tabIndex={-1} className="panel stack-16 span-12 beginner-guide" aria-labelledby="beginner-h" id="cara-dapat-app">
        <div>
          <h2 id="beginner-h">{tr('appd_beginner_get_h')}</h2>
          <p className="muted">{tr('appd_beginner_email_lede')}</p>
        </div>
        <ol className="beginner-steps">
          <li className={state !== 'signed_out' && state !== 'none' ? 'done' : state === 'signed_out' || state === 'none' ? 'current' : undefined}>
            <span className="num" aria-hidden="true">{state !== 'signed_out' && state !== 'none' ? '✓' : '1'}</span>
            <div className="beginner-step-body">
              <p className="t">{tr('appd_beginner_request_t')}</p>
              <p className="d">{tr('appd_beginner_request_d')}</p>
              {(state === 'signed_out' || state === 'none') && (
                <button type="button" className="btn primary sm" onClick={onAskEmail}>{tr('appd_act_request_add')}</button>
              )}
            </div>
          </li>
          <li className={state === 'listed' ? 'done' : state === 'waiting' ? 'current' : undefined}>
            <span className="num" aria-hidden="true">{state === 'listed' ? '✓' : '2'}</span>
            <div className="beginner-step-body">
              <p className="t">{tr('appd_beginner_wait_t')}</p>
              <p className="d">{tr('appd_beginner_wait_d')}</p>
              {state === 'waiting' && <button type="button" className="btn sm" onClick={onOpenJoin}>{tr('appd_beginner_view_status')}</button>}
            </div>
          </li>
          <li className={state === 'listed' ? 'current' : undefined}>
            <span className="num" aria-hidden="true">3</span>
            <div className="beginner-step-body">
              <p className="t">{tr('appd_beginner_install_t')}</p>
              <p className="d">{tr('appd_beginner_install_d')}</p>
              {state === 'listed' && (
                <div className="beginner-step-actions">
                  <a className="btn primary sm" href={playUrl || app.optInUrl || undefined} target="_blank" rel="noreferrer">
                    <IconExternal />{playBtn}
                  </a>
                  <button type="button" className="btn sm" onClick={onOpenJoin}>{tr('appd_beginner_continue_guide')}</button>
                </div>
              )}
            </div>
          </li>
        </ol>
      </section>
    )
  }

  const step = !progress.group ? 1 : !progress.installed ? 2 : 3

  return (
    <section ref={ref} tabIndex={-1} className="panel stack-16 span-12 beginner-guide" aria-labelledby="beginner-h" id="cara-dapat-app">
      <div>
        <h2 id="beginner-h">{tr('appd_beginner_get_h')}</h2>
        <p className="muted">{tr('appd_beginner_group_lede')}</p>
      </div>
      <ol className="beginner-steps">
        <li className={progress.group ? 'done' : step === 1 ? 'current' : undefined}>
          <span className="num" aria-hidden="true">{progress.group ? '✓' : '1'}</span>
          <div className="beginner-step-body">
            <p className="t">{tr('appd_beginner_group_t')}</p>
            <p className="d">{tr('appd_beginner_group_d')}</p>
            {step === 1 && (
              <div className="beginner-step-actions">
                <a className="btn primary sm" href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer"><IconExternal />{tr('appd_beginner_open_group')}</a>
                <button type="button" className="btn sm" onClick={afterGroup}>{tr('appd_beginner_joined')}</button>
              </div>
            )}
            {progress.group && <p className="muted small addr">{COMMUNITY_GROUP}</p>}
          </div>
        </li>
        <li className={progress.installed ? 'done' : step === 2 ? 'current' : undefined}>
          <span className="num" aria-hidden="true">{progress.installed ? '✓' : '2'}</span>
          <div className="beginner-step-body">
            <p className="t">{tr('appd_beginner_step_play_t')}</p>
            <p className="d">{storeOk ? tr('appd_beginner_play_store_d') : tr('appd_beginner_no_store_d')}</p>
            {step === 2 && (
              <div className="beginner-step-actions">
                <a className="btn primary sm" href={playUrl} target="_blank" rel="noreferrer">
                  <IconExternal />{playBtn}
                </a>
                <button type="button" className="btn sm" onClick={() => mark({ installed: true })}>{tr('appd_beginner_already_installed')}</button>
              </div>
            )}
          </div>
        </li>
        <li className={step === 3 ? 'current' : undefined}>
          <span className="num" aria-hidden="true">3</span>
          <div className="beginner-step-body">
            <p className="t">{tr('appd_beginner_record_t')}</p>
            <p className="d">{tr('appd_beginner_record_d')}</p>
            {step === 3 && (
              <button type="button" className="btn primary sm" onClick={onRecord}>{tr('appd_act_record_tester')}</button>
            )}
          </div>
        </li>
      </ol>
    </section>
  )
})

// ---------- milestone check-ins (PRD §6.10, FR-39–41): own Active entry only ----------

/** Done build rows shown before "Lihat semua" (builds still owed are always shown). */
const FEW_BUILDS = 3
const TICK_MS = 60_000

/** One fetch shared by the header primary and the panel. `entry` is the member's own Active entry, else undefined. */
function useCheckInFlow(appId: string | undefined, entry: TesterDoc | undefined, buildsKey: string) {
  const tr = useT()
  const toast = useToast()
  const state = useCheckIns(appId, entry?.id, entry?.uid, buildsKey)
  // A recorded check-in shows as done at once and stays done until the refetch contains it,
  // so the button never comes back for a moment between the RPC and the refetch.
  const [optimistic, setOptimistic] = useState<CheckIn[]>([])
  const [pending, setPending] = useState<string | null>(null)
  // Stamp (and move focus to) a row only when its check-in was just recorded here, not on every visit.
  const [justDone, setJustDone] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const serverIds = new Set(state.data.checkIns.map((c) => c.id))
  const extra = optimistic.filter((c) => !serverIds.has(c.id))
  const data = extra.length ? { ...state.data, checkIns: [...state.data.checkIns, ...extra] } : state.data
  const result = entry ? milestones(data, entry.optedInAt, now) : null

  useEffect(() => {
    if (optimistic.length && optimistic.every((c) => serverIds.has(c.id))) setOptimistic([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data])

  // Windows open and due times pass while the tab stays focused: re-render every minute, or at the next boundary.
  const nextBoundary = result?.items.flatMap((m) => [m.opensAt, m.dueAt ?? Infinity]).filter((t) => t > now).reduce((a, b) => Math.min(a, b), Infinity) ?? Infinity
  useEffect(() => {
    if (!entry) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1000, Math.min(TICK_MS, nextBoundary - now + 50)))
    return () => window.clearTimeout(timer)
  }, [entry, now, nextBoundary])

  const run = async (m: Milestone) => {
    if (pending || !appId) return
    setPending(m.key)
    try {
      const id = await checkIn(appId, m.kind, m.buildId)
      setOptimistic((xs) => [...xs, { id, kind: m.kind, buildId: m.buildId ?? null, createdAt: Date.now() }])
      setJustDone(m.key)
      setPending(null)
      toast(tr('appd_toast_checkin', { label: milestoneLabelTr(tr, m) }))
      state.retry()
    } catch (e) {
      setPending(null)
      toast(failToast(e))
      // Already recorded elsewhere, or the window/status changed: show the server's truth.
      if (errorCode(e) === 'already-exists' || errorCode(e) === 'failed-precondition') state.retry()
    }
  }

  // ADR-009 §1: the tester's next step is the next open check-in: overdue first, then the earliest due, else the earliest opened.
  const next = result?.items
    .filter((m) => m.open && !m.done)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.opensAt - b.opensAt)[0]

  const isDone = (kind: CheckIn['kind'], buildId: string | null = null) => data.checkIns.some((c) => c.kind === kind && c.buildId === buildId)

  return { state, result, pending, justDone, run, next, isDone, loading: state.loading, error: state.error }
}
type CheckInFlow = ReturnType<typeof useCheckInFlow>

function CheckIns({ flow }: { flow: CheckInFlow }) {
  const tr = useT()
  const { state, result, pending, justDone } = flow
  const listRef = useRef<HTMLUListElement>(null)
  const [allBuilds, setAllBuilds] = useState(false)
  const items = result?.items ?? []
  const done = items.filter((m) => m.done).length
  const justDoneShown = !!justDone && items.some((m) => m.key === justDone && m.done)

  useEffect(() => {
    // The button the user pressed is gone; put focus on the row's new status so keyboard users stay in place.
    // (A check-in started from the header keeps focus there: the header's next primary takes its place.)
    const el = listRef.current?.querySelector<HTMLElement>(`[data-ci="${justDone}"]`)
    const lost = document.activeElement === document.body || !!listRef.current?.contains(document.activeElement)
    if (justDoneShown && el && lost) el.focus()
  }, [justDoneShown, justDone])

  // Builds still owed are always visible; only done ones collapse behind "Lihat semua".
  const buildRows = items.filter((m) => m.kind === 'updated_build')
  const hasBuilds = buildRows.length > 0
  const doneBuilds = buildRows.filter((m) => m.done)
  const doneShown = Math.max(0, FEW_BUILDS - (buildRows.length - doneBuilds.length))
  const hiddenBuilds = new Set(allBuilds ? [] : doneBuilds.slice(doneShown).map((m) => m.key))

  return (
    <section className="stack-8 ci" aria-labelledby="ci-h">
      <div className="ci-head">
        <h3 id="ci-h">{tr('appd_ci_h')}</h3>
        {!state.loading && !state.error && <span className="meta num">{tr('appd_ci_recorded_count', { done, total: items.length })}</span>}
      </div>
      <p className="muted small">{tr('appd_ci_honesty')}</p>
      {state.error ? <ErrorBox text={tr('appd_ci_load_error')} onRetry={state.retry} /> : state.loading || !result ? (
        <div aria-busy="true">
          <span className="sr-only">{tr('appd_ci_loading_sr')}</span>
          {[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={140} /></span><Skel w={80} h={28} /></div>)}
        </div>
      ) : (
        <ul className="ci-list" id="ci-list" ref={listRef}>
          {items.filter((m) => !hiddenBuilds.has(m.key)).map((m) => {
            const row = (
              <CheckInRow key={m.key} m={m} busy={pending === m.key} blocked={!!pending && pending !== m.key} stamp={justDone === m.key} onCheckIn={() => flow.run(m)} />
            )
            // "Sudah update" sits between the two fixed milestones; before the first build it explains itself.
            if (m.kind === 'still_opted_in' && !hasBuilds) {
              return (
                <Fragment key="no-build">
                  <li className="row-line top">
                    <span className="grow cell-2">
                      <b>{tr('appd_ci_updated_h')}</b>
                      <span>{tr('appd_ci_updated_d')}</span>
                    </span>
                    <Chip glyph="—">{tr('appd_ci_no_build')}</Chip>
                  </li>
                  {row}
                </Fragment>
              )
            }
            return row
          })}
        </ul>
      )}
      {doneBuilds.length > doneShown && (
        <ShowAll open={allBuilds} total={buildRows.length} onToggle={() => setAllBuilds((x) => !x)} controls="ci-list" />
      )}
      {result?.inCohort && !state.loading && !state.error && (
        <p className="muted small num">{tr('appd_ci_cohort_base', { date: fmtDate(result.base) })}</p>
      )}
    </section>
  )
}

function CheckInRow({ m, busy, blocked, stamp, onCheckIn }: { m: Milestone; busy: boolean; blocked: boolean; stamp: boolean; onCheckIn: () => void }) {
  const tr = useT()
  const label = milestoneLabelTr(tr, m)
  // Cohort due line (PRD §6.10 due times). Overdue reads in text and with the cabai "!" chip, never colour alone.
  // Day numbers and dates never break mid-token in the narrow aside ("ke-/5", "6/Nov").
  // Times are plain text with the exact WIB time, so there is nothing small to tap.
  const nw = (x: ReactNode) => <span className="nw">{x}</span>
  // "30 Okt 2026, 13.53 WIB": the date and the time each stay whole, but may sit on two lines in the narrow aside.
  const at = (t: number) => { const [d, ...rest] = fmtDateTime(t).split(', '); return <>{nw(d)}{rest.length > 0 && <>, {nw(rest.join(', '))}</>}</> }
  const dayOpen = m.opensDay != null ? tr('appd_ci_day_n', { day: m.opensDay }) : null
  const dayDue = m.dueDay != null ? tr('appd_ci_day_n', { day: m.dueDay }) : null
  const dueText = m.dueAt == null ? null : <>{dayDue != null && <>{dayDue}: </>}{at(m.dueAt)}</>
  const dueLine = dueText && !m.done && (
    <span className="num">{m.overdue ? <><Chip tone="cabai" glyph="!">{tr('appd_ci_overdue')}</Chip> {dueText}</> : <>{tr('appd_ci_due')} {dueText}</>}</span>
  )
  let when: ReactNode
  let side: ReactNode
  if (m.done) {
    when = <>{tr('appd_ci_recorded_prefix')}{at(m.done.createdAt)}</>
    side = (
      <span tabIndex={-1} data-ci={m.key} className="ci-status">
        <span className="sr-only">{label}: </span>
        <Chip tone="pandan" glyph="✓" className={stamp ? 'stamp' : undefined}>{tr('appd_ci_status_recorded')}</Chip>
      </span>
    )
  } else if (!m.open) {
    when = <>{tr('appd_ci_opens_prefix', { day: dayOpen ?? '' })}{at(m.opensAt)}</>
    side = null
  } else {
    when = m.kind === 'updated_build'
      ? <>{tr('appd_ci_build_logged_prefix')}{at(m.opensAt)}</>
      : <>{tr('appd_ci_open_since', { day: dayOpen ?? '' })}</>
    side = (
      <button
        type="button" className="btn sm" onClick={() => { if (!blocked) onCheckIn() }}
        aria-busy={busy || undefined} aria-disabled={blocked || undefined} aria-label={busy ? undefined : tr('appd_ci_btn_aria', { label })}
      >
        {busy ? tr('saving') : tr('appd_ci_btn')}
      </button>
    )
  }
  return (
    <li className="row-line top">
      <span className="grow cell-2">
        <b>{label}</b>
        <span className="num">{when}</span>
        {dueLine}
      </span>
      {side}
    </li>
  )
}

function LeaveDialog({ open, onClose, app, days }: { open: boolean; onClose: () => void; app: AppDoc; days: number }) {
  const tr = useT()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const leave = async () => {
    if (busy) return
    setBusy(true)
    try { await api.leaveTesting({ appId: app.id }); toast(tr('appd_toast_leave')); onClose() } catch (e) { toast(failToast(e)) } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onClose={onClose} label={tr('appd_leave_label', { name: app.name })}>
      <div className="sheet-body">
        <h2>{tr('appd_leave_label', { name: app.name })}</h2>
        <p className="lede">{tr('appd_leave_body', { days })}</p>
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{tr('appd_stay_testing')}</button>
        <button type="button" className="btn danger" onClick={leave} aria-busy={busy || undefined}>{busy ? tr('saving') : tr('appd_act_stop_testing')}</button>
      </div>
    </Dialog>
  )
}

// Where the KPI block goes on wide screens: under the board (2 × 2) when the aside outgrows the board by more than
// about half that block, so either placement leaves the smaller hole. Board and aside heights do not depend on it.
const KPI_BESIDE_MIN = 130
function useKpiPlacement(ready: boolean) {
  const board = useRef<HTMLElement>(null)
  const aside = useRef<HTMLElement>(null)
  const [beside, setBeside] = useState(false)
  useEffect(() => {
    const b = board.current
    const s = aside.current
    if (!ready || !b || !s || typeof ResizeObserver === 'undefined') return
    const wide = window.matchMedia('(min-width: 1024px)')
    const check = () => setBeside(wide.matches && s.offsetHeight - b.offsetHeight > KPI_BESIDE_MIN)
    const ro = new ResizeObserver(check)
    ro.observe(b)
    ro.observe(s)
    wide.addEventListener('change', check)
    check()
    return () => { ro.disconnect(); wide.removeEventListener('change', check) }
  }, [ready])
  return { board, aside, beside }
}

function Kpis({ p, app, loading, wide }: { p: Progress; app: AppDoc; loading: boolean; wide?: boolean }) {
  const tr = useT()
  const v = (x: ReactNode) => (loading ? <Skel w={64} h={24} /> : x)
  return (
    <section className={wide ? 'kpis span-12' : 'kpis'} aria-label={tr('appd_kpi_aria')}>
      <div className="kpi">
        <div className="kpi-label">{tr('appd_kpi_active')}</div>
        <div className="kpi-value num">{v(<>{p.active}<small> / {p.target}</small></>)}</div>
        <div style={{ marginTop: 'var(--s-2)' }}><Bar value={p.active} max={p.target} label={tr('appd_kpi_active')} /></div>
      </div>
      <div className="kpi">
        <div className="kpi-label">{tr('appd_kpi_feedback_play')}</div>
        <div className="kpi-value num">{v(<>{p.feedbackSent}<small>{tr('appd_kpi_sent_suffix')}</small></>)}</div>
        <p className="note num">{tr('appd_kpi_verified', { n: p.feedbackVerified })}</p>
      </div>
      <div className="kpi">
        <div className="kpi-label">{tr('appd_kpi_replied_h')}</div>
        <div className="kpi-value num">{v(p.feedbackSent === 0 ? <span className="dash">—</span> : <>{p.replied}<small> / {p.feedbackSent}</small></>)}</div>
        <p className="note">{p.feedbackSent === 0 ? tr('appd_kpi_no_feedback') : tr('appd_kpi_replied_note')}</p>
      </div>
      <div className="kpi">
        <div className="kpi-label">{tr('appd_kpi_builds')}</div>
        <div className="kpi-value num">{v(<>{p.builds}<small> / {TARGET_BUILDS}</small></>)}</div>
        <p className="note">{app.lastBuildAt ? tr('appd_kpi_builds_last', { time: relTime(app.lastBuildAt) }) : tr('appd_kpi_builds_target')}</p>
      </div>
    </section>
  )
}

// ---------- helper functions: share to WhatsApp, Google Calendar reminder, Testing Missions ----------

function shareToWhatsApp(tr: Tr, appName: string, openCount: number, appId: string) {
  const url = window.location.origin + '/apps/' + appId
  const needed = openCount > 0 ? `${openCount} ` : ''
  const text = tr('appd_wa_share', { needed, name: appName, url })
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank')
}

function createCalendarUrl(title: string, details: string, targetDate: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = targetDate.getFullYear();
  const m = pad(targetDate.getMonth() + 1);
  const d = pad(targetDate.getDate());
  const dates = y + m + d + '/' + y + m + d;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) + '&details=' + encodeURIComponent(details) + '&dates=' + dates;
}

function TestingMissions({ guide, appId, uid }: { guide: string; appId: string; uid?: string | null }) {
  const tr = useT()
  const key = 'tb_missions_' + appId + '_' + (uid ?? 'anon');
  const lines = useMemo(() => {
    return guide
      .split('\n')
      .map((l) => l.trim().replace(/^[-*•\d.]+\s*/, ''))
      .filter((l) => l.length > 0);
  }, [guide]);

  const [done, setDone] = useState<Record<number, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '{}');
    } catch {
      return {};
    }
  });

  const toggle = (idx: number) => {
    setDone((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  if (lines.length <= 1) {
    return <p className="guide-quote">{guide}</p>;
  }

  const completed = lines.filter((_, i) => done[i]).length;

  return (
    <div className="stack-8" style={{ marginTop: 'var(--s-2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="small muted">{tr('appd_missions_label')}</span>
        <span className="small num muted">{tr('appd_missions_count', { done: completed, total: lines.length })}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
        {lines.map((line, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--s-2)', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              id={'mission-' + i}
              checked={!!done[i]}
              onChange={() => toggle(i)}
              style={{ marginTop: '0.2rem', cursor: 'pointer' }}
            />
            <label htmlFor={'mission-' + i} style={{ cursor: 'pointer', textDecoration: done[i] ? 'line-through' : 'none', opacity: done[i] ? 0.7 : 1 }}>
              {line}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- tester table: 4 fields per row, details behind a tap, inline edits (ADR-009 §3) ----------

function downloadTestersCsv(tr: Tr, appName: string, testers: TesterDoc[]) {
  const headers = [tr('appd_csv_name'), tr('appd_csv_email'), tr('appd_csv_days'), tr('appd_csv_status'), tr('appd_csv_fb_sent'), tr('appd_csv_fb_verified'), tr('appd_csv_replied'), tr('appd_csv_joined')]
  const now = Date.now();
  const rows = testers.map((t) => [
    '"' + t.displayName.replace(/"/g, '""') + '"',
    '"' + (t.maskedEmail ?? '') + '"',
    daysActive(t, now),
    '"' + testerStatusTr(tr, t.status) + '"',
    t.feedbackSent ? tr('appd_yes') : tr('appd_no'),
    t.feedbackVerified ? tr('appd_yes') : tr('appd_no'),
    t.replied ? tr('appd_yes') : tr('appd_no'),
    t.optedInAt ? new Date(t.optedInAt).toISOString().split('T')[0] : '',
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const cleanName = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  link.href = url;
  link.setAttribute('download', 'testers-' + cleanName + '-' + new Date().toISOString().split('T')[0] + '.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type SortKey = 'name' | 'days'
type Quick = Partial<Pick<TesterDoc, 'feedbackVerified' | 'replied' | 'status'>>

function TesterTable({ app, testers, loading, isCreator, myUid, appPassed, onEdit }: {
  app: AppDoc; testers: TesterDoc[]; loading: boolean; isCreator: boolean; myUid?: string; appPassed: boolean; onEdit: (t: TesterDoc) => void
}) {
  const tr = useT()
  const toast = useToast()
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'days', dir: 'desc' })
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set())
  const [historyOpen, setHistoryOpen] = useState(false)
  // Optimistic inline edits: shown at once, dropped when the server row agrees (or rolled back on error).
  const [over, setOver] = useState<Record<string, Quick>>({})
  useEffect(() => {
    setOver((o) => {
      let changed = false
      const n = { ...o }
      for (const id of Object.keys(n)) {
        const t = testers.find((x) => x.id === id)
        if (!t || Object.entries(n[id]).every(([k, v]) => t[k as keyof Quick] === v)) { delete n[id]; changed = true }
      }
      return changed ? n : o
    })
  }, [testers])

  const now = Date.now()
  const rows = useMemo(() => testers.map((t) => (over[t.id] ? { ...t, ...over[t.id] } : t)), [testers, over])
  const active = useMemo(() => {
    const m = sort.dir === 'asc' ? 1 : -1
    return rows.filter((t) => t.status === 'active').sort((a, b) => sort.key === 'name'
      ? m * a.displayName.localeCompare(b.displayName, 'id')
      : m * (daysActive(a, now) - daysActive(b, now)) || a.displayName.localeCompare(b.displayName, 'id'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  const history = useMemo(() => rows.filter((t) => t.status !== 'active').sort((a, b) => (b.leftAt ?? 0) - (a.leftAt ?? 0)), [rows])
  // FR-27j: badge beside each member's name; manual entries (no uid) have none
  const badges = useBadgesOf(testers.filter((t) => t.uid).map((t) => t.uid!)).data

  const save = async (server: TesterDoc, change: Quick, msg: string, undo?: Quick) => {
    setOver((o) => ({ ...o, [server.id]: { ...o[server.id], ...change } }))
    try {
      await updateTesterAsCreator(app.id, server, change)
      if (undo) {
        const after = { ...server, ...change }
        toast({ text: msg, duration: 8000, action: { label: tr('form_undo'), onClick: () => { void save(after, undo, tr('appd_toast_status_restored', { name: server.displayName })) } } })
      } else toast(msg)
    } catch (e) {
      setOver((o) => {
        const n = { ...o }
        const rest = { ...n[server.id] }
        for (const k of Object.keys(change)) delete rest[k as keyof Quick]
        if (Object.keys(rest).length) n[server.id] = rest
        else delete n[server.id]
        return n
      })
      toast(failToast(e))
    }
  }
  const serverOf = (id: string) => testers.find((t) => t.id === id)!
  const setVerified = (row: TesterDoc, v: boolean) =>
    save(serverOf(row.id), { feedbackVerified: v }, v ? tr('appd_toast_verified_on', { name: row.displayName }) : tr('appd_toast_verified_off', { name: row.displayName }))
  const setReplied = (row: TesterDoc, v: boolean) =>
    save(serverOf(row.id), { replied: v }, v ? tr('appd_toast_replied_on', { name: row.displayName }) : tr('appd_toast_replied_off', { name: row.displayName }))
  const setStatus = (row: TesterDoc, s: TesterStatus) => {
    const server = serverOf(row.id)
    return save(server, { status: s }, tr('appd_toast_status', { name: row.displayName, status: testerStatusTr(tr, s).toLowerCase() }), { status: server.status })
  }

  const toggle = (id: string) => setOpenRows((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const th = (key: SortKey, label: string, num = false, extra = '') => {
    const on = sort.key === key
    return (
      <th className={`${num ? 'num' : ''} ${extra}`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className={`sort ${on ? 'on' : ''}`} onClick={() => setSort({ key, dir: on && sort.dir === 'desc' ? 'asc' : 'desc' })}>
          {label}{on ? <IconSort dir={sort.dir} /> : <IconSortNone className="idle" />}
        </button>
      </th>
    )
  }
  const COLS = 4

  const row = (t: TesterDoc) => {
    const d = daysActive(t, now)
    const me = !!t.uid && t.uid === myUid
    const isOpen = openRows.has(t.id)
    const detailId = `tester-${t.id}`
    return (
      <Fragment key={t.id}>
        <tr className={`${t.status !== 'active' ? 'muted' : ''} ${me ? 'mine' : ''} ${isOpen ? 'open' : ''}`}>
          <td className="sticky">
            <span className="who">
              <button type="button" className="disclose" aria-expanded={isOpen} aria-controls={isOpen ? detailId : undefined} onClick={() => toggle(t.id)}>
                <IconChevron /><span className="sr-only">{tr('appd_detail_sr', { name: t.displayName })}</span>
              </button>
              <Avatar name={t.displayName} photo={t.photoURL} />
              <span className="name-with-badge">
                {t.uid ? <Link className="name-link" to={`/u/${t.uid}`}><b>{t.displayName}</b></Link> : <b>{t.displayName}</b>}
                <Badge tier={t.uid ? badges.get(t.uid) : undefined} size="sm" />
                {me && <span className="you">{tr('appd_you')}</span>}
              </span>
            </span>
          </td>
          <td className="num"><b>{d}</b><span className="of"> / {TARGET_DAYS}</span></td>
          <td><TesterChip t={t} days={d} appPassed={appPassed} /></td>
          <td>
            <span className="fb-cell">
              <FeedbackChip t={t} />
              {isCreator && (
                <label className="tick" title={tr('appd_verify_play_title')}>
                  <input type="checkbox" checked={t.feedbackVerified} onChange={(e) => setVerified(t, e.target.checked)}
                    aria-label={tr('appd_verify_play_aria', { name: t.displayName })} />
                </label>
              )}
            </span>
          </td>
        </tr>
        {isOpen && (
          <tr className="detail" id={detailId}>
            <td colSpan={COLS}>
              <div className="detail-body">
                <dl className="facts">
                  <div><dt>{tr('appd_opted_in')}</dt><dd className="num">{fmtDate(t.optedInAt)}</dd></div>
                  {t.status !== 'active' && t.leftAt && <div><dt>{t.status === 'removed' ? tr('appd_removed_on') : tr('appd_left_on')}</dt><dd className="num">{fmtDate(t.leftAt)}</dd></div>}
                  <div><dt>{tr('appd_csv_email')}</dt><dd>{t.maskedEmail}</dd></div>
                  {!isCreator && <div><dt>{tr('appd_replied_creator')}</dt><dd>{t.replied ? tr('appd_replied_yes') : tr('appd_replied_no')}</dd></div>}
                  <div><dt>{tr('appd_note')}</dt><dd>{t.note || (t.addedBy === 'creator' ? tr('appd_note_creator_added') : '—')}</dd></div>
                </dl>
                {t.feedbackSummary && t.status !== 'removed' && <p className="guide-quote">{t.feedbackSummary}</p>}
                {isCreator && (
                  <div className="detail-edit">
                    <label className="check">
                      <input type="checkbox" checked={t.replied} onChange={(e) => setReplied(t, e.target.checked)} />
                      <span><span className="t">{tr('appd_replied_checkbox_t')}</span><span className="d">{tr('appd_replied_checkbox_d')}</span></span>
                    </label>
                    <div className="field">
                      <label htmlFor={`st-${t.id}`}>{tr('appd_status_field')}</label>
                      <select id={`st-${t.id}`} className="input" value={t.status} onChange={(e) => setStatus(t, e.target.value as TesterStatus)} aria-describedby={`st-${t.id}-hint`}>
                        {(['active', 'left', 'removed'] as TesterStatus[]).map((s) => <option key={s} value={s}>{testerStatusTr(tr, s)}</option>)}
                      </select>
                      <span className="hint" id={`st-${t.id}-hint`}>{tr('appd_removed_no_rejoin')}</span>
                    </div>
                    <button type="button" className="btn sm" onClick={() => onEdit(serverOf(t.id))}>{tr('appd_edit_tester')}</button>
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  return (
    <section className="panel flush span-12" aria-labelledby="testers-h">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 id="testers-h">{tr('appd_testers_h')}</h2>
          <span className="meta num">{tr('appd_testers_meta', { active: active.length })}{history.length > 0 ? tr('appd_testers_history', { n: history.length }) : ''}</span>
        </div>
        {testers.length > 0 && (
          <button
            type="button"
            className="btn sm"
            onClick={() => downloadTestersCsv(tr, app.name, testers)}
            title={tr('appd_export_csv_title')}
          >
            {tr('appd_export_csv')}
          </button>
        )}
      </header>
      {/* One sheet on every width (CLAUDE.md, DR-14): it scrolls inside its own box, so the header row
          and the name column both stay put. */}
      <div className="table-wrap sheet-scroll" style={{ marginTop: 'var(--s-3)' }} tabIndex={0} role="region" aria-labelledby="testers-h">
        <table className="data sheet-table">
          <thead>
            <tr>
              {th('name', tr('appd_col_name'), false, 'sticky')}
              {th('days', tr('appd_col_days'), true)}
              <th>{tr('appd_col_status')}</th>
              <th>{isCreator ? tr('appd_col_feedback_creator') : tr('appd_col_feedback_tester')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }, (_, i) => (
              <tr key={i}><td className="sticky"><Skel w={140} /></td><td className="num"><Skel w={40} /></td><td><Skel w={90} h={24} /></td><td><Skel w={110} h={24} /></td></tr>
            ))}
            {!loading && active.map(row)}
            {!loading && active.length === 0 && history.length > 0 && (
              <tr><td colSpan={COLS} className="muted">{tr('appd_no_active_testers')}</td></tr>
            )}
          </tbody>
          {!loading && history.length > 0 && (
            <tbody className="history">
              <tr className="group-row">
                <th colSpan={COLS} scope="rowgroup">
                  <button type="button" className="group-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((o) => !o)}>
                    <IconChevron />{tr('appd_history')} <span className="num">({history.length})</span>
                    <span className="muted small">{tr('appd_history_muted')}</span>
                  </button>
                </th>
              </tr>
              {historyOpen && history.map(row)}
            </tbody>
          )}
        </table>
      </div>
      {!loading && testers.length > 0 && <p className="meta small scroll-hint" style={{ padding: '0 var(--s-3) var(--s-3)' }}>{tr('appd_scroll_hint')}</p>}
      {!loading && testers.length === 0 && (
        <div className="empty-pad">
          <Empty title={tr('appd_empty_testers_title')}>
            <p>{isCreator
              ? (isLiveApp(app) ? tr('appd_empty_creator_live') : tr('appd_empty_creator_closed'))
              : (isLiveApp(app) ? tr('appd_empty_visitor_live') : tr('appd_empty_visitor_closed'))}</p>
          </Empty>
        </div>
      )}
    </section>
  )
}

// ---------- build log: an activity timeline, newest first, grouped by WIB day (ADR-009 §4) ----------

const FEW = 4

function groupByDay<T>(items: T[], at: (x: T) => number) {
  const out: { key: string; t: number; items: T[] }[] = []
  for (const x of items) {
    const key = isoDate(at(x))
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push(x)
    else out.push({ key, t: at(x), items: [x] })
  }
  return out
}

function BuildLog({ builds, loading, error, retry, p, app, isCreator }: {
  builds: BuildDoc[]; loading: boolean; error: string | null; retry: () => void; p: Progress; app: AppDoc; isCreator: boolean
}) {
  const tr = useT()
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => [...builds].sort((a, b) => b.uploadedAt - a.uploadedAt), [builds])
  const groups = groupByDay(all ? sorted : sorted.slice(0, FEW), (b) => b.uploadedAt)
  return (
    <section aria-labelledby="builds-h">
      <header>
        <h2 id="builds-h">{tr('appd_builds_h')}</h2>
        <span className="meta num">{tr('appd_builds_meta', { n: p.builds })}{app.testStartDate ? tr('appd_builds_since', { date: fmtDate(app.testStartDate) }) : ''}</span>
      </header>
      {error ? <ErrorBox text={tr('form_builds_error')} onRetry={retry} /> : loading ? (
        <div>{[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={120} /></span><Skel w={60} /></div>)}</div>
      ) : sorted.length === 0 ? (
        <Empty title={tr('appd_builds_empty_title')}>
          <p>{isCreator ? tr('appd_builds_empty_creator') : tr('appd_builds_empty_tester')}</p>
        </Empty>
      ) : (
        <div className="timeline" id="build-list">
          {groups.map((g) => (
            <div className="tl-day" key={g.key}>
              <h3 className="tl-date num">{fmtDayHeading(g.t)}</h3>
              <ol>
                {g.items.map((b) => (
                  <li className="row-line" key={b.id}>
                    <span className="grow cell-2"><b>{b.versionName}</b><span>{b.changelog}</span></span>
                    <RelTime t={b.uploadedAt} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {sorted.length > FEW && <ShowAll open={all} total={sorted.length} onToggle={() => setAll((x) => !x)} controls="build-list" />}
    </section>
  )
}

function FeedbackList({ testers, loading }: { testers: TesterDoc[]; loading: boolean }) {
  const tr = useT()
  const [all, setAll] = useState(false)
  const withSummary = testers
    .filter((t) => t.feedbackSent && t.feedbackSummary && t.status !== 'removed')
    .sort((a, b) => (b.feedbackSentAt ?? 0) - (a.feedbackSentAt ?? 0))
  const shown = all ? withSummary : withSummary.slice(0, FEW)
  return (
    <section aria-labelledby="fb-h">
      <header>
        <h2 id="fb-h">{tr('appd_fb_notes_h')}</h2>
        <span className="meta num">{tr('appd_fb_notes_meta', { n: withSummary.length })}</span>
      </header>
      {loading ? (
        <div>{[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={200} /></span></div>)}</div>
      ) : shown.length === 0 ? (
        <Empty title={tr('appd_fb_notes_empty_title')}>
          <p>{tr('appd_fb_notes_empty_body')}</p>
        </Empty>
      ) : (
        <ul id="fb-list">
          {shown.map((t) => (
            <li className="row-line top" key={t.id}>
              <Avatar name={t.displayName} photo={t.photoURL} />
              <span className="grow">
                <span className="fb-head">
                  <b>{t.displayName}</b>
                  <span className="creator-nums">{t.feedbackSentAt && <RelTime t={t.feedbackSentAt} />}{t.feedbackVerified && <FeedbackChip t={t} />}</span>
                </span>
                {(() => {
                  const m = t.feedbackSummary?.match(/^\[([^\]]+)\]\s*(.*)$/s);
                  if (m) {
                    return (
                      <span className="fb-text">
                        <span className="chip sm" style={{ marginRight: 'var(--s-2)', display: 'inline-block' }}>{m[1]}</span>
                        {m[2]}
                      </span>
                    );
                  }
                  return <span className="fb-text">{t.feedbackSummary}</span>;
                })()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {withSummary.length > FEW && <ShowAll open={all} total={withSummary.length} onToggle={() => setAll((x) => !x)} controls="fb-list" />}
    </section>
  )
}

// ---------- email-list testing (ADR-011): the creator's own view only ----------

function EmailListPanel({ app }: { app: AppDoc }) {
  const tr = useT()
  const toast = useToast()
  const list = useEmailListings(app.id)
  const [busy, setBusy] = useState<string | null>(null)
  const pending = list.data.filter((r) => r.listedAt == null)
  // ADR-012 "Building on ADR-011": full stays joinable, so the creator decides whether to list more; show the seats to decide by.
  const open = openSeats(app)
  const copy = async (emails: string[]) => {
    try {
      await navigator.clipboard.writeText(emails.join(', '))
      toast(tr('appd_toast_copied', { n: emails.length }))
    } catch { toast(tr('appd_toast_copy_fail')) }
  }
  const mark = async (uid: string, listed: boolean) => {
    if (busy) return
    setBusy(uid)
    try { await markEmailListed(app.id, uid, listed); list.refresh() } catch (e) { toast(failToast(e)) } finally { setBusy(null) }
  }
  return (
    <section className="panel stack-12 span-12" aria-labelledby="emails-h">
      <header className="creator-nums">
        <h2 id="emails-h">{tr('appd_email_h')}</h2>
        <span className="muted small num">{tr('appd_email_pending', { pending: pending.length, done: list.data.length - pending.length })}</span>
        <span className="spacer" />
        {pending.length > 0 && <button type="button" className="btn" onClick={() => copy(pending.map((r) => r.email))}>{tr('appd_copy_emails', { n: pending.length })}</button>}
      </header>
      <p className="muted small">{tr('appd_email_hint')}</p>
      <p className="small num">
        {open > 0
          ? tr('appd_email_need', { open, slots: app.testerSlots })
          : tr('appd_email_full', { active: app.activeTesterCount, slots: app.testerSlots })}
      </p>
      {list.error ? <ErrorBox text={tr('appd_email_load_error')} onRetry={list.retry} />
        : list.loading ? <Skel w="60%" />
        : list.data.length === 0 ? <p className="muted">{tr('appd_email_none')}</p>
        : (
          <ul className="email-list">
            {list.data.map((r) => (
              <li key={r.uid}>
                <span className="cell-2">
                  <b>{r.displayName}</b>
                  <span className="addr">{r.email}</span>
                  <span className="muted small num">{r.listedAt ? tr('appd_email_listed', { date: fmtDate(r.listedAt) }) : tr('appd_email_waiting_row', { date: fmtDate(r.requestedAt) })}</span>
                </span>
                {r.listedAt
                  ? <button type="button" className="text-action quiet" disabled={busy === r.uid} onClick={() => mark(r.uid, false)}>{tr('appd_email_unmark')}</button>
                  : <button type="button" className="btn primary" disabled={busy === r.uid} onClick={() => mark(r.uid, true)}>{busy === r.uid ? tr('saving') : tr('appd_email_marked')}</button>}
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

function CreatorCard({ app }: { app: AppDoc }) {
  const tr = useT()
  const testing = app.creatorTestingCount ?? 0
  const f = app.creatorFeedbackSentCount ?? 0
  const v = app.creatorFeedbackVerifiedCount ?? 0
  return (
    <section className="panel stack-12" aria-labelledby="creator-h">
      <h2 id="creator-h">{tr('appd_creator_h')}</h2>
      <Link to={`/u/${app.creatorUid}`} className="creator-link">
        <Avatar name={app.creatorName} photo={app.creatorPhotoURL} />
        <span>{app.creatorName}</span>
      </Link>
      <p className="num">{testing === 0 ? <span>{tr('appd_creator_none')}</span> : <>{tr('appd_creator_stats', { n: testing })}{tr('appd_creator_fb', { f })}{f > 0 ? tr('appd_creator_verified', { v }) : ''}</>}</p>
    </section>
  )
}

function DetailSkeleton() {
  const tr = useT()
  return (
    <div aria-busy="true" aria-label={tr('appd_skeleton_aria')}>
      <Skel w={80} />
      <div className="record-head skel-head">
        <div className="rh-main"><Skel w={260} h={32} /><Skel w={180} h={24} /></div>
        <div className="rh-progress"><Skel w={120} h={24} /><Skel w="100%" h={16} /></div>
        <div className="rh-actions"><Skel w={200} h={44} /></div>
      </div>
      <div className="grid">
        <div className="panel span-8" style={{ height: 380 }} />
        <div className="panel span-4" style={{ height: 380 }} />
      </div>
    </div>
  )
}
