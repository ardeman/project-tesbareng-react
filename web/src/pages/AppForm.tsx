import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorBox, failToast, NotFound, RelTime, ShowAll, Skel, useToast } from '../components/bits'
import { BuildDialog } from '../components/dialogs'
import { IconBack, IconPlus } from '../components/icons'
import { useAuth } from '../lib/auth'
import { api, errorText, restoreApp, softDeleteApp, updateApp, useApp, useBuilds, usePublicProfile, type AppInput } from '../lib/data'
import { COMMUNITY_GROUP, EMAIL_LIST_MIN_TESTING } from '../lib/community'
import { usePageMeta } from '../lib/pageMeta'
import { appStatusLabel, fmtDate, isoDate, TARGET_TESTERS } from '../lib/progress'
import type { AppDoc, AppStatus, TesterMethod } from '../lib/types'
import { useValidation } from '../lib/useValidation'
import { LIMITS, OPT_IN_PREFIX, validateApp } from '../lib/validate'

/** Field ids in the order they appear on screen: submit focuses the first one in error. */
const FIELD_ORDER = ['name', 'description', 'packageName', 'optInUrl', 'storeUrl', 'testStartDate', 'feedbackGuide', 'groupConfirmed'] as const
const UNDO_MS = 8000

const EMPTY: AppInput = { name: '', description: '', optInUrl: '', storeUrl: '', packageName: '', testStartDate: '', feedbackGuide: '' }

export function AppForm() {
  const { id } = useParams()
  const { user, ready, isAdmin, signIn } = useAuth()
  const toast = useToast()
  const app = useApp(id)
  usePageMeta(id ? (app.data && !app.data.deleted ? `Ubah ${app.data.name}` : 'Ubah aplikasi') : 'Tambah aplikasi')

  if (!ready || (id && app.loading)) return <FormSkeleton />
  if (!user) {
    return (
      <div className="state-page">
        <h1 className="page-title">{id ? 'Edit aplikasi' : 'Tambah aplikasi'}</h1>
        <p>Masuk dengan akun Google yang Anda pakai di Play Console.</p>
        <button className="btn primary" onClick={() => signIn().catch((e) => toast(errorText(e)))}>Masuk dengan Google</button>
      </div>
    )
  }
  if (id) {
    if (app.error) return <ErrorBox text="Aplikasi gagal dimuat. Periksa koneksi Anda, lalu coba lagi." onRetry={app.retry} />
    if (!app.data || app.data.deleted) return <NotFound what="Aplikasi" />
    if (app.data.creatorUid !== user.uid && !isAdmin) {
      return <ErrorBox text={`Hanya pembuat aplikasi ini yang bisa mengubahnya. Kembali ke halaman aplikasi untuk melihatnya.`} />
    }
    return <Form key={app.data.id} existing={app.data} />
  }
  return <Form />
}

