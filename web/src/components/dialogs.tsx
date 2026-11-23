import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { api, cancelEmailListing, errorText, requestEmailListing, updateTesterAsCreator, useMyEmailListing } from '../lib/data'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import {
  clearJoinProgress, emailPlayStepsDone, groupPlayStepsDone, hasStoreUrl, isLikelyMobile, isLiveApp, openPlayInstall,
  playInstallUrl, readEmailJoinProgress, readGroupJoinProgress, writeEmailJoinProgress, writeGroupJoinProgress,
} from '../lib/joinProgress'
import { fmtDate, isoDate, todayIso } from '../lib/progress'
import type { AppDoc, TesterDoc } from '../lib/types'
import { BUILD_LIMITS, MANUAL_LIMITS, validateBuild, validateManual, type BuildInput, type ManualInput } from '../lib/validate'
import { useValidation } from '../lib/useValidation'
import { useT } from '../lib/i18n'
import { Dialog, ErrorBox, Field, fieldAria, useToast } from './bits'
import { IconExternal } from './icons'

function useSubmit(onDone: () => void) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return // already saving: ignore the double tap
    setBusy(true); setErr(null)
    try { await fn(); onDone() } catch (e) { setErr(errorText(e, t)) } finally { setBusy(false) }
  }
  return { busy, err, run }
}

export function JoinDialog({ open, onClose, app, rejoin }: { open: boolean; onClose: () => void; app: AppDoc; rejoin?: boolean }) {
  const t = useT()
  return (
    <Dialog open={open} onClose={onClose} label={isLiveApp(app) ? t('dlg_join_review_label', { name: app.name }) : t('dlg_join_tester_label', { name: app.name })}>
      {isLiveApp(app)
        ? <LiveJoinForm app={app} rejoin={rejoin} onClose={onClose} />
        : app.testerMethod === 'email_list'
          ? <EmailJoinForm app={app} rejoin={rejoin} onClose={onClose} />
          : <JoinForm app={app} rejoin={rejoin} onClose={onClose} />}
    </Dialog>
  )
}

/** Production apps: Play Store install → catat (public review comes after join). */
function LiveJoinForm({ onClose, app, rejoin }: { onClose: () => void; app: AppDoc; rejoin?: boolean }) {
  const t = useT()
  const toast = useToast()
  const [done, setDone] = useState(() => readGroupJoinProgress(app.id))
  const [step, setStep] = useState<'play' | 'confirm'>(() => (readGroupJoinProgress(app.id).installed ? 'confirm' : 'play'))
  const { busy, err, run } = useSubmit(() => {
    clearJoinProgress(app.id)
    toast(t('dlg_toast_reviewer', { name: app.name }))
    onClose()
  })
  const playUrl = playInstallUrl(app)

  const markInstalled = () => {
    const merged = { ...done, installed: true, group: true }
    setDone(merged)
    writeGroupJoinProgress(app.id, merged)
    setStep('confirm')
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step !== 'confirm' || !done.installed) return
    run(() => api.joinAsTester({ appId: app.id, checklist: { installed: true } }))
  }

  return (
    <form onSubmit={submit}>
      <div className="sheet-body">
        <h2>{t('dlg_live_title', { name: app.name })}</h2>
        {rejoin && <p className="muted">{t('dlg_rejoin_note')}</p>}
        <p className="lede">{t('dlg_live_lede')}</p>
        <WizardProgress labels={[t('dlg_wiz_install_play'), t('dlg_wiz_record')]} current={step === 'play' ? 0 : 1} doneFlags={[!!done.installed, false]} />
        {step === 'play' ? (
          <WizardStep
            title={t('dlg_step_play_title')}
            body={t('dlg_step_play_body_live')}
            actionHref={playUrl}
            actionLabel={t('dlg_open_play')}
            onDone={markInstalled}
            doneLabel={t('dlg_already_installed')}
          />
        ) : (
          <div className="stack-12">
            <p className="strong">{t('dlg_record_review_title')}</p>
            <p className="muted">{t('dlg_record_review_body')}</p>
            <button type="button" className="text-action" onClick={() => setStep('play')}>{t('dlg_back_to_install')}</button>
          </div>
        )}
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        {step === 'confirm' && (
          <button className="btn primary" disabled={busy || !done.installed}>
            {busy ? t('saving') : t('dlg_record_as_reviewer')}
          </button>
        )}
      </div>
    </form>
  )
}

