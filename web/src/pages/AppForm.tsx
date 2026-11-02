import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Dialog, ErrorBox, NotFound, Skel, useToast } from '../components/bits'
import { BuildDialog } from '../components/dialogs'
import { IconBack, IconPlus } from '../components/icons'
import { useAuth } from '../lib/auth'
import { api, errorText, softDeleteApp, updateApp, useApp, useBuilds, type AppInput } from '../lib/data'
import { COMMUNITY_GROUP } from '../lib/community'
import { usePageMeta } from '../lib/pageMeta'
import { appStatusLabel, fmtDate, isoDate } from '../lib/progress'
import type { AppDoc, AppStatus } from '../lib/types'
import { LIMITS, OPT_IN_PREFIX, validateApp, type Errors } from '../lib/validate'

const EMPTY: AppInput = { name: '', description: '', optInUrl: '', storeUrl: '', packageName: '', testStartDate: '', feedbackGuide: '' }

export function AppForm() {
  const { id } = useParams()
  const { user, ready, isAdmin, signIn } = useAuth()
  const toast = useToast()
  const app = useApp(id)
  usePageMeta(id ? (app.data && !app.data.deleted ? `Ubah ${app.data.name}` : 'Ubah aplikasi') : 'Tambah aplikasi')

  if (!ready || (id && app.loading)) return <Skel w={240} h={32} />
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
    if (app.error) return <ErrorBox text="Aplikasi gagal dimuat." onRetry={app.retry} />
    if (!app.data || app.data.deleted) return <NotFound what="Aplikasi" />
    if (app.data.creatorUid !== user.uid && !isAdmin) {
      return <ErrorBox text="Hanya pembuat aplikasi ini yang bisa mengubahnya." />
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
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState<string | null>(null)
  const [buildOpen, setBuildOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { if (touched) setErrors(validateApp(v, { creating, groupConfirmed: group })) }, [v, group, touched, creating])

  const set = (k: keyof AppInput) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const errs = validateApp(v, { creating, groupConfirmed: group })
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus()
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
        const { appId } = await api.createApp({ ...clean, groupConfirmed: true })
        toast(`${clean.name} terdaftar. Bagikan halamannya ke grup.`)
        navigate(`/apps/${appId}`)
      } else {
        await updateApp(existing.id, { ...clean, status })
        toast('Perubahan disimpan.')
        navigate(`/apps/${existing.id}`)
      }
    } catch (err) { setFail(errorText(err)) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!existing) return
    setConfirmDelete(false)
    try { await softDeleteApp(existing.id); toast(`${existing.name} dihapus.`); navigate('/apps') } catch (err) { toast(errorText(err)) }
  }

  const field = (k: keyof AppInput, label: string, input: ReactNode, hint?: string, limit?: number) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      {input}
      {errors[k] ? <span className="hint err" id={`f-${k}-hint`}>{errors[k]}</span> : hint && <span className="hint" id={`f-${k}-hint`}>{hint}</span>}
      {limit && <span className="count">{(v[k] ?? '').length}/{limit}</span>}
    </div>
  )
  const aria = (k: keyof AppInput) => ({ id: `f-${k}`, 'aria-invalid': !!errors[k] || undefined, 'aria-describedby': `f-${k}-hint` })

  return (
    <>
    <form className="form-wrap" onSubmit={submit} noValidate>
      <Link to={existing ? `/apps/${existing.id}` : '/apps'} className="crumb"><IconBack />{existing ? existing.name : 'Aplikasi'}</Link>
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
          {field('description', 'Deskripsi singkat', <textarea className="input" rows={3} maxLength={LIMITS.description} value={v.description} onChange={set('description')} {...aria('description')} />, 'Untuk siapa aplikasinya dan apa gunanya.', LIMITS.description)}
          {field('packageName', 'Nama paket (opsional)', <input className="input" placeholder="id.namadev.aplikasi" value={v.packageName} onChange={set('packageName')} {...aria('packageName')} />, 'Mencegah aplikasi yang sama didaftarkan dua kali.')}
        </div>
      </section>

      <section className="form-section">
        <div className="label-col"><h2>Link Google Play</h2><p>Link opt-in ada di Play Console → Uji tertutup → Penguji → “Gabung di web”.</p></div>
        <div className="form-panel">
          {field('optInUrl', 'Link opt-in uji tertutup', <input className="input" type="url" inputMode="url" placeholder={`${OPT_IN_PREFIX}nama.paket`} value={v.optInUrl} onChange={set('optInUrl')} {...aria('optInUrl')} />, `Diawali ${OPT_IN_PREFIX}`)}
          {field('storeUrl', 'Link halaman Play Store (opsional)', <input className="input" type="url" inputMode="url" placeholder="https://play.google.com/store/apps/details?id=…" value={v.storeUrl} onChange={set('storeUrl')} {...aria('storeUrl')} />, 'Tester memakai halaman ini untuk menulis feedback.')}
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
            <span className="small muted">Yang dilihat tester di atas tombol Daftar jadi tester:</span>
            <span className="t">Yang ingin diuji kreator</span>
            <p className="guide-quote">{v.feedbackGuide?.trim() || <span className="muted">Kreator belum menulis panduan feedback.</span>}</p>
          </div>
        </div>
      </section>

      {creating && (
        <section className="form-section">
          <div className="label-col"><h2>Grup tester</h2><p>Semua anggota opt-in lewat satu Google Group. Tanpa grup ini di daftar penguji Anda, opt-in mereka tidak terhitung.</p></div>
          <div className="form-panel">
            <label className="check" style={{ padding: 0 }}>
              <input id="f-groupConfirmed" type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} aria-describedby="f-group-hint" aria-invalid={!!errors.groupConfirmed || undefined} />
              <span><span className="t">Saya sudah menambahkan {COMMUNITY_GROUP} sebagai daftar penguji di jalur uji tertutup.</span>
                <span className={`d ${errors.groupConfirmed ? 'err-text' : ''}`} id="f-group-hint">{errors.groupConfirmed ?? 'Play Console → Uji tertutup → Penguji → Google Groups.'}</span></span>
            </label>
          </div>
        </section>
      )}

      {existing && <BuildsSection app={existing} onAdd={() => setBuildOpen(true)} />}

      {fail && <ErrorBox text={fail} />}
      <div className="form-foot">
        <Link className="btn" to={existing ? `/apps/${existing.id}` : '/apps'}>Batal</Link>
        <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : creating ? 'Daftarkan aplikasi' : 'Simpan perubahan'}</button>
      </div>

      {existing && (
        <section className="form-section danger-zone">
          <div className="label-col"><h2>Hapus aplikasi</h2><p>Aplikasi disembunyikan dari daftar. Riwayat tester tetap tersimpan untuk admin.</p></div>
          <div><button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>Hapus {existing.name}</button></div>
        </section>
      )}
    </form>
    {/* Dialogs live outside the app form: a nested <form> would submit the app form too. */}
    {existing && <BuildDialog open={buildOpen} onClose={() => setBuildOpen(false)} app={existing} />}
    {existing && (
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} label={`Hapus ${existing.name}?`}>
        <div className="sheet-body">
          <h2>Hapus {existing.name}?</h2>
          <p className="lede">Aplikasi hilang dari daftar dan tester tidak bisa mendaftar lagi. Data tetap disimpan, tapi hanya admin yang bisa memulihkannya.</p>
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Batal</button>
          <button type="button" className="btn danger" onClick={remove}>Hapus {existing.name}</button>
        </div>
      </Dialog>
    )}
    </>
  )
}

function BuildsSection({ app, onAdd }: { app: AppDoc; onAdd: () => void }) {
  const builds = useBuilds(app.id)
  return (
    <section className="form-section">
      <div className="label-col">
        <h2>Log build</h2>
        <p>Catat setiap unggahan ke jalur uji tertutup. Tester melihat pengumuman build baru selama 3 hari.</p>
      </div>
      <div className="form-panel">
        {builds.loading ? <Skel w={200} /> : builds.data.length === 0 ? <p className="muted">Belum ada build yang dicatat.</p> : (
          <ol>
            {builds.data.slice(0, 4).map((b) => (
              <li className="row-line" key={b.id}>
                <span className="grow cell-2"><b>{b.versionName}</b><span>{b.changelog}</span></span>
                <span className="num muted">{fmtDate(b.uploadedAt)}</span>
              </li>
            ))}
          </ol>
        )}
        <button type="button" className="btn" style={{ justifySelf: 'start' }} onClick={onAdd}><IconPlus />Catat build baru</button>
      </div>
    </section>
  )
}
