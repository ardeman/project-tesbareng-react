import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { api, cancelEmailListing, errorText, requestEmailListing, updateTesterAsCreator, useMyEmailListing } from '../lib/data'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import {
  clearJoinProgress, emailPlayStepsDone, groupPlayStepsDone, hasStoreUrl, isLikelyMobile, openPlayInstall,
  playInstallUrl, readEmailJoinProgress, readGroupJoinProgress, writeEmailJoinProgress, writeGroupJoinProgress,
} from '../lib/joinProgress'
import { fmtDate, isoDate, todayIso } from '../lib/progress'
import type { AppDoc, TesterDoc } from '../lib/types'
import { BUILD_LIMITS, MANUAL_LIMITS, validateBuild, validateManual, type BuildInput, type ManualInput } from '../lib/validate'
import { useValidation } from '../lib/useValidation'
import { Dialog, ErrorBox, Field, fieldAria, useToast } from './bits'
import { IconExternal } from './icons'

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return // already saving: ignore the double tap
    setBusy(true); setErr(null)
    try { await fn(); onDone() } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  return { busy, err, run }
}

export function JoinDialog({ open, onClose, app, rejoin }: { open: boolean; onClose: () => void; app: AppDoc; rejoin?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} label={`Gabung sebagai tester ${app.name}`}>
      {app.testerMethod === 'email_list'
        ? <EmailJoinForm app={app} rejoin={rejoin} onClose={onClose} />
        : <JoinForm app={app} rejoin={rejoin} onClose={onClose} />}
    </Dialog>
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
  const toast = useToast()
  const [step, setStep] = useState<GroupStep>(() => initialGroupStep(app.id))
  const [done, setDone] = useState(() => readGroupJoinProgress(app.id))
  const { busy, err, run } = useSubmit(() => {
    clearJoinProgress(app.id)
    toast(`Anda tercatat sebagai tester ${app.name}. Hari aktif Anda dihitung mulai hari ini.`)
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
        <h2>Gabung sebagai tester {app.name}</h2>
        {rejoin && <p className="muted">Hari aktif Anda dihitung lagi dari nol mulai hari ini.</p>}
        <p className="lede">Paling mudah di HP. Gabung grup dulu, lalu buka Play Store dan pasang. Login TesBareng hanya di langkah terakhir.</p>
        <WizardProgress
          labels={['Gabung grup', 'Pasang di Play', 'Catat']}
          current={idx}
          doneFlags={[!!done.group, !!done.installed, false]}
        />
        {step === 'group' && (
          <WizardStep
            title="1. Gabung Google Group komunitas"
            body={<>Ketuk tombol di bawah — Google akan minta <b>pilih akun dulu</b>. Pilih akun yang sama dengan Play Store, lalu di halaman grup ketuk <b>Bergabung</b> / Join. Jangan ganti akun setelah grup terbuka (tombol Join bisa hilang).</>}
            actionHref={COMMUNITY_GROUP_URL}
            actionLabel="Pilih akun & buka grup"
            actionHint={COMMUNITY_GROUP}
            onDone={afterGroup}
            doneLabel="Sudah gabung grup"
          />
        )}
        {step === 'play' && (
          <WizardStep
            title="2. Buka Play Store dan pasang"
            body={storeOk
              ? <>Ketuk tombol di bawah. Di HP, ketuk <b>Install</b> / Pasang, lalu buka app sekali. Kalau tombol Install belum muncul, tunggu sebentar atau buka ulang halaman Play.</>
              : <>App ini belum punya link Play Store. Sementara pakai link opt-in: ketuk <b>Jadi penguji</b>, lalu Install.</>}
            actionHref={playUrl}
            actionLabel={storeOk ? 'Buka di Play Store' : 'Buka link opt-in'}
            onBack={() => setStep('group')}
            onDone={() => mark({ installed: true }, 'confirm')}
            doneLabel="Sudah memasang"
          />
        )}
        {step === 'confirm' && (
          <div className="stack-12">
            <p className="strong">3. Catat di TesBareng</p>
            <p className="muted">Supaya hari aktif Anda terhitung bersama komunitas. Biarkan app terpasang selama uji 14 hari Google berjalan.</p>
            <button type="button" className="text-action" onClick={() => setStep('play')}>Kembali ke langkah pasang</button>
          </div>
        )}
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>Batal</button>
        {step === 'confirm' && (
          <button className="btn primary" disabled={busy || !groupPlayStepsDone(done)}>
            {busy ? 'Menyimpan…' : 'Catat saya sebagai tester'}
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
    toast(`Anda tercatat sebagai tester ${app.name}. Hari aktif Anda dihitung mulai hari ini.`)
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
    if (phase === 'ask' && consent) asked.run(async () => { await requestEmailListing(app.id); toast('Permintaan terkirim. Creator akan menambahkan email Anda.') })
    if (phase === 'confirm' && emailPlayStepsDone(play)) {
      joined.run(() => api.joinAsTester({ appId: app.id, checklist: { optedIn: true, installed: true } }))
    }
  }
  const withdraw = () => asked.run(async () => { await cancelEmailListing(app.id); toast('Permintaan dibatalkan. Creator tidak lagi melihat email Anda.') })
  const err = asked.err ?? joined.err ?? listing.error
  const busy = asked.busy || joined.busy

  const overviewIdx = phase === 'ask' ? 0 : phase === 'wait' ? 1 : phase === 'optin' ? 2 : phase === 'install' ? 3 : 4

  return (
    <form onSubmit={submit}>
      <div className="sheet-body">
        <h2>Gabung sebagai tester {app.name}</h2>
        {rejoin && <p className="muted">Hari aktif Anda dihitung lagi dari nol mulai hari ini.</p>}
        <p className="lede">App ini memakai daftar email di Play Console (bukan Google Group). Creator harus menambahkan email Anda dulu, baru Anda bisa opt-in.</p>
        <WizardProgress
          labels={['Minta', 'Tunggu', 'Opt-in', 'Pasang', 'Catat']}
          current={overviewIdx}
          doneFlags={[!!l, !!(l && l.listedAt), !!play.optedIn, !!play.installed, false]}
        />
        {listing.loading ? <p className="muted">Memuat…</p> : phase === 'ask' ? (
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span><span className="t">Saya setuju creator {app.name} melihat email lengkap akun Google saya</span>
              {email && <span className="d addr">{email}</span>}
              <span className="d">Hanya creator app ini yang melihatnya, untuk ditempel di Play Console. Pastikan sama dengan akun Play Store di HP. Bisa dibatalkan kapan saja.</span></span>
          </label>
        ) : phase === 'wait' ? (
          <div className="notice info" role="status" style={{ marginBottom: 0 }}>
            <span>Menunggu creator menambahkan email Anda · diminta <span className="num">{fmtDate(l!.requestedAt)}</span>. Biasanya lewat grup WhatsApp atau TesBareng. Anda bisa menutup halaman ini dan kembali nanti.</span>
          </div>
        ) : phase === 'optin' ? (
          <WizardStep
            title="Jadi penguji di Google Play"
            body={<>Buka link opt-in dengan akun yang emailnya Anda bagikan, lalu ketuk <b>Jadi penguji</b>.</>}
            actionHref={app.optInUrl}
            actionLabel="Buka link opt-in"
            onDone={() => {
              markPlay({ optedIn: true }, 'install')
              if (isLikelyMobile() && storeOk) openPlayInstall(app)
            }}
            doneLabel="Sudah jadi penguji"
          />
        ) : phase === 'install' ? (
          <WizardStep
            title="Pasang aplikasinya"
            body={storeOk
              ? <>Ketuk <b>Buka di Play Store</b>, lalu Install / Pasang dan buka sekali.</>
              : <>Setelah jadi penguji, tombol Install muncul. Pakai link opt-in jika halaman Play belum tersedia.</>}
            actionHref={playUrl}
            actionLabel={storeOk ? 'Buka di Play Store' : 'Buka lagi link opt-in'}
            onBack={() => setPlayStep('optin')}
            onDone={() => markPlay({ installed: true }, 'confirm')}
            doneLabel="Sudah memasang"
          />
        ) : (
          <div className="stack-12">
            <p className="strong">Catat di TesBareng</p>
            <p className="muted">Supaya hari aktif Anda terhitung. Biarkan app terpasang selama uji berlangsung.</p>
            <button type="button" className="text-action" onClick={() => setPlayStep('install')}>Kembali ke langkah pasang</button>
          </div>
        )}
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        {phase !== 'ask' && !listing.loading && (
          <button type="button" className="text-action quiet" style={{ marginRight: 'auto' }} disabled={busy} onClick={withdraw}>Batalkan permintaan</button>
        )}
        {phase === 'ask' && !consent && <span className="why" id="join-why">Centang persetujuan untuk lanjut.</span>}
        <button type="button" className="btn" onClick={onClose}>{phase === 'wait' ? 'Tutup' : 'Batal'}</button>
        {phase === 'ask' && (
          <button className="btn primary" disabled={!consent || busy || listing.loading} aria-describedby={!consent ? 'join-why' : undefined}>{busy ? 'Mengirim…' : 'Minta ditambahkan'}</button>
        )}
        {phase === 'confirm' && (
          <button className="btn primary" disabled={busy || !emailPlayStepsDone(play)}>{busy ? 'Menyimpan…' : 'Catat saya sebagai tester'}</button>
        )}
      </div>
    </form>
  )
}

function WizardProgress({ labels, current, doneFlags }: { labels: string[]; current: number; doneFlags: boolean[] }) {
  return (
    <ol className="steps wizard-steps" aria-label="Langkah">
      {labels.map((label, i) => {
        const done = doneFlags[i] || i < current
        const here = i === current
        return (
          <li key={label} aria-current={here ? 'step' : undefined}>
            <span className="num" aria-hidden="true">{done && !here ? '✓' : String(i + 1)}</span>
            <span>{label}{done && !here && <span className="muted small"> · selesai</span>}</span>
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
        {onBack && <button type="button" className="btn" onClick={onBack}>Kembali</button>}
        <button type="button" className="btn" onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
  )
}

export function FeedbackDialog({ open, onClose, app, entry }: { open: boolean; onClose: () => void; app: AppDoc; entry?: TesterDoc }) {
  return (
    <Dialog open={open} onClose={onClose} label="Tandai sudah kirim feedback">
      <FeedbackForm app={app} entry={entry} onClose={onClose} />
    </Dialog>
  )
}

function parseDeviceSummary(raw = '') {
  const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/s);
  return match ? { device: match[1], summary: match[2] } : { device: '', summary: raw };
}

function FeedbackForm({ onClose, app, entry }: { onClose: () => void; app: AppDoc; entry?: TesterDoc }) {
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
      toast(already ? 'Catatan feedback diperbarui.' : 'Feedback ditandai terkirim. Kreator akan memverifikasinya di Play Console.')
    })
  }
  const unmark = () => run(async () => {
    await api.markFeedbackSent({ appId: app.id, sent: false })
    toast('Tanda feedback dibatalkan.')
  })
  return (
      <form onSubmit={save}>
        <div className="sheet-body">
          <h2>{already ? 'Catatan feedback Anda' : 'Tandai sudah kirim feedback'}</h2>
          {!already && (
            <p className="lede">Feedback ditulis di Google Play, bukan di sini: buka halaman aplikasi di Play Store, beri rating dan tulis apa yang berjalan, apa yang rusak, dan apa yang perlu diperbaiki.</p>
          )}
          {!already && (
            <a className="btn" style={{ justifySelf: 'start' }} href={playInstallUrl(app)} target="_blank" rel="noreferrer"><IconExternal />Buka {app.name} di Play</a>
          )}
          <div className="field">
            <label htmlFor="fb-device">Tipe HP / Versi Android <span className="opt">(opsional)</span></label>
            <input id="fb-device" className="input" maxLength={60} placeholder="Contoh: Samsung A54 / Android 14" value={device} onChange={(e) => setDevice(e.target.value)} aria-describedby="fb-dev-hint" />
            <span className="hint" id="fb-dev-hint">Membantu kreator saat menjawab kuesioner audit Google Play.</span>
          </div>
          <div className="field">
            <label htmlFor="fb-sum">Ringkasan yang Anda tulis <span className="opt">(opsional)</span></label>
            <textarea id="fb-sum" className="input" maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} aria-describedby="fb-sum-hint" />
            <span className="hint" id="fb-sum-hint">Terlihat oleh semua anggota. Maksimal 500 karakter.</span>
            <span className="count">{summary.length}/500</span>
          </div>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          {already && <button type="button" className="text-action quiet" style={{ marginRight: 'auto' }} disabled={busy} onClick={unmark}>Batalkan tanda terkirim</button>}
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : already ? 'Simpan catatan' : 'Tandai sudah kirim'}</button>
        </div>
      </form>
  )
}

const BUILD_ORDER = ['versionName', 'uploadedAt', 'changelog'] as const
const blankBuild = (): BuildInput => ({ versionName: '', uploadedAt: todayIso(), changelog: '' })

export function BuildDialog({ open, onClose, app }: { open: boolean; onClose: () => void; app: AppDoc }) {
  const toast = useToast()
  const [f, setF] = useState<BuildInput>(blankBuild)
  const v = useValidation(validateBuild(f, todayIso()), BUILD_ORDER)
  const close = () => { v.reset(); onClose() }
  const { busy, err, run } = useSubmit(() => {
    toast(`Build ${f.versionName.trim()} dicatat. Tester melihat pengumuman build baru selama 3 hari.`)
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
    <Dialog open={open} onClose={close} label="Catat build baru">
      <form onSubmit={submit} noValidate>
        <div className="sheet-body">
          <h2>Catat build baru</h2>
          <p className="lede">Satu catatan untuk setiap unggahan ke jalur uji tertutup. Tester diminta memperbarui dan menguji lagi.</p>
          <Field id="b-versionName" label="Nama versi" hint="Seperti di Play Console, misalnya 1.2.0 (14)." error={v.errors.versionName}>
            <input className="input" maxLength={BUILD_LIMITS.versionName} autoComplete="off" spellCheck={false} value={f.versionName}
              onChange={(e) => setF({ ...f, versionName: e.target.value })} onBlur={v.blur('versionName')}
              {...fieldAria('b-versionName', { hint: true, error: v.errors.versionName })} />
          </Field>
          <Field id="b-uploadedAt" label="Tanggal unggah" hint="Hari ini tercatat dengan jam sekarang (WIB)." error={v.errors.uploadedAt}>
            <input type="date" className="input" max={todayIso()} value={f.uploadedAt}
              onChange={(e) => setF({ ...f, uploadedAt: e.target.value })} onBlur={v.blur('uploadedAt')}
              {...fieldAria('b-uploadedAt', { hint: true, error: v.errors.uploadedAt })} />
          </Field>
          <Field id="b-changelog" label="Perubahan, satu kalimat" hint="Yang perlu dicoba ulang oleh tester." error={v.errors.changelog}
            count={`${f.changelog.length}/${BUILD_LIMITS.changelog}`}>
            <input className="input" maxLength={BUILD_LIMITS.changelog} autoComplete="off" value={f.changelog}
              onChange={(e) => setF({ ...f, changelog: e.target.value })} onBlur={v.blur('changelog')}
              {...fieldAria('b-changelog', { hint: true, error: v.errors.changelog })} />
          </Field>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={close}>Batal</button>
          <button className="btn primary" aria-busy={busy || undefined}>{busy ? 'Menyimpan…' : 'Catat build'}</button>
        </div>
      </form>
    </Dialog>
  )
}

const MANUAL_ORDER = ['displayName', 'email', 'optedInAt'] as const
const blankManual = (): ManualInput => ({ displayName: '', email: '', optedInAt: todayIso() })

export function ManualTesterDialog({ open, onClose, app }: { open: boolean; onClose: () => void; app: AppDoc }) {
  const toast = useToast()
  const [f, setF] = useState<ManualInput>(blankManual)
  const v = useValidation(validateManual(f, todayIso()), MANUAL_ORDER)
  const close = () => { v.reset(); onClose() }
  const { busy, err, run } = useSubmit(() => { toast(`${f.displayName.trim()} ditambahkan ke daftar tester.`); setF(blankManual()); close() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const bad = v.check()
    if (bad.length) { document.getElementById(`m-${bad[0]}`)?.focus(); return }
    run(() => api.addManualTester({ appId: app.id, displayName: f.displayName.trim(), email: f.email.trim(), optedInAt: f.optedInAt }))
  }
  return (
    <Dialog open={open} onClose={close} label="Tambah tester manual">
      <form onSubmit={submit} noValidate>
        <div className="sheet-body">
          <h2>Tambah tester manual</h2>
          <p className="lede">Untuk tester yang opt-in tanpa lewat TesBareng. Pastikan namanya ada di Play Console.</p>
          <Field id="m-displayName" label="Nama" hint="Nama yang dikenali anggota lain." error={v.errors.displayName}>
            <input className="input" maxLength={MANUAL_LIMITS.displayName} autoComplete="off" value={f.displayName}
              onChange={(e) => setF({ ...f, displayName: e.target.value })} onBlur={v.blur('displayName')}
              {...fieldAria('m-displayName', { hint: true, error: v.errors.displayName })} />
          </Field>
          <Field id="m-email" label="Email Google" error={v.errors.email}
            hint="Disamarkan di server sebelum disimpan, misalnya bu*****@gmail.com. Email lengkap tidak disimpan.">
            <input type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} className="input" value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })} onBlur={v.blur('email')}
              {...fieldAria('m-email', { hint: true, error: v.errors.email })} />
          </Field>
          <Field id="m-optedInAt" label="Opt-in sejak" hint="Hari aktif tester ini dihitung dari tanggal ini." error={v.errors.optedInAt}>
            <input type="date" className="input" max={todayIso()} value={f.optedInAt}
              onChange={(e) => setF({ ...f, optedInAt: e.target.value })} onBlur={v.blur('optedInAt')}
              {...fieldAria('m-optedInAt', { hint: true, error: v.errors.optedInAt })} />
          </Field>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={close}>Batal</button>
          <button className="btn primary" aria-busy={busy || undefined}>{busy ? 'Menyimpan…' : 'Tambahkan tester'}</button>
        </div>
      </form>
    </Dialog>
  )
}