type GroupStep = 'group' | 'play' | 'confirm'
const GROUP_STEPS: GroupStep[] = ['group', 'play', 'confirm']

function initialGroupStep(appId: string): GroupStep {
  const p = readGroupJoinProgress(appId)
  if (!p.group) return 'group'
  if (!p.installed) return 'play'
  return 'confirm'
}

/** One step at a time: Group → Play Store (install) → confirm on TesBareng. */
function JoinForm({ onClose, app, rejoin }: { onClose: () => void; app: AppDoc; rejoin?: boolean }) {
  const t = useT()
  const toast = useToast()
  const [step, setStep] = useState<GroupStep>(() => initialGroupStep(app.id))
  const [done, setDone] = useState(() => readGroupJoinProgress(app.id))
  const { busy, err, run } = useSubmit(() => {
    clearJoinProgress(app.id)
    toast(t('dlg_toast_tester', { name: app.name }))
    onClose()
  })
  const playUrl = playInstallUrl(app)
  const storeOk = hasStoreUrl(app)
  const idx = GROUP_STEPS.indexOf(step)

  const mark = (patch: typeof done, next: GroupStep) => {
    const merged = { ...done, ...patch }
    setDone(merged)
    writeGroupJoinProgress(app.id, merged)
    setStep(next)
  }

  const afterGroup = () => {
    mark({ group: true }, 'play')
    // On mobile, open Play Store right away so the user lands on Install.
    if (isLikelyMobile()) openPlayInstall(app)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (step !== 'confirm' || !groupPlayStepsDone(done)) return
    // Play Store path implies they can install (= opted in via the community group).
    run(() => api.joinAsTester({ appId: app.id, checklist: { joinedGroup: true, optedIn: true, installed: true } }))
  }

  return (
    <form onSubmit={submit}>
      <div className="sheet-body">
        <h2>{t('dlg_join_title', { name: app.name })}</h2>
        {rejoin && <p className="muted">{t('dlg_rejoin_note')}</p>}
        <p className="lede">{t('dlg_join_lede')}</p>
        <WizardProgress
          labels={[t('dlg_wiz_join_group'), t('dlg_wiz_install_play'), t('dlg_wiz_record')]}
          current={idx}
          doneFlags={[!!done.group, !!done.installed, false]}
        />
        {step === 'group' && (
          <WizardStep
            title={t('dlg_step_group_title')}
            body={t('dlg_step_group_body')}
            actionHref={COMMUNITY_GROUP_URL}
            actionLabel={t('dlg_open_group')}
            actionHint={COMMUNITY_GROUP}
            onDone={afterGroup}
            doneLabel={t('dlg_already_joined_group')}
          />
        )}
        {step === 'play' && (
          <WizardStep
            title={t('dlg_step_play_title_n')}
            body={storeOk ? t('dlg_step_play_body_store') : t('dlg_step_play_body_optin')}
            actionHref={playUrl}
            actionLabel={storeOk ? t('dlg_open_play') : t('dlg_open_optin')}
            onBack={() => setStep('group')}
            onDone={() => mark({ installed: true }, 'confirm')}
            doneLabel={t('dlg_already_installed')}
          />
        )}
        {step === 'confirm' && (
          <div className="stack-12">
            <p className="strong">{t('dlg_record_tester_title')}</p>
            <p className="muted">{t('dlg_record_tester_body')}</p>
            <button type="button" className="text-action" onClick={() => setStep('play')}>{t('dlg_back_to_install')}</button>
          </div>
        )}
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        {step === 'confirm' && (
          <button className="btn primary" disabled={busy || !groupPlayStepsDone(done)}>
            {busy ? t('saving') : t('dlg_record_as_tester')}
          </button>
        )}
      </div>
    </form>
  )
}

