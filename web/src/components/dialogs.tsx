import { useState, type FormEvent } from 'react'
import { api, errorText, updateTesterAsCreator } from '../lib/data'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { isoDate, testerStatusLabel } from '../lib/progress'
import type { AppDoc, TesterDoc, TesterStatus } from '../lib/types'
import { Dialog, ErrorBox, useToast } from './bits'
import { IconExternal } from './icons'

const today = () => isoDate(Date.now())

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null)
    try { await fn(); onDone() } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  return { busy, err, run }
}

export function JoinDialog({ open, onClose, app, rejoin }: { open: boolean; onClose: () => void; app: AppDoc; rejoin?: boolean }) {
  return (
    <Dialog open={open} onClose={onClose} label={`Daftar jadi tester ${app.name}`}>
      <JoinForm app={app} rejoin={rejoin} onClose={onClose} />
    </Dialog>
  )
}

function JoinForm({ onClose, app, rejoin }: { onClose: () => void; app: AppDoc; rejoin?: boolean }) {
  const toast = useToast()
  const [c, setC] = useState({ joinedGroup: false, optedIn: false, installed: false })
  const { busy, err, run } = useSubmit(() => { toast(`Anda tercatat sebagai tester ${app.name}. Hitungan 14 hari dimulai hari ini.`); onClose() })
  const all = c.joinedGroup && c.optedIn && c.installed
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!all) return
    run(() => api.joinAsTester({ appId: app.id, checklist: { joinedGroup: true, optedIn: true, installed: true } }))
  }
  return (
      <form onSubmit={submit}>
        <div className="sheet-body">
          <h2>{rejoin ? 'Daftar lagi' : 'Daftar jadi tester'} {app.name}</h2>
          <p className="lede">Google hanya menghitung tester yang benar-benar opt-in. Selesaikan tiga langkah ini di HP Anda dulu.</p>
          <div>
            <label className="check">
              <input type="checkbox" checked={c.joinedGroup} onChange={(e) => setC({ ...c, joinedGroup: e.target.checked })} />
              <span><span className="t">Saya sudah gabung grup {COMMUNITY_GROUP}</span>
                <span className="d"><a className="link" href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer">Buka Google Group</a> dengan akun Google yang sama.</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={c.optedIn} onChange={(e) => setC({ ...c, optedIn: e.target.checked })} />
              <span><span className="t">Saya sudah buka link opt-in dan ketuk “Jadi penguji”</span>
                <span className="d"><a className="link" href={app.optInUrl} target="_blank" rel="noreferrer">Buka link opt-in</a> di Google Play.</span></span>
            </label>
            <label className="check">
              <input type="checkbox" checked={c.installed} onChange={(e) => setC({ ...c, installed: e.target.checked })} />
              <span><span className="t">Saya sudah memasang aplikasinya</span>
                <span className="d">Biarkan terpasang minimal 14 hari berturut-turut.</span></span>
            </label>
          </div>
          {app.feedbackGuide && (
            <div className="stack-8">
              <p style={{ fontWeight: 600 }}>Nanti, saat kirim feedback di Play</p>
              <p className="guide-quote">{app.feedbackGuide}</p>
              <p className="muted small">Tulis dengan kata-kata Anda sendiri. Ulasan yang sama persis dari banyak akun bisa dianggap tidak asli oleh Google.</p>
            </div>
          )}
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          {!all && <span className="muted small" id="join-why" style={{ marginRight: 'auto', alignSelf: 'center' }}>Centang ketiga langkah untuk lanjut.</span>}
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn primary" disabled={!all || busy} aria-describedby={!all ? 'join-why' : undefined}>{busy ? 'Menyimpan…' : 'Konfirmasi'}</button>
        </div>
      </form>
  )
}

export function FeedbackDialog({ open, onClose, app, entry }: { open: boolean; onClose: () => void; app: AppDoc; entry?: TesterDoc }) {
  return (
    <Dialog open={open} onClose={onClose} label="Tandai feedback terkirim">
      <FeedbackForm app={app} entry={entry} onClose={onClose} />
    </Dialog>
  )
}