/** Note and opt-in date only. Verified, Replied and status are edited inline in the tester table (ADR-009 §3). */
export function TesterDialog({ open, onClose, app, tester }: { open: boolean; onClose: () => void; app: AppDoc; tester?: TesterDoc }) {
  return (
    <Dialog open={open} onClose={onClose} label={tester ? `Ubah catatan ${tester.displayName}` : 'Ubah catatan tester'}>
      {tester && <TesterForm key={tester.id} app={app} tester={tester} onClose={onClose} />}
    </Dialog>
  )
}

function TesterForm({ app, tester, onClose }: { app: AppDoc; tester: TesterDoc; onClose: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({ optedInAt: isoDate(tester.optedInAt), note: tester.note ?? '' })
  const dateErr = !f.optedInAt ? 'Pilih tanggal tester opt-in.' : f.optedInAt > todayIso() ? 'Tanggal opt-in tidak boleh di masa depan.' : undefined
  const [showErr, setShowErr] = useState(false)
  const { busy, err, run } = useSubmit(() => { toast(`Data ${tester.displayName} disimpan.`); onClose() })
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
        <Field id="t-d" label="Opt-in sejak" hint="Mengubah tanggal ini mengubah hitungan hari aktif." error={showErr ? dateErr : undefined}>
          <input type="date" className="input" max={todayIso()} value={f.optedInAt}
            onChange={(e) => setF({ ...f, optedInAt: e.target.value })} onBlur={() => setShowErr(true)}
            {...fieldAria('t-d', { hint: true, error: showErr ? dateErr : undefined })} />
        </Field>
        <Field id="t-n" label="Catatan" optional hint="Terlihat oleh semua anggota, misalnya “sudah dicek di Play Console”." count={`${f.note.length}/140`}>
          <input className="input" maxLength={140} autoComplete="off" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })}
            {...fieldAria('t-n', { hint: true })} />
        </Field>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" aria-busy={busy || undefined}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  )
}