type EmailPhase = 'ask' | 'wait' | 'optin' | 'install' | 'confirm'

/**
 * Email-list apps (ADR-011): ask (consent) → wait → opt-in → install → confirm.
 * Play steps are one screen at a time once the creator has listed the email.
 */
function EmailJoinForm({ onClose, app, rejoin }: { onClose: () => void; app: AppDoc; rejoin?: boolean }) {
  const t = useT()
  const toast = useToast()
  const { user } = useAuth()
  const listing = useMyEmailListing(app.id, user?.uid)
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null)) }, [])
  const [consent, setConsent] = useState(false)
  const [play, setPlay] = useState(() => readEmailJoinProgress(app.id))
  const [playStep, setPlayStep] = useState<'optin' | 'install' | 'confirm'>(() => {
    const p = readEmailJoinProgress(app.id)
    if (!p.optedIn) return 'optin'
    if (!p.installed) return 'install'
    return 'confirm'
  })
  const asked = useSubmit(() => listing.refresh())
  const joined = useSubmit(() => {
    clearJoinProgress(app.id)
    toast(t('dlg_toast_tester', { name: app.name }))
    onClose()
  })
  const l = listing.data
  const phase: EmailPhase = !l ? 'ask' : l.listedAt == null ? 'wait' : playStep
  const playUrl = playInstallUrl(app)
  const storeOk = hasStoreUrl(app)

  const markPlay = (patch: typeof play, next: 'optin' | 'install' | 'confirm') => {
    const merged = { ...play, ...patch }
    setPlay(merged)
    writeEmailJoinProgress(app.id, merged)
    setPlayStep(next)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (phase === 'ask' && consent) asked.run(async () => { await requestEmailListing(app.id); toast(t('dlg_toast_requested')) })
    if (phase === 'confirm' && emailPlayStepsDone(play)) {
      joined.run(() => api.joinAsTester({ appId: app.id, checklist: { optedIn: true, installed: true } }))
    }
  }
  const withdraw = () => asked.run(async () => { await cancelEmailListing(app.id); toast(t('dlg_toast_withdrawn')) })
  const err = asked.err ?? joined.err ?? listing.error
  const busy = asked.busy || joined.busy

  const overviewIdx = phase === 'ask' ? 0 : phase === 'wait' ? 1 : phase === 'optin' ? 2 : phase === 'install' ? 3 : 4

  return (
    <form onSubmit={submit}>
      <div className="sheet-body">
        <h2>{t('dlg_join_title', { name: app.name })}</h2>
        {rejoin && <p className="muted">{t('dlg_rejoin_note')}</p>}
        <p className="lede">{t('dlg_email_lede')}</p>
        <WizardProgress
          labels={[t('dlg_wiz_ask'), t('dlg_wiz_wait'), t('dlg_wiz_optin'), t('dlg_wiz_install'), t('dlg_wiz_record')]}
          current={overviewIdx}
          doneFlags={[!!l, !!(l && l.listedAt), !!play.optedIn, !!play.installed, false]}
        />
        {listing.loading ? <p className="muted">{t('loading')}</p> : phase === 'ask' ? (
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span><span className="t">{t('dlg_consent_title', { name: app.name })}</span>
              {email && <span className="d addr">{email}</span>}
              <span className="d">{t('dlg_consent_hint')}</span></span>
          </label>
        ) : phase === 'wait' ? (
          <div className="notice info" role="status" style={{ marginBottom: 0 }}>
            <span>{t('dlg_wait_listed', { date: fmtDate(l!.requestedAt) })}</span>
          </div>
        ) : phase === 'optin' ? (
          <WizardStep
            title={t('dlg_optin_title')}
            body={t('dlg_optin_body')}
            actionHref={app.optInUrl || playUrl || '#'}
            actionLabel={t('dlg_open_optin')}
            onDone={() => {
              markPlay({ optedIn: true }, 'install')
              if (isLikelyMobile() && storeOk) openPlayInstall(app)
            }}
            doneLabel={t('dlg_already_tester')}
          />
        ) : phase === 'install' ? (
          <WizardStep
            title={t('dlg_install_title')}
            body={storeOk ? t('dlg_install_body_store') : t('dlg_install_body_optin')}
            actionHref={playUrl}
            actionLabel={storeOk ? t('dlg_open_play') : t('dlg_open_optin_again')}
            onBack={() => setPlayStep('optin')}
            onDone={() => markPlay({ installed: true }, 'confirm')}
            doneLabel={t('dlg_already_installed')}
          />
        ) : (
          <div className="stack-12">
            <p className="strong">{t('dlg_record_review_title')}</p>
            <p className="muted">{t('dlg_record_email_body')}</p>
            <button type="button" className="text-action" onClick={() => setPlayStep('install')}>{t('dlg_back_to_install')}</button>
          </div>
        )}
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        {phase !== 'ask' && !listing.loading && (
          <button type="button" className="text-action quiet" style={{ marginRight: 'auto' }} disabled={busy} onClick={withdraw}>{t('dlg_withdraw')}</button>
        )}
        {phase === 'ask' && !consent && <span className="why" id="join-why">{t('dlg_consent_needed')}</span>}
        <button type="button" className="btn" onClick={onClose}>{phase === 'wait' ? t('close') : t('cancel')}</button>
        {phase === 'ask' && (
          <button className="btn primary" disabled={!consent || busy || listing.loading} aria-describedby={!consent ? 'join-why' : undefined}>{busy ? t('sending') : t('dlg_request_add')}</button>
        )}
        {phase === 'confirm' && (
          <button className="btn primary" disabled={busy || !emailPlayStepsDone(play)}>{busy ? t('saving') : t('dlg_record_as_tester')}</button>
        )}
      </div>
    </form>
  )
}

