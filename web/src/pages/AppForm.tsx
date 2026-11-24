import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorBox, failToast, NotFound, RelTime, ShowAll, Skel, useToast } from '../components/bits'
import { BuildDialog } from '../components/dialogs'
import { IconBack, IconPlus } from '../components/icons'
import { useAuth } from '../lib/auth'
import { api, errorText, restoreApp, softDeleteApp, updateApp, useApp, useBuilds, usePublicProfile, type AppInput } from '../lib/data'
import { COMMUNITY_GROUP, EMAIL_LIST_MIN_TESTING } from '../lib/community'
import { usePageMeta } from '../lib/pageMeta'
import { fmtDate, isoDate, TARGET_TESTERS } from '../lib/progress'
import { useT } from '../lib/i18n'
import type { AppDoc, AppStatus, TesterMethod } from '../lib/types'
import { useValidation } from '../lib/useValidation'
import { LIMITS, OPT_IN_PREFIX, STORE_PREFIX, type Errors } from '../lib/validate'

function validateAppI18n(
  v: AppInput,
  opts: { creating: boolean; groupConfirmed: boolean; released?: boolean },
  t: ReturnType<typeof useT>,
): Errors {
  const e: Errors = {}
  const released = !!opts.released
  if (!v.name.trim()) e.name = t('form_val_name_required')
  else if (v.name.trim().length > LIMITS.name) e.name = t('form_val_max_chars', { n: LIMITS.name })
  if (!v.description.trim()) e.description = t('form_val_description_required')
  else if (v.description.trim().length > LIMITS.description) e.description = t('form_val_max_chars', { n: LIMITS.description })
  if (!released) {
    if (!v.optInUrl.trim().startsWith(OPT_IN_PREFIX) || v.optInUrl.trim().length <= OPT_IN_PREFIX.length)
      e.optInUrl = t('form_val_optin_required', { prefix: OPT_IN_PREFIX })
  } else if (v.optInUrl.trim() && (!v.optInUrl.trim().startsWith(OPT_IN_PREFIX) || v.optInUrl.trim().length <= OPT_IN_PREFIX.length)) {
    e.optInUrl = t('form_val_optin_optional', { prefix: OPT_IN_PREFIX })
  }
  if (!v.storeUrl?.trim()) e.storeUrl = t('form_val_store_required')
  else if (!v.storeUrl.trim().startsWith(STORE_PREFIX)) e.storeUrl = t('form_val_store_prefix', { prefix: STORE_PREFIX })
  if (v.packageName?.trim() && !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(v.packageName.trim())) e.packageName = t('form_val_package_format')
  if ((v.feedbackGuide?.trim().length ?? 0) > LIMITS.feedbackGuide) e.feedbackGuide = t('form_val_max_chars', { n: LIMITS.feedbackGuide })
  if (opts.creating && !released && !opts.groupConfirmed) e.groupConfirmed = t('form_val_group_confirm')
  return e
}

/** Field ids in the order they appear on screen: submit focuses the first one in error. */
const FIELD_ORDER = ['name', 'description', 'packageName', 'optInUrl', 'storeUrl', 'testStartDate', 'feedbackGuide', 'groupConfirmed'] as const
const UNDO_MS = 8000

const EMPTY: AppInput = { name: '', description: '', optInUrl: '', storeUrl: '', packageName: '', testStartDate: '', feedbackGuide: '' }

export function AppForm() {
  const t = useT()
  const { id } = useParams()
  const { user, ready, isAdmin, signIn } = useAuth()
  const toast = useToast()
  const app = useApp(id)
  usePageMeta(id
    ? (app.data && !app.data.deleted ? t('form_meta_edit_named', { name: app.data.name }) : t('form_meta_edit'))
    : t('form_meta_add'))

  if (!ready || (id && app.loading)) return <FormSkeleton />
  if (!user) {
    return (
      <div className="state-page">
        <h1 className="page-title">{id ? t('form_title_edit') : t('form_title_add')}</h1>
        <p>{t('form_sign_in_body')}</p>
        <button className="btn primary" onClick={() => signIn().catch((e) => toast(errorText(e, t)))}>{t('sign_in_google')}</button>
      </div>
    )
  }
  if (id) {
    if (app.error) return <ErrorBox text={t('form_load_error')} onRetry={app.retry} />
    if (!app.data || app.data.deleted) return <NotFound what={t('nav_apps')} />
    if (app.data.creatorUid !== user.uid && !isAdmin) {
      return <ErrorBox text={t('form_edit_forbidden')} />
    }
    return <Form key={app.data.id} existing={app.data} />
  }
  return <Form />
}