function FeedbackForm({ onClose, app, entry }: { onClose: () => void; app: AppDoc; entry?: TesterDoc }) {
  const toast = useToast()
  const [summary, setSummary] = useState(entry?.feedbackSummary ?? '')
  const { busy, err, run } = useSubmit(onClose)
  const already = !!entry?.feedbackSent
  const save = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      await api.markFeedbackSent({ appId: app.id, sent: true, summary: summary.trim() || undefined })
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
          <h2>{already ? 'Catatan feedback Anda' : 'Tandai feedback terkirim'}</h2>
          {!already && (
            <p className="lede">Feedback ditulis di Google Play, bukan di sini: buka halaman aplikasi di Play Store, beri rating dan tulis apa yang berjalan, apa yang rusak, dan apa yang perlu diperbaiki.</p>
          )}
          {!already && (
            <a className="btn" style={{ justifySelf: 'start' }} href={app.storeUrl ?? app.optInUrl} target="_blank" rel="noreferrer"><IconExternal />Buka {app.name} di Play</a>
          )}
          <div className="field">
            <label htmlFor="fb-sum">Ringkasan yang Anda tulis <span className="muted" style={{ fontWeight: 400 }}>(opsional)</span></label>
            <textarea id="fb-sum" className="input" maxLength={500} value={summary} onChange={(e) => setSummary(e.target.value)} aria-describedby="fb-sum-hint" />
            <span className="hint" id="fb-sum-hint">Terlihat oleh semua anggota. Maksimal 500 karakter.</span>
            <span className="count">{summary.length}/500</span>
          </div>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          {already && <button type="button" className="btn danger" style={{ marginRight: 'auto' }} disabled={busy} onClick={unmark}>Batalkan tanda terkirim</button>}
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : already ? 'Simpan catatan' : 'Feedback sudah saya kirim'}</button>
        </div>
      </form>
  )
}