function WizardProgress({ labels, current, doneFlags }: { labels: string[]; current: number; doneFlags: boolean[] }) {
  const t = useT()
  return (
    <ol className="steps wizard-steps" aria-label={t('steps_label')}>
      {labels.map((label, i) => {
        const done = doneFlags[i] || i < current
        const here = i === current
        return (
          <li key={label} aria-current={here ? 'step' : undefined}>
            <span className="num" aria-hidden="true">{done && !here ? '✓' : String(i + 1)}</span>
            <span>{label}{done && !here && <span className="muted small">{t('step_done_suffix')}</span>}</span>
          </li>
        )
      })}
    </ol>
  )
}

function WizardStep({
  title, body, actionHref, actionLabel, actionHint, onDone, doneLabel, onBack,
}: {
  title: string
  body: ReactNode
  actionHref: string
  actionLabel: string
  actionHint?: string
  onDone: () => void
  doneLabel: string
  onBack?: () => void
}) {
  const t = useT()
  return (
    <div className="stack-12 wizard-step">
      <div className="stack-8">
        <p className="strong">{title}</p>
        <p className="muted">{body}</p>
        {actionHint && <p className="muted small addr">{actionHint}</p>}
      </div>
      <a className="btn primary" href={actionHref} target="_blank" rel="noreferrer" style={{ justifySelf: 'start' }}>
        <IconExternal />{actionLabel}
      </a>
      <div className="wizard-step-actions">
        {onBack && <button type="button" className="btn" onClick={onBack}>{t('back')}</button>}
        <button type="button" className="btn" onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
  )
}