function Form({ existing }: { existing?: AppDoc }) {
  const navigate = useNavigate()
  const toast = useToast()
  const creating = !existing
  const [v, setV] = useState<AppInput>(() => existing ? {
    name: existing.name, description: existing.description, optInUrl: existing.optInUrl,
    storeUrl: existing.storeUrl ?? '', packageName: existing.packageName ?? '',
    testStartDate: isoDate(existing.testStartDate), feedbackGuide: existing.feedbackGuide ?? '',
  } : EMPTY)
  const [status, setStatus] = useState<AppStatus>(existing?.status ?? 'recruiting')
  const [group, setGroup] = useState(false)
  const [method, setMethod] = useState<TesterMethod>(existing?.testerMethod ?? 'google_group')
  const [slots, setSlots] = useState<number>(existing?.testerSlots ?? TARGET_TESTERS)
  const groupStep = creating && method === 'google_group'
  // Email list unlocks after testing others (the database enforces it too). An app already on it keeps it.
  const { user } = useAuth()
  const creatorStats = usePublicProfile(existing ? existing.creatorUid : user?.uid)
  const testingCount = creatorStats.data?.testingCount ?? 0
  const emailListLocked = existing?.testerMethod !== 'email_list' && testingCount < EMAIL_LIST_MIN_TESTING
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [buildOpen, setBuildOpen] = useState(false)

  const initial = useRef({ v, status, group, method, slots })
  const leaving = useRef(false)
  const dirty = useMemo(() => {
    const i = initial.current
    return status !== i.status || group !== i.group || method !== i.method || slots !== i.slots || (Object.keys(v) as (keyof AppInput)[]).some((k) => (v[k] ?? '') !== (i.v[k] ?? ''))
  }, [v, status, group, method, slots])

  // ADR-009 §6: warn before leaving with unsaved changes (reload, tab close, and links on this page).
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { if (!leaving.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const guard = (e: MouseEvent) => {
    if (dirty && !leaving.current && !window.confirm('Perubahan belum disimpan. Tinggalkan halaman ini?')) e.preventDefault()
  }

  const errorsNow = useMemo(() => validateApp(v, { creating: creating && method === 'google_group', groupConfirmed: group }), [v, creating, group, method])
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
      name: v.name.trim(), description: v.description.trim(), optInUrl: v.optInUrl.trim(),
      storeUrl: v.storeUrl?.trim() || undefined, packageName: v.packageName?.trim() || undefined,
      testStartDate: v.testStartDate || undefined, feedbackGuide: v.feedbackGuide?.trim() || undefined,
    }
    try {
      if (creating) {
        const { appId } = await api.createApp({ ...clean, groupConfirmed: method === 'google_group' && group, testerMethod: method, testerSlots: slots })
        leaving.current = true
        toast(`${clean.name} terdaftar. Bagikan halamannya ke grup.`)
        navigate(`/apps/${appId}`)
      } else {
        await updateApp(existing.id, { ...clean, status, testerMethod: method, testerSlots: slots })
        leaving.current = true
        toast('Perubahan disimpan.')
        navigate(`/apps/${existing.id}`)
      }
    } catch (err) { setFail(errorText(err)) } finally { setBusy(false) }
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
        text: `${name} dihapus.`,
        duration: UNDO_MS,
        action: {
          label: 'Urungkan',
          onClick: () => {
            restoreApp(id)
              .then(() => { toast(`${name} dipulihkan.`); navigate(`/apps/${id}`) })
              .catch((err) => toast(failToast(err, 'Hubungi admin untuk memulihkannya.')))
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
      <Link to={existing ? `/apps/${existing.id}` : '/apps'} className="crumb" onClick={guard}><IconBack />{existing ? existing.name : 'Aplikasi'}</Link>
      <div className="title-row">
        <div>
          <h1>{creating ? 'Tambah aplikasi' : 'Edit aplikasi'}</h1>
          <p className="sub">{creating ? 'Aplikasi langsung tampil di daftar dengan status Mencari tester.' : `Didaftarkan ${fmtDate(existing.createdAt)}.`}</p>
        </div>
      </div>

      <section className="form-section">
        <div className="label-col"><h2>Aplikasinya</h2><p>Yang dilihat anggota di daftar dan di halaman aplikasi.</p></div>
        <div className="form-panel">
          {field('name', 'Nama aplikasi', <input className="input" maxLength={LIMITS.name} value={v.name} onChange={set('name')} {...aria('name')} />, undefined, LIMITS.name)}
          {field('description', 'Deskripsi singkat', <textarea className="input" rows={3} maxLength={LIMITS.description} value={v.description} onChange={set('description')} {...aria('description', true)} />, 'Untuk siapa aplikasinya dan apa gunanya.', LIMITS.description)}
          {field('packageName', 'Nama paket (opsional)', <input className="input" placeholder="id.namadev.aplikasi" value={v.packageName} onChange={set('packageName')} {...aria('packageName', true)} />, 'Mencegah aplikasi yang sama didaftarkan dua kali.')}
        </div>
      </section>

      <section className="form-section">
        <div className="label-col"><h2>Link Google Play</h2><p>Link opt-in ada di Play Console → Uji tertutup → Penguji → “Gabung di web”.</p></div>
        <div className="form-panel">
          {field('optInUrl', 'Link opt-in uji tertutup', <input className="input" type="url" inputMode="url" placeholder={`${OPT_IN_PREFIX}nama.paket`} value={v.optInUrl} onChange={set('optInUrl')} {...aria('optInUrl', true)} />, `Diawali ${OPT_IN_PREFIX}`)}
          {field('storeUrl', 'Link halaman Play Store (opsional)', <input className="input" type="url" inputMode="url" placeholder="https://play.google.com/store/apps/details?id=…" value={v.storeUrl} onChange={set('storeUrl')} {...aria('storeUrl', true)} />, 'Tester memakai halaman ini untuk menulis feedback.')}
        </div>
      </section>

      <section className="form-section">
        <div className="label-col"><h2>Pengujian</h2><p>Isi tanggal mulai saat jalur uji tertutup Anda aktif, supaya hitungan hari uji tampil.</p></div>
        <div className="form-panel">
          {field('testStartDate', 'Tanggal mulai uji (opsional)', <input className="input" type="date" value={v.testStartDate} onChange={set('testStartDate')} {...aria('testStartDate')} />)}
          {!creating && (
            <div className="field">
              <label htmlFor="f-status">Status</label>
              <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as AppStatus)}>
                {(Object.keys(appStatusLabel) as AppStatus[]).map((s) => <option key={s} value={s}>{appStatusLabel[s]}</option>)}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="form-section">
        <div className="label-col">
          <h2>Panduan feedback</h2>
          <p>Tulis sebagai pertanyaan atau hal yang perlu dicoba, bukan teks ulasan siap salin. Ulasan identik dari banyak akun bisa dianggap tidak asli oleh Google.</p>
        </div>
        <div className="form-panel">
          {field('feedbackGuide', 'Yang ingin Anda uji (opsional)', <textarea className="input" rows={4} maxLength={LIMITS.feedbackGuide} placeholder="Coba level 3 di layar kecil: apakah tombol lompat mudah ditekan?" value={v.feedbackGuide} onChange={set('feedbackGuide')} {...aria('feedbackGuide')} />, undefined, LIMITS.feedbackGuide)}
          <div className="preview-card" role="group" aria-label="Pratinjau untuk tester">
            <span className="small muted">Yang dilihat tester di atas tombol Gabung sebagai tester:</span>
            <span className="t">Yang ingin diuji kreator</span>
            <p className="guide-quote">{v.feedbackGuide?.trim() || <span className="muted">Kreator belum menulis panduan feedback.</span>}</p>
          </div>
        </div>
      </section>

      <section className="form-section">
        <div className="label-col">
          <h2>Tester</h2>
          <p>Berapa tester yang Anda butuhkan dari komunitas, dan cara mereka ditambahkan. Di Play Console, satu jalur uji tertutup memakai Google Groups <i>atau</i> daftar email, tidak bisa keduanya.</p>
        </div>
        <div className="form-panel">
          <div className="field">
            <label htmlFor="f-slots">Butuh berapa tester dari TesBareng?</label>
            <select id="f-slots" className="input num" style={{ maxWidth: '12rem' }} value={slots} onChange={(e) => setSlots(Number(e.target.value))} aria-describedby="f-slots-hint">
              {Array.from({ length: TARGET_TESTERS }, (_, i) => TARGET_TESTERS - i).map((n) => <option key={n} value={n}>{n} tester</option>)}
            </select>
            <span className="hint" id="f-slots-hint">Google butuh {TARGET_TESTERS} tester total selama 14 hari. Kalau sebagian sudah ada dari grup atau daftar Anda yang lain, isi sisanya saja.{existing && ' Mengubahnya tidak memindahkan penugasan cohort yang sudah berjalan.'}</span>
          </div>
          <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} aria-describedby={groupStep ? undefined : 'f-method-hint'}>
            <legend className="sr-only">Cara tester ditambahkan</legend>
            <label className="check">
              <input type="radio" name="tester-method" value="google_group" checked={method === 'google_group'} onChange={() => setMethod('google_group')} />
              <span><span className="t">Google Group komunitas (disarankan)</span>
                <span className="d">Anggota cukup gabung {COMMUNITY_GROUP}, lalu opt-in. Email mereka tetap tersamar.</span></span>
            </label>
            <label className="check">
              <input type="radio" name="tester-method" value="email_list" checked={method === 'email_list'} onChange={() => setMethod('email_list')} disabled={emailListLocked} aria-describedby={emailListLocked ? 'f-email-lock' : undefined} />
              <span><span className="t">Daftar email</span>
                <span className="d">Untuk jalur yang sudah memakai daftar email. Tester meminta ditambahkan dan setuju emailnya terlihat oleh Anda; Anda menempelkannya di Play Console, lalu menandai “Sudah ditambahkan”.</span>
                {emailListLocked && (
                  <span className="d lock" id="f-email-lock">
                    {creatorStats.data === undefined
                      ? 'Memeriksa jumlah aplikasi yang Anda tes…'
                      : <>Terkunci. Terbuka setelah Anda menguji <span className="num">{EMAIL_LIST_MIN_TESTING}</span> aplikasi anggota lain (sekarang <span className="num">{testingCount}</span>). <Link to="/apps">Cari aplikasi untuk dites</Link></>}
                  </span>
                )}</span>
            </label>
            {/* The group checkbox below carries the full Play Console path; say it once. */}
            {!groupStep && <span className="hint" id="f-method-hint">Play Console → Uji tertutup → Penguji.</span>}
          </fieldset>
          {groupStep && (
            <label className="check" style={{ padding: 0 }}>
              <input id="f-groupConfirmed" type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} onBlur={blur('groupConfirmed')} aria-describedby={`f-group-hint${errors.groupConfirmed ? ' f-groupConfirmed-err' : ''}`} aria-invalid={!!errors.groupConfirmed || undefined} />
              <span><span className="t">Saya sudah menambahkan {COMMUNITY_GROUP} sebagai daftar penguji di jalur uji tertutup.</span>
                <span className="d" id="f-group-hint">Play Console → Uji tertutup → Penguji → Google Groups.</span>
                {errors.groupConfirmed && <span className="d err-text" id="f-groupConfirmed-err" role="alert">{errors.groupConfirmed}</span>}</span>
            </label>
          )}
        </div>
      </section>

      {existing && <BuildsSection app={existing} onAdd={() => setBuildOpen(true)} />}

      {fail && <ErrorBox text={fail} />}
      <div className="form-foot">
        <Link className="btn" to={existing ? `/apps/${existing.id}` : '/apps'} onClick={guard}>Batal</Link>
        <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : creating ? 'Daftarkan aplikasi' : 'Simpan perubahan'}</button>
      </div>

      {existing && (
        <section className="form-section danger-zone">
          <div className="label-col"><h2>Hapus aplikasi</h2><p>Aplikasi disembunyikan dari daftar. Anda punya 8 detik untuk menekan Urungkan, dan 10 menit untuk memulihkannya sendiri; setelah itu hanya admin yang bisa. Riwayat tester tetap tersimpan.</p></div>
          <div><button type="button" className="btn danger" disabled={deleting} onClick={remove}>{deleting ? 'Menghapus…' : `Hapus ${existing.name}`}</button></div>
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
  const builds = useBuilds(app.id)
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => [...builds.data].sort((a, b) => b.uploadedAt - a.uploadedAt), [builds.data])
  const shown = all ? sorted : sorted.slice(0, FEW_BUILDS)
  return (
    <section className="form-section">
      <div className="label-col">
        <h2>Log build</h2>
        <p>Catat setiap unggahan ke jalur uji tertutup. Tester melihat pengumuman build baru selama 3 hari.</p>
      </div>
      <div className="form-panel">
        {builds.error ? <ErrorBox text="Log build gagal dimuat. Coba lagi sebentar lagi." onRetry={builds.retry} /> : builds.loading ? <Skel w={200} /> : sorted.length === 0 ? <p className="muted">Belum ada build yang dicatat. Tekan Catat build baru setelah Anda mengunggah versi ke Play Console.</p> : (
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
        <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={onAdd}><IconPlus />Catat build baru</button>
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