export function BuildDialog({ open, onClose, app }: { open: boolean; onClose: () => void; app: AppDoc }) {
  const toast = useToast()
  const [f, setF] = useState({ versionName: '', uploadedAt: today(), changelog: '' })
  const { busy, err, run } = useSubmit(() => { toast(`Build ${f.versionName} dicatat. Tester akan melihat pengumuman build baru selama 3 hari.`); setF({ versionName: '', uploadedAt: today(), changelog: '' }); onClose() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() => api.addBuild({ appId: app.id, versionName: f.versionName.trim(), uploadedAt: f.uploadedAt, changelog: f.changelog.trim() }))
  }
  return (
    <Dialog open={open} onClose={onClose} label="Catat build baru">
      <form onSubmit={submit}>
        <div className="sheet-body">
          <h2>Catat build baru</h2>
          <p className="lede">Satu catatan untuk setiap unggahan ke jalur uji tertutup. Tester diminta memperbarui dan menguji lagi.</p>
          <div className="field">
            <label htmlFor="b-v">Nama versi</label>
            <input id="b-v" className="input" required maxLength={40} placeholder="contoh: 1.2.0 (14)" value={f.versionName} onChange={(e) => setF({ ...f, versionName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-d">Tanggal unggah</label>
            <input id="b-d" type="date" className="input" required max={today()} value={f.uploadedAt} onChange={(e) => setF({ ...f, uploadedAt: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="b-c">Perubahan, satu kalimat</label>
            <input id="b-c" className="input" required maxLength={140} value={f.changelog} onChange={(e) => setF({ ...f, changelog: e.target.value })} />
            <span className="count">{f.changelog.length}/140</span>
          </div>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Catat build'}</button>
        </div>
      </form>
    </Dialog>
  )
}

export function ManualTesterDialog({ open, onClose, app }: { open: boolean; onClose: () => void; app: AppDoc }) {
  const toast = useToast()
  const [f, setF] = useState({ displayName: '', email: '', optedInAt: today() })
  const { busy, err, run } = useSubmit(() => { toast(`${f.displayName} ditambahkan ke daftar tester.`); setF({ displayName: '', email: '', optedInAt: today() }); onClose() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() => api.addManualTester({ appId: app.id, displayName: f.displayName.trim(), email: f.email.trim(), optedInAt: f.optedInAt }))
  }
  return (
    <Dialog open={open} onClose={onClose} label="Tambah tester manual">
      <form onSubmit={submit}>
        <div className="sheet-body">
          <h2>Tambah tester manual</h2>
          <p className="lede">Untuk tester yang opt-in tanpa lewat TesBareng. Pastikan namanya ada di Play Console.</p>
          <div className="field">
            <label htmlFor="m-n">Nama</label>
            <input id="m-n" className="input" required maxLength={60} value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="m-e">Email Google</label>
            <input id="m-e" type="email" className="input" required placeholder="email@gmail.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-describedby="m-e-hint" />
            <span className="hint" id="m-e-hint">Disamarkan di server sebelum disimpan, misalnya bu*****@gmail.com. Email lengkap tidak disimpan.</span>
          </div>
          <div className="field">
            <label htmlFor="m-d">Opt-in sejak</label>
            <input id="m-d" type="date" className="input" required max={today()} value={f.optedInAt} onChange={(e) => setF({ ...f, optedInAt: e.target.value })} />
          </div>
          {err && <ErrorBox text={err} />}
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Tambahkan'}</button>
        </div>
      </form>
    </Dialog>
  )
}

export function TesterDialog({ open, onClose, app, tester }: { open: boolean; onClose: () => void; app: AppDoc; tester?: TesterDoc }) {
  return (
    <Dialog open={open} onClose={onClose} label="Kelola tester">
      {tester && <TesterForm key={tester.id} app={app} tester={tester} onClose={onClose} />}
    </Dialog>
  )
}

function TesterForm({ app, tester, onClose }: { app: AppDoc; tester: TesterDoc; onClose: () => void }) {
  const toast = useToast()
  const [f, setF] = useState({
    status: tester.status, optedInAt: isoDate(tester.optedInAt), note: tester.note ?? '',
    feedbackVerified: tester.feedbackVerified, replied: tester.replied,
  })
  const { busy, err, run } = useSubmit(() => { toast(`Data ${tester.displayName} disimpan.`); onClose() })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(() => updateTesterAsCreator(app.id, tester, {
      status: f.status,
      optedInAt: f.optedInAt !== isoDate(tester.optedInAt) ? f.optedInAt : undefined,
      note: f.note !== (tester.note ?? '') ? f.note : undefined,
      feedbackVerified: f.feedbackVerified !== tester.feedbackVerified ? f.feedbackVerified : undefined,
      replied: f.replied !== tester.replied ? f.replied : undefined,
    }))
  }
  return (
    <form onSubmit={submit}>
      <div className="sheet-body">
        <div>
          <h2>{tester.displayName}</h2>
          <p className="muted">{tester.maskedEmail}{tester.feedbackSent ? ' · menandai feedback terkirim' : ' · belum menandai feedback'}</p>
        </div>
        {tester.feedbackSummary && <p className="guide-quote">{tester.feedbackSummary}</p>}
        <div className="field">
          <span className="label">Feedback di Play Console</span>
          <label className="check" style={{ padding: '4px 0' }}>
            <input type="checkbox" checked={f.feedbackVerified} onChange={(e) => setF({ ...f, feedbackVerified: e.target.checked })} />
            <span><span className="t">Terverifikasi</span><span className="d">Saya melihat feedback-nya di Testing feedback.</span></span>
          </label>
          <label className="check" style={{ padding: '4px 0' }}>
            <input type="checkbox" checked={f.replied} onChange={(e) => setF({ ...f, replied: e.target.checked })} />
            <span><span className="t">Sudah saya balas</span><span className="d">Balasan dikirim dari Play Console.</span></span>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div className="field">
            <label htmlFor="t-s">Status</label>
            <select id="t-s" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as TesterStatus })}>
              {(['active', 'left', 'removed'] as TesterStatus[]).map((s) => <option key={s} value={s}>{testerStatusLabel[s]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-d">Opt-in sejak</label>
            <input id="t-d" type="date" className="input" required max={today()} value={f.optedInAt} onChange={(e) => setF({ ...f, optedInAt: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-n">Catatan, terlihat semua anggota</label>
          <input id="t-n" className="input" maxLength={140} placeholder="contoh: sudah dicek di Play Console" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>Batal</button>
        <button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  )
}