export function FeedbackDialog({ open, onClose, app, entry }: { open: boolean; onClose: () => void; app: AppDoc; entry?: TesterDoc }) {
  const t = useT()
  return (
    <Dialog open={open} onClose={onClose} label={t('dlg_feedback_label')}>
      <FeedbackForm app={app} entry={entry} onClose={onClose} />
    </Dialog>
  )
}

function parseDeviceSummary(raw = '') {
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/s);
  return match ? { device: match[1], summary: match[2] } : { device: '', summary: raw };
}

function FeedbackForm({ onClose, app, entry }: { onClose: () => void; app: AppDoc; entry?: TesterDoc }) {
  const t = useT()
  const toast = useToast()
  const initial = parseDeviceSummary(entry?.feedbackSummary ?? '')
  const [device, setDevice] = useState(initial.device)
  const [summary, setSummary] = useState(initial.summary)
  const { busy, err, run } = useSubmit(onClose)
  const already = !!entry?.feedbackSent

  const save = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      const cleanDevice = device.trim()
      const cleanSummary = summary.trim()
      const combined = cleanDevice ? ('[' + cleanDevice + '] ' + cleanSummary).trim() : cleanSummary
      await api.markFeedbackSent({ appId: app.id, sent: true, summary: combined || undefined })
      toast(already ? t('dlg_toast_feedback_updated') : t('dlg_toast_feedback_sent'))
    })
  }
  const unmark = () => run(async () => {
    await api.markFeedbackSent({ appId: app.id, sent: false })
    toast(t('dlg_toast_feedback_cleared'))
  })
  return (
      <form onSubmit={save}>
        <div className="sheet-body">
          <h2>{already ? t('dlg_feedback_title_note') : (isLiveApp(app) ? t('dlg_feedback_title_review') : t('dlg_feedback_title'))}</h2>
          {!already && (
            <p className="lede">{isLiveApp(app) ? t('dlg_feedback_lede_live') : t('dlg_feedback_lede')}</p>
          )}
          {!already && (
            <a className="btn" style={{ justifySelf: 'start' }} href={playInstallUrl(app)} target="_blank" rel="noreferrer"><IconExternal />{t('dlg_open_app_play', { name: app.name })}</a>
          )}
          <div className="field">
            <label htmlFor="fb-device">{t('dlg_device_label')}<span className="opt">{t('field_optional')}</span></label>
            <input id="fb-device" className="input" maxLength={60} placeholder={t('dlg_device_placeholder')} value={device} onChange={(e) => setDevice(e.target.value)} aria-describedby="fb-dev-hint" />
            <span className="hint" id="fb-dev-hint">{t('dlg_device_hint')}</span>
          </div>
          <div className="field">
            <label htmlFor="fb-sum">{t('dlg_summary_label')}<span className="opt">{t('field_optional')}</span></label>
            <textarea id="fb-sum" className="input" maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} aria-describedby="fb-sum-hint" />
            <span className="hint" id="fb-sum-hint">{t('dlg_summary_hint')}</span>
            <span className="count">{summary.length}/500</span>
          </div>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          {already && <button type="button" className="text-action quiet" style={{ marginRight: 'auto' }} disabled={busy} onClick={unmark}>{t('dlg_unmark_feedback')}</button>}
          <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" disabled={busy}>{busy ? t('saving') : already ? t('dlg_save_note') : t('dlg_mark_sent')}</button>
        </div>
      </form>
  )
}

const BUILD_ORDER = ['versionName', 'uploadedAt', 'changelog'] as const
const blankBuild = (): BuildInput => ({ versionName: '', uploadedAt: todayIso(), changelog: '' })