function Form({ existing }: { existing?: AppDoc }) {
  const t = useT()
  const navigate = useNavigate()
  const toast = useToast()
  const creating = !existing
  const [v, setV] = useState<AppInput>(() => existing ? {
    name: existing.name, description: existing.description, optInUrl: existing.optInUrl ?? '',
    storeUrl: existing.storeUrl ?? '', packageName: existing.packageName ?? '',
    testStartDate: isoDate(existing.testStartDate), feedbackGuide: existing.feedbackGuide ?? '',
  } : EMPTY)
  const [status, setStatus] = useState<AppStatus>(existing?.status ?? 'recruiting')
  const [released, setReleased] = useState(existing?.status === 'live')
  const [group, setGroup] = useState(false)
  const [method, setMethod] = useState<TesterMethod>(existing?.testerMethod ?? 'google_group')
  const [slots, setSlots] = useState<number>(existing?.testerSlots ?? TARGET_TESTERS)
  const effectiveStatus: AppStatus = creating ? (released ? 'live' : 'recruiting') : status
  const isReleased = effectiveStatus === 'live'
  const groupStep = creating && method === 'google_group' && !isReleased
  // Email list unlocks after testing others (the database enforces it too). An app already on it keeps it.
  const { user } = useAuth()
  const creatorStats = usePublicProfile(existing ? existing.creatorUid : user?.uid)
  const testingCount = creatorStats.data?.testingCount ?? 0
  const emailListLocked = existing?.testerMethod !== 'email_list' && testingCount < EMAIL_LIST_MIN_TESTING
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [buildOpen, setBuildOpen] = useState(false)

  const initial = useRef({ v, status, released, group, method, slots })
  const leaving = useRef(false)
  const dirty = useMemo(() => {
    const i = initial.current
    return status !== i.status || released !== i.released || group !== i.group || method !== i.method || slots !== i.slots
      || (Object.keys(v) as (keyof AppInput)[]).some((k) => (v[k] ?? '') !== (i.v[k] ?? ''))
  }, [v, status, released, group, method, slots])

  // ADR-009 §6: warn before leaving with unsaved changes (reload, tab close, and links on this page).
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { if (!leaving.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const guard = (e: MouseEvent) => {
    if (dirty && !leaving.current && !window.confirm(t('form_leave_unsaved'))) e.preventDefault()
  }

  const errorsNow = useMemo(
    () => validateAppI18n(v, {
      creating: creating && method === 'google_group' && !isReleased,
      groupConfirmed: group,
      released: isReleased,
    }, t),
    [v, creating, group, method, isReleased, t],
  )
  const { errors, blur, check } = useValidation(errorsNow, FIELD_ORDER)

  const set = (k: keyof AppInput) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bad = check()
    if (bad.length) {
      document.getElementById(`f-${bad[0]}`)?.focus()
      return
    }
    setBusy(true); setFail(null)
    const clean: AppInput = {
      name: v.name.trim(), description: v.description.trim(),
      optInUrl: isReleased ? v.optInUrl.trim() : v.optInUrl.trim(),
      storeUrl: v.storeUrl.trim(), packageName: v.packageName?.trim() || undefined,
      testStartDate: v.testStartDate || undefined, feedbackGuide: v.feedbackGuide?.trim() || undefined,
    }
    try {
      if (creating) {
        const { appId } = await api.createApp({
          ...clean,
          groupConfirmed: isReleased || (method === 'google_group' && group),
          testerMethod: isReleased ? 'google_group' : method,
          testerSlots: slots,
          status: isReleased ? 'live' : 'recruiting',
        })
        leaving.current = true
        toast(isReleased
          ? t('form_toast_registered_live', { name: clean.name })
          : t('form_toast_registered_closed', { name: clean.name }))
        navigate(`/apps/${appId}`)
      } else {
        await updateApp(existing.id, {
          ...clean,
          status: effectiveStatus,
          testerMethod: isReleased ? 'google_group' : method,
          testerSlots: slots,
        })
        leaving.current = true
        toast(t('form_toast_saved'))
        navigate(`/apps/${existing.id}`)
      }
    } catch (err) { setFail(errorText(err, t)) } finally { setBusy(false) }
  }

  // ADR-009 §7: delete at once, undo from the toast. The creator may restore within 10 minutes (restore_app).
  const remove = async () => {
    if (!existing || deleting) return
    const { id, name } = existing
    setDeleting(true)
    try {
      await softDeleteApp(id)
      leaving.current = true
      navigate('/apps')
      toast({
        text: t('form_toast_deleted', { name }),
        duration: UNDO_MS,
        action: {
          label: t('form_undo'),
          onClick: () => {
            restoreApp(id)
              .then(() => { toast(t('form_toast_restored', { name })); navigate(`/apps/${id}`) })
              .catch((err) => toast(failToast(err, t('form_toast_restore_fail'))))
          },
        },
      })
    } catch (err) {
      toast(failToast(err))
      setDeleting(false)
    }
  }

  const field = (k: keyof AppInput, label: string, input: ReactNode, hint?: string, limit?: number) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      {input}
      {hint && <span className="hint" id={`f-${k}-hint`}>{hint}</span>}
      {errors[k] && <span className="hint err" id={`f-${k}-err`} role="alert">{errors[k]}</span>}
      {limit && <span className="count">{(v[k] ?? '').length}/{limit}</span>}
    </div>
  )
  const aria = (k: keyof AppInput, hasHint = false) => ({
    id: `f-${k}`,
    'aria-invalid': !!errors[k] || undefined,
    'aria-describedby': [hasHint && `f-${k}-hint`, errors[k] && `f-${k}-err`].filter(Boolean).join(' ') || undefined,
    onBlur: blur(k as (typeof FIELD_ORDER)[number]),
  })

  return (
    <>
    <form className="form-wrap" onSubmit={submit} noValidate>
      <Link to={existing ? `/apps/${existing.id}` : '/apps'} className="crumb" onClick={guard}><IconBack />{existing ? existing.name : t('nav_apps')}</Link>
      <div className="title-row">
        <div>
          <h1>{creating ? t('form_title_add') : t('form_title_edit')}</h1>
          <p className="sub">{creating
            ? (isReleased ? t('form_sub_create_live') : t('form_sub_create_closed'))
            : t('form_sub_registered', { date: fmtDate(existing.createdAt) })}</p>
        </div>
      </div>

      <section className="form-section">
        <div className="label-col"><h2>{t('form_section_app_h')}</h2><p>{t('form_section_app_p')}</p></div>
        <div className="form-panel">
          {field('name', t('form_label_name'), <input className="input" maxLength={LIMITS.name} value={v.name} onChange={set('name')} {...aria('name')} />, undefined, LIMITS.name)}
          {field('description', t('form_label_description'), <textarea className="input" rows={3} maxLength={LIMITS.description} value={v.description} onChange={set('description')} {...aria('description', true)} />, t('form_hint_description'), LIMITS.description)}
          {field('packageName', `${t('form_label_package')}${t('field_optional')}`, <input className="input" placeholder={t('form_package_placeholder')} value={v.packageName} onChange={set('packageName')} {...aria('packageName', true)} />, t('form_hint_package'))}
          {creating && (
            <label className="check" style={{ padding: 0 }}>
              <input type="checkbox" checked={released} onChange={(e) => setReleased(e.target.checked)} />
              <span>
                <span className="t">{t('form_live_check_t')}</span>
                <span className="d">{t('form_live_check_d')}</span>
              </span>
            </label>
          )}
        </div>
      </section>

      <section className="form-section">
        <div className="label-col">
          <h2>{t('form_section_play_h')}</h2>
          <p>{isReleased ? t('form_section_play_p_live') : t('form_section_play_p_closed')}</p>
        </div>
        <div className="form-panel">
          {!isReleased && field('optInUrl', t('form_label_optin'), <input className="input" type="url" inputMode="url" placeholder={`${OPT_IN_PREFIX}nama.paket`} value={v.optInUrl} onChange={set('optInUrl')} {...aria('optInUrl', true)} />, t('form_hint_optin_prefix', { prefix: OPT_IN_PREFIX }))}
          {field('storeUrl', t('form_label_store'), <input className="input" type="url" inputMode="url" placeholder={t('form_store_placeholder')} value={v.storeUrl} onChange={set('storeUrl')} {...aria('storeUrl', true)} />, isReleased ? t('form_hint_store_live') : t('form_hint_store_closed'))}
        </div>
      </section>

      <section className="form-section">
        <div className="label-col">
          <h2>{isReleased ? t('form_section_test_h_live') : t('form_section_test_h_closed')}</h2>
          <p>{isReleased ? t('form_section_test_p_live') : t('form_section_test_p_closed')}</p>
        </div>
        <div className="form-panel">
          {!isReleased && field('testStartDate', `${t('form_label_test_start')}${t('field_optional')}`, <input className="input" type="date" value={v.testStartDate} onChange={set('testStartDate')} {...aria('testStartDate')} />)}
          {!creating && (
            <div className="field">
              <label htmlFor="f-status">{t('form_label_status')}</label>
              <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as AppStatus)}>
                {(['recruiting', 'testing', 'applied', 'live'] as AppStatus[]).map((s) => <option key={s} value={s}>{t(`app_status_${s}`)}</option>)}
              </select>
              {status === 'live' && (
                <span className="hint">{t('form_hint_status_live')}</span>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="form-section">
        <div className="label-col">
          <h2>{t('form_section_feedback_h')}</h2>
          <p>{t('form_section_feedback_p')}</p>
        </div>
        <div className="form-panel">
          {field(
            'feedbackGuide',
            `${t('form_label_feedback')}${t('field_optional')}`,
            <textarea
              className="input"
              rows={5}
              maxLength={LIMITS.feedbackGuide}
              placeholder={t('form_feedback_placeholder')}
              value={v.feedbackGuide}
              onChange={set('feedbackGuide')}
              {...aria('feedbackGuide', true)}
            />,
            t('form_hint_feedback'),
            LIMITS.feedbackGuide
          )}
          <div className="preview-card" role="group" aria-label={t('form_preview_label')}>
            <span className="small muted">{t('form_preview_lede')}</span>
            <span className="t">{t('form_preview_title')}</span>
            <p className="guide-quote">{v.feedbackGuide?.trim() || <span className="muted">{t('form_preview_empty')}</span>}</p>
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="label-col">
          <h2>{isReleased ? t('form_section_who_h_live') : t('form_section_who_h_closed')}</h2>
          <p>{isReleased ? t('form_section_who_p_live') : t('form_section_who_p_closed')}</p>
        </div>
        <div className="form-panel">
          <div className="field">
            <label htmlFor="f-slots">{isReleased ? t('form_slots_label_live') : t('form_slots_label_closed')}</label>
            <select id="f-slots" className="input num" style={{ maxWidth: '12rem' }} value={slots} onChange={(e) => setSlots(Number(e.target.value))} aria-describedby="f-slots-hint">
              {Array.from({ length: TARGET_TESTERS }, (_, i) => TARGET_TESTERS - i).map((n) => (
                <option key={n} value={n}>{n} {isReleased ? t('form_slots_option_live') : t('form_slots_option_closed')}</option>
              ))}
            </select>
            <span className="hint" id="f-slots-hint">{isReleased
              ? t('form_slots_hint_live')
              : t('form_slots_hint_closed', { target: TARGET_TESTERS })}{existing && !isReleased ? t('form_slots_hint_edit_note') : ''}</span>
          </div>
          {!isReleased && (
          <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} aria-describedby={groupStep ? undefined : 'f-method-hint'}>
            <legend className="sr-only">{t('form_method_legend')}</legend>
            <label className="check">
              <input type="radio" name="tester-method" value="google_group" checked={method === 'google_group'} onChange={() => setMethod('google_group')} />
              <span><span className="t">{t('form_method_group_t')}</span>
                <span className="d">{t('form_method_group_d', { group: COMMUNITY_GROUP })}</span></span>
            </label>
            <label className="check">
              <input type="radio" name="tester-method" value="email_list" checked={method === 'email_list'} onChange={() => setMethod('email_list')} disabled={emailListLocked} aria-describedby={emailListLocked ? 'f-email-lock' : undefined} />
              <span><span className="t">{t('form_method_email_t')}</span>
                <span className="d">{t('form_method_email_d')}</span>
                {emailListLocked && (
                  <span className="d lock" id="f-email-lock">
                    {creatorStats.data === undefined
                      ? t('form_email_lock_loading')
                      : <>{t('form_email_lock_body', { min: EMAIL_LIST_MIN_TESTING, count: testingCount })} <Link to="/apps">{t('form_email_lock_link')}</Link></>}
                  </span>
                )}</span>
            </label>
            {/* The group checkbox below carries the full Play Console path; say it once. */}
            {!groupStep && <span className="hint" id="f-method-hint">{t('form_method_hint')}</span>}
          </fieldset>
          )}
          {groupStep && (
            <label className="check" style={{ padding: 0 }}>
              <input id="f-groupConfirmed" type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} onBlur={blur('groupConfirmed')} aria-describedby={`f-group-hint${errors.groupConfirmed ? ' f-groupConfirmed-err' : ''}`} aria-invalid={!!errors.groupConfirmed || undefined} />
              <span><span className="t">{t('form_group_confirm_t', { group: COMMUNITY_GROUP })}</span>
                <span className="d" id="f-group-hint">{t('form_group_confirm_d')}</span>
                {errors.groupConfirmed && <span className="d err-text" id="f-groupConfirmed-err" role="alert">{errors.groupConfirmed}</span>}</span>
            </label>
          )}
        </div>
      </section>

      {existing && <BuildsSection app={existing} onAdd={() => setBuildOpen(true)} />}

      {fail && <ErrorBox text={fail} />}
      <div className="form-foot">
        <Link className="btn" to={existing ? `/apps/${existing.id}` : '/apps'} onClick={guard}>{t('cancel')}</Link>
        <button className="btn primary" disabled={busy}>{busy ? t('saving') : creating ? t('form_submit_add') : t('form_submit_save')}</button>
      </div>

      {existing && (
        <section className="form-section danger-zone">
          <div className="label-col"><h2>{t('form_section_delete_h')}</h2><p>{t('form_section_delete_p')}</p></div>
          <div><button type="button" className="btn danger" disabled={deleting} onClick={remove}>{deleting ? t('form_deleting') : t('form_delete_btn', { name: existing.name })}</button></div>
        </section>
      )}
    </form>
    {/* Dialogs live outside the app form: a nested <form> would submit the app form too. */}
    {existing && <BuildDialog open={buildOpen} onClose={() => setBuildOpen(false)} app={existing} />}
    </>
  )
}