export function BuildDialog({ open, onClose, app }: { open: boolean; onClose: () => void; app: AppDoc }) {
  const t = useT()
  const toast = useToast()
  const [f, setF] = useState<BuildInput>(blankBuild)
  const v = useValidation(validateBuild(f, todayIso()), BUILD_ORDER)
  const close = () => { v.reset(); onClose() }
  const { busy, err, run } = useSubmit(() => {
    toast(t('dlg_toast_build', { version: f.versionName.trim() }))
    setF(blankBuild()); close()
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation() // never let this submit reach a form the dialog is rendered beside
    const bad = v.check()
    if (bad.length) { document.getElementById(`b-${bad[0]}`)?.focus(); return }
    run(() => api.addBuild({ appId: app.id, versionName: f.versionName.trim(), uploadedAt: f.uploadedAt, changelog: f.changelog.trim() }))
  }
  return (
    <Dialog open={open} onClose={close} label={t('dlg_build_label')}>
      <form onSubmit={submit} noValidate>
        <div className="sheet-body">
          <h2>{t('dlg_build_title')}</h2>
          <p className="lede">{t('dlg_build_lede')}</p>
          <Field id="b-versionName" label={t('dlg_build_version')} hint={t('dlg_build_version_hint')} error={v.errors.versionName}>
            <input className="input" maxLength={BUILD_LIMITS.versionName} autoComplete="off" spellCheck={false} value={f.versionName}
              onChange={(e) => setF({ ...f, versionName: e.target.value })} onBlur={v.blur('versionName')}
              {...fieldAria('b-versionName', { hint: true, error: v.errors.versionName })} />
          </Field>
          <Field id="b-uploadedAt" label={t('dlg_build_date')} hint={t('dlg_build_date_hint')} error={v.errors.uploadedAt}>
            <input type="date" className="input" max={todayIso()} value={f.uploadedAt}
              onChange={(e) => setF({ ...f, uploadedAt: e.target.value })} onBlur={v.blur('uploadedAt')}
              {...fieldAria('b-uploadedAt', { hint: true, error: v.errors.uploadedAt })} />
          </Field>
          <Field id="b-changelog" label={t('dlg_build_changelog')} hint={t('dlg_build_changelog_hint')} error={v.errors.changelog}
            count={`${f.changelog.length}/${BUILD_LIMITS.changelog}`}>
            <input className="input" maxLength={BUILD_LIMITS.changelog} autoComplete="off" value={f.changelog}
              onChange={(e) => setF({ ...f, changelog: e.target.value })} onBlur={v.blur('changelog')}
              {...fieldAria('b-changelog', { hint: true, error: v.errors.changelog })} />
          </Field>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={close}>{t('cancel')}</button>
          <button className="btn primary" aria-busy={busy || undefined}>{busy ? t('saving') : t('dlg_build_submit')}</button>
        </div>
      </form>
    </Dialog>
  )
}

const MANUAL_ORDER = ['displayName', 'email', 'optedInAt'] as const
const blankManual = (): ManualInput => ({ displayName: '', email: '', optedInAt: todayIso() })

export function ManualTesterDialog({ open, onClose, app }: { open: boolean; onClose: () => void; app: AppDoc }) {
  const t = useT()
  const toast = useToast()
  const [f, setF] = useState<ManualInput>(blankManual)
  const v = useValidation(validateManual(f, todayIso()), MANUAL_ORDER)
  const close = () => { v.reset(); onClose() }
  const { busy, err, run } = useSubmit(() => { toast(t('dlg_toast_manual', { name: f.displayName.trim() })); setF(blankManual()); close() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const bad = v.check()
    if (bad.length) { document.getElementById(`m-${bad[0]}`)?.focus(); return }
    run(() => api.addManualTester({ appId: app.id, displayName: f.displayName.trim(), email: f.email.trim(), optedInAt: f.optedInAt }))
  }
  return (
    <Dialog open={open} onClose={close} label={t('dlg_manual_label')}>
      <form onSubmit={submit} noValidate>
        <div className="sheet-body">
          <h2>{t('dlg_manual_title')}</h2>
          <p className="lede">{t('dlg_manual_lede')}</p>
          <Field id="m-displayName" label={t('dlg_manual_name')} hint={t('dlg_manual_name_hint')} error={v.errors.displayName}>
            <input className="input" maxLength={MANUAL_LIMITS.displayName} autoComplete="off" value={f.displayName}
              onChange={(e) => setF({ ...f, displayName: e.target.value })} onBlur={v.blur('displayName')}
              {...fieldAria('m-displayName', { hint: true, error: v.errors.displayName })} />
          </Field>
          <Field id="m-email" label={t('dlg_manual_email')} error={v.errors.email}
            hint={t('dlg_manual_email_hint')}>
            <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} className="input" value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })} onBlur={v.blur('email')}
              {...fieldAria('m-email', { hint: true, error: v.errors.email })} />
          </Field>
          <Field id="m-optedInAt" label={t('dlg_manual_since')} hint={t('dlg_manual_since_hint')} error={v.errors.optedInAt}>
            <input type="date" className="input" max={todayIso()} value={f.optedInAt}
              onChange={(e) => setF({ ...f, optedInAt: e.target.value })} onBlur={v.blur('optedInAt')}
              {...fieldAria('m-optedInAt', { hint: true, error: v.errors.optedInAt })} />
          </Field>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={close}>{t('cancel')}</button>
          <button className="btn primary" aria-busy={busy || undefined}>{busy ? t('saving') : t('dlg_manual_submit')}</button>
        </div>
      </form>
    </Dialog>
  )
}

/** Note and opt-in date only. Verified, Replied and status are edited inline in the tester table (ADR-009 §3). */
export function TesterDialog({ open, onClose, app, tester }: { open: boolean; onClose: () => void; app: AppDoc; tester?: TesterDoc }) {
  const t = useT()
  return (
    <Dialog open={open} onClose={onClose} label={tester ? t('dlg_tester_label', { name: tester.displayName }) : t('dlg_tester_label_fallback')}>
      {tester && <TesterForm key={tester.id} app={app} tester={tester} onClose={onClose} />}
    </Dialog>
  )
}

function TesterForm({ app, tester, onClose }: { app: AppDoc; tester: TesterDoc; onClose: () => void }) {
  const t = useT()
  const toast = useToast()
  const [f, setF] = useState({ optedInAt: isoDate(tester.optedInAt), note: tester.note ?? '' })
  const dateErr = !f.optedInAt ? t('dlg_tester_date_required') : f.optedInAt > todayIso() ? t('dlg_tester_date_future') : undefined
  const [showErr, setShowErr] = useState(false)
  const { busy, err, run } = useSubmit(() => { toast(t('dlg_toast_tester_saved', { name: tester.displayName })); onClose() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (dateErr) { setShowErr(true); document.getElementById('t-d')?.focus(); return }
    run(() => updateTesterAsCreator(app.id, tester, {
      optedInAt: f.optedInAt !== isoDate(tester.optedInAt) ? f.optedInAt : undefined,
      note: f.note !== (tester.note ?? '') ? f.note : undefined,
    }))
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className="sheet-body">
        <div>
          <h2>{tester.displayName}</h2>
          <p className="muted">{tester.maskedEmail}</p>
        </div>
        <Field id="t-d" label={t('dlg_tester_since')} hint={t('dlg_tester_since_hint')} error={showErr ? dateErr : undefined}>
          <input type="date" className="input" max={todayIso()} value={f.optedInAt}
            onChange={(e) => setF({ ...f, optedInAt: e.target.value })} onBlur={() => setShowErr(true)}
            {...fieldAria('t-d', { hint: true, error: showErr ? dateErr : undefined })} />
        </Field>
        <Field id="t-n" label={t('dlg_tester_note')} optional hint={t('dlg_tester_note_hint')} count={`${f.note.length}/140`}>
          <input className="input" maxLength={140} autoComplete="off" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })}
            {...fieldAria('t-n', { hint: true })} />
        </Field>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>{t('cancel')}</button>
        <button className="btn primary" aria-busy={busy || undefined}>{busy ? t('saving') : t('save')}</button>
      </div>
    </form>
  )
}