const FEW_BUILDS = 4

function BuildsSection({ app, onAdd }: { app: AppDoc; onAdd: () => void }) {
  const t = useT()
  const builds = useBuilds(app.id)
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => [...builds.data].sort((a, b) => b.uploadedAt - a.uploadedAt), [builds.data])
  const shown = all ? sorted : sorted.slice(0, FEW_BUILDS)
  return (
    <section className="form-section">
      <div className="label-col">
        <h2>{t('form_builds_h')}</h2>
        <p>{t('form_builds_p')}</p>
      </div>
      <div className="form-panel">
        {builds.error ? <ErrorBox text={t('form_builds_error')} onRetry={builds.retry} /> : builds.loading ? <Skel w={200} /> : sorted.length === 0 ? <p className="muted">{t('form_builds_empty')}</p> : (
          <ol id="form-build-list">
            {shown.map((b) => (
              <li className="row-line" key={b.id}>
                <span className="grow cell-2"><b>{b.versionName}</b><span>{b.changelog}</span></span>
                <RelTime t={b.uploadedAt} />
              </li>
            ))}
          </ol>
        )}
        {sorted.length > FEW_BUILDS && <ShowAll open={all} total={sorted.length} onToggle={() => setAll((x) => !x)} controls="form-build-list" />}
        <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={onAdd}><IconPlus />{t('form_builds_add')}</button>
      </div>
    </section>
  )
}

function FormSkeleton() {
  return (
    <div className="form-wrap" aria-busy="true">
      <Skel w={120} h={16} />
      <div className="title-row"><div><Skel w={260} h={32} /></div></div>
      {[0, 1, 2].map((i) => (
        <section className="form-section" key={i}>
          <div className="label-col"><Skel w={140} h={20} /></div>
          <div className="form-panel"><Skel w="100%" h={44} /><Skel w="100%" h={44} /></div>
        </section>
      ))}
    </div>
  )
}
