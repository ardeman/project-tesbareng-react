import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Bar, ErrorBox, NotFound, Skel, StatusPill, useToast } from '../components/bits'
import { IconBack, IconCheck, IconExternal, IconPlus, IconSort } from '../components/icons'
import { Board } from '../components/Board'
import { BuildDialog, FeedbackDialog, JoinDialog, ManualTesterDialog, TesterDialog } from '../components/dialogs'
import { useAuth } from '../lib/auth'
import { api, errorText, useApp, useBuilds, useTesters } from '../lib/data'
import {
  computeProgress, daysActive, fmtDate, fmtShort, isNewBuild, relDays, TARGET_BUILDS, TARGET_DAYS, TARGET_TESTERS,
  testerStatusLabel, type Progress,
} from '../lib/progress'
import type { AppDoc, BuildDoc, TesterDoc } from '../lib/types'

type DialogKind = null | 'join' | 'feedback' | 'build' | 'manual' | { tester: TesterDoc }

export function AppDetail() {
  const { id } = useParams()
  const app = useApp(id)
  const testers = useTesters(id)
  const builds = useBuilds(id)
  const { user, isAdmin, signIn } = useAuth()
  const toast = useToast()
  const [dialog, setDialog] = useState<DialogKind>(null)

  const progress = useMemo(
    () => (app.data ? computeProgress(app.data, testers.data, builds.data) : null),
    [app.data, testers.data, builds.data],
  )

  if (app.error) return <ErrorBox text="Aplikasi gagal dimuat." onRetry={app.retry} />
  if (app.data === null || (app.data && app.data.deleted && !isAdmin)) return <NotFound what="Aplikasi" />
  if (!app.data || !progress) return <DetailSkeleton />

  const a = app.data
  const isCreator = !!user && (user.uid === a.creatorUid || isAdmin)
  const mine = user ? testers.data.find((t) => t.uid === user.uid) : undefined
  const loading = testers.loading || builds.loading

  const needLogin = async (then: DialogKind) => {
    try {
      if (!user) await signIn()
      setDialog(then)
    } catch (e) { toast(errorText(e)) }
  }

  return (
    <>
      <Link to="/" className="crumb"><IconBack />Aplikasi</Link>
      <div className="title-row">
        <div style={{ minWidth: 0 }}>
          <h1>{a.name}</h1>
          <p className="sub" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px' }}>
            <StatusPill status={a.status} />
            <Link to={`/u/${a.creatorUid}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
              <Avatar name={a.creatorName} photo={a.creatorPhotoURL} id={a.creatorUid} />{a.creatorName}
            </Link>
            {a.packageName && <span>{a.packageName}</span>}
          </p>
        </div>
        <div className="actions">
          {a.storeUrl && <a className="btn" href={a.storeUrl} target="_blank" rel="noreferrer"><IconExternal />Halaman Play</a>}
          {isCreator && <Link className="btn" to={`/apps/${a.id}/edit`}>Edit aplikasi</Link>}
        </div>
      </div>

      <Finding app={a} p={progress} loading={loading} description={a.description} />

      {isNewBuild(a) && builds.data[0] && (
        <div className="notice" role="status">
          <span><b>Build baru {builds.data[0].versionName}</b> · {relDays(builds.data[0].uploadedAt)}. Perbarui aplikasi dari Play Store, lalu uji lagi.</span>
          <span className="spacer" />
          <a className="link" href={a.storeUrl ?? a.optInUrl} target="_blank" rel="noreferrer">Buka di Play</a>
        </div>
      )}

      <div className="grid">
        <section className="panel span-8" aria-labelledby="board-h">
          <header>
            <div>
              <h2 id="board-h">Menuju 12 tester × 14 hari</h2>
              <p className="lead-num" style={{ marginTop: 8 }}>{loading ? <Skel w={90} h={32} /> : <>{progress.eligible}<small> /{TARGET_TESTERS} tester lulus 14 hari</small></>}</p>
            </div>
            <div className="legend" aria-hidden="true">
              <span><i style={{ background: 'var(--accent)' }} />14 hari tercapai</span>
              <span><i style={{ background: 'var(--accent-mid)' }} />Hari berjalan</span>
              <span><i style={{ background: 'var(--raised)' }} />Kursi kosong</span>
            </div>
          </header>
          {testers.error ? <ErrorBox text="Daftar tester gagal dimuat." onRetry={testers.retry} /> : <Board seats={progress.seats} loading={testers.loading} />}
        </section>

        <aside className="span-4 col-fill">
          <ActionPanel
            app={a} p={progress} mine={mine} isCreator={isCreator} signedIn={!!user}
            onJoin={() => needLogin('join')} onFeedback={() => setDialog('feedback')}
            onBuild={() => setDialog('build')} onManual={() => setDialog('manual')}
          />
          <CreatorCard app={a} />
        </aside>

        <Kpis p={progress} app={a} loading={loading} />

        <TesterTable
          testers={testers.data} loading={testers.loading} isCreator={isCreator} myUid={user?.uid}
          onManage={(t) => setDialog({ tester: t })} onManual={() => setDialog('manual')}
        />

        <section className="panel span-12" aria-label="Build dan catatan feedback">
          <div className="split">
            <BuildLog builds={builds.data} loading={builds.loading} error={builds.error} retry={builds.retry} p={progress} app={a} isCreator={isCreator} onAdd={() => setDialog('build')} />
            <FeedbackList testers={testers.data} loading={testers.loading} />
          </div>
        </section>
      </div>

      <JoinDialog open={dialog === 'join'} onClose={() => setDialog(null)} app={a} rejoin={mine?.status === 'left'} />
      <FeedbackDialog open={dialog === 'feedback'} onClose={() => setDialog(null)} app={a} entry={mine} />
      <BuildDialog open={dialog === 'build'} onClose={() => setDialog(null)} app={a} />
      <ManualTesterDialog open={dialog === 'manual'} onClose={() => setDialog(null)} app={a} />
      <TesterDialog open={typeof dialog === 'object' && dialog !== null} onClose={() => setDialog(null)} app={a} tester={typeof dialog === 'object' && dialog ? dialog.tester : undefined} />
    </>
  )
}

function Finding({ app, p, loading, description }: { app: AppDoc; p: Progress; loading: boolean; description: string }) {
  if (loading) return <p className="muted" style={{ marginTop: -8, marginBottom: 24 }}><Skel w={420} h={16} /></p>
  const soonest = p.seats.filter((s) => !s.eligible).map((s) => TARGET_DAYS - s.days)[0]
  let text: string
  if (app.status === 'live') text = `Sudah rilis produksi. ${p.active} tester masih tercatat aktif.`
  else if (p.ready) text = `Siap ajukan akses produksi: ${p.eligible} tester sudah 14 hari berturut-turut.`
  else if (p.active < TARGET_TESTERS) {
    const need = TARGET_TESTERS - p.active
    text = `Butuh ${need} tester aktif lagi.` + (soonest != null ? ` Tester terlama lulus 14 hari ${soonest === 1 ? 'besok' : `${soonest} hari lagi`}.` : ' Belum ada yang mendaftar.')
  } else {
    text = `Kursi sudah terisi; tinggal ${TARGET_TESTERS - p.eligible} tester lagi lulus 14 hari` + (soonest != null ? `, paling cepat ${soonest === 1 ? 'besok' : `${soonest} hari lagi`}.` : '.')
  }
  return (
    <div style={{ marginTop: -8, marginBottom: 24, display: 'grid', gap: 6, maxWidth: '76ch' }}>
      <p style={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>{text}</p>
      <p className="muted" style={{ fontSize: 16, lineHeight: '24px' }}>{description}</p>
      {p.lowEngagement && app.status !== 'live' && (
        <p className="small" style={{ color: 'var(--warning)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pill warn">Keterlibatan rendah</span>
          {p.builds === 0 ? 'Belum ada build baru selama uji.' : 'Kurang dari separuh tester yang lulus 14 hari sudah kirim feedback.'} Google juga menilai feedback dan pembaruan, bukan hanya jumlah tester.
        </p>
      )}
    </div>
  )
}

function ActionPanel(props: {
  app: AppDoc; p: Progress; mine?: TesterDoc; isCreator: boolean; signedIn: boolean
  onJoin: () => void; onFeedback: () => void; onBuild: () => void; onManual: () => void
}) {
  const { app, mine, isCreator } = props
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const guide = app.feedbackGuide ? (
    <div className="stack-8">
      <h3 style={{ fontWeight: 600 }}>Yang ingin diuji kreator</h3>
      <p className="guide-quote">{app.feedbackGuide}</p>
    </div>
  ) : (
    <p className="muted">Kreator belum menulis panduan feedback. Ceritakan apa yang berjalan, apa yang rusak, dan apa yang perlu diperbaiki.</p>
  )

  if (isCreator) {
    const unverified = props.p.feedbackSent - props.p.feedbackVerified
    const unreplied = props.p.feedbackSent - props.p.replied
    return (
      <section className="panel stack-16" aria-label="Kelola aplikasi">
        <h2>Aplikasi Anda</h2>
        <dl className="kv">
          <dt>Feedback belum diverifikasi</dt><dd>{unverified}</dd>
          <dt>Feedback belum dibalas</dt><dd>{unreplied}</dd>
        </dl>
        <p className="muted small">Cek di Play Console → Testing feedback, lalu tandai lewat tombol Kelola di tabel tester.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={props.onBuild}><IconPlus />Catat build</button>
          <button className="btn" onClick={props.onManual}>Tambah tester manual</button>
        </div>
        {guide}
      </section>
    )
  }

  if (mine?.status === 'active') {
    const d = daysActive(mine)
    const leave = async () => {
      if (!window.confirm(`Berhenti menguji ${app.name}? Hari aktif Anda (${d} hari) berhenti dihitung.`)) return
      setBusy(true)
      try { await api.leaveTesting({ appId: app.id }); toast('Anda berhenti menguji aplikasi ini.') } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
    }
    return (
      <section className="panel stack-16" aria-label="Status Anda sebagai tester">
        <div>
          <h2>Anda tester di sini</h2>
          <p className="lead-num" style={{ marginTop: 8 }}>{Math.min(d, 999)}<small> /{TARGET_DAYS} hari</small></p>
          <div style={{ marginTop: 8 }}><Bar value={Math.min(d, TARGET_DAYS)} max={TARGET_DAYS} label="Hari aktif Anda" /></div>
          <p className="muted small" style={{ marginTop: 6 }}>Sejak {fmtDate(mine.optedInAt)}. Jangan uninstall sebelum 14 hari.</p>
        </div>
        {mine.feedbackSent ? (
          <div className="stack-8">
            <p><span className={`fb ${mine.feedbackVerified ? 'verified' : 'sent'}`}><IconCheck double={mine.feedbackVerified} />{mine.feedbackVerified ? 'Feedback terverifikasi' : 'Feedback terkirim'}</span>
              <span className="muted"> · {fmtShort(mine.feedbackSentAt)}{mine.replied ? ' · sudah dibalas' : ''}</span></p>
            {mine.feedbackSummary && <p className="guide-quote">{mine.feedbackSummary}</p>}
            <button className="text-action" style={{ justifySelf: 'start' }} onClick={props.onFeedback}>Ubah catatan feedback</button>
          </div>
        ) : (
          <>
            {guide}
            <button className="btn primary block" onClick={props.onFeedback}>Saya sudah kirim feedback di Play</button>
          </>
        )}
        <button className="text-action" style={{ justifySelf: 'start', color: 'var(--muted)' }} disabled={busy} onClick={leave}>Berhenti menguji</button>
      </section>
    )
  }

  if (mine?.status === 'removed') {
    return (
      <section className="panel stack-8" aria-label="Status Anda">
        <h2>Anda dikeluarkan</h2>
        <p className="muted">Kreator mengeluarkan Anda dari daftar tester aplikasi ini{mine.note ? `: “${mine.note}”` : '.'} Hubungi kreator lewat grup jika ini keliru.</p>
      </section>
    )
  }

  return (
    <section className="panel stack-16" aria-label="Ikut menguji">
      <h2>{mine?.status === 'left' ? 'Uji lagi aplikasi ini' : 'Ikut menguji'}</h2>
      {mine?.status === 'left' && <p className="muted">Anda berhenti pada {fmtDate(mine.leftAt)}. Mendaftar lagi memulai hitungan 14 hari dari awal.</p>}
      {guide}
      <div className="stack-8">
        <button className="btn primary block" onClick={props.onJoin}>{props.signedIn ? 'Daftar jadi tester' : 'Masuk dan daftar jadi tester'}</button>
        <p className="muted small">Butuh 3 langkah: gabung grup, buka link opt-in, pasang aplikasinya.</p>
      </div>
    </section>
  )
}

function Kpis({ p, app, loading }: { p: Progress; app: AppDoc; loading: boolean }) {
  const v = (x: React.ReactNode) => (loading ? <Skel w={64} h={24} /> : x)
  return (
    <section className="kpis span-12" aria-label="Ringkasan keterlibatan">
      <div className="kpi">
        <div className="kpi-label">Tester aktif</div>
        <div className="kpi-value num">{v(<>{p.active}<small>/{TARGET_TESTERS}</small></>)}</div>
        <div className="bar-wrap" style={{ marginTop: 12 }}><Bar value={p.active} max={TARGET_TESTERS} label="Tester aktif" ends={false} /></div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Hari uji</div>
        <div className="kpi-value num">{p.testDay == null ? <span className="dash">—</span> : v(<>{p.testDay}<small>/{TARGET_DAYS}</small></>)}</div>
        {p.testDay == null ? <p className="note">Tanggal mulai uji belum diisi kreator.</p> : <div style={{ marginTop: 12 }}><Bar value={p.testDay} max={TARGET_DAYS} label="Hari uji" ends={false} /></div>}
      </div>
      <div className="kpi">
        <div className="kpi-label">Feedback di Play</div>
        <div className="kpi-value num">{v(<>{p.feedbackSent}<small> terkirim</small></>)}</div>
        <p className="note">{p.feedbackVerified} terverifikasi kreator</p>
      </div>
      <div className="kpi">
        <div className="kpi-label">Dibalas kreator</div>
        <div className="kpi-value num">{v(p.feedbackSent === 0 ? <span className="dash">—</span> : <>{p.replied}<small>/{p.feedbackSent}</small></>)}</div>
        <p className="note">{p.feedbackSent === 0 ? 'Belum ada feedback untuk dibalas' : 'dari tester yang kirim feedback'}</p>
      </div>
      <div className="kpi">
        <div className="kpi-label">Build selama uji</div>
        <div className="kpi-value num">{v(<>{p.builds}<small>/{TARGET_BUILDS}</small></>)}</div>
        <p className="note">{app.lastBuildAt ? `Terakhir ${relDays(app.lastBuildAt)}` : 'Target komunitas, bukan aturan Google'}</p>
      </div>
    </section>
  )
}

type SortKey = 'name' | 'since' | 'days'

function TesterTable({ testers, loading, isCreator, myUid, onManage, onManual }: {
  testers: TesterDoc[]; loading: boolean; isCreator: boolean; myUid?: string
  onManage: (t: TesterDoc) => void; onManual: () => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'days', dir: 'desc' })
  const now = Date.now()
  const rank = { active: 0, left: 1, removed: 2 }
  const rows = useMemo(() => {
    const m = sort.dir === 'asc' ? 1 : -1
    return [...testers].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
      if (sort.key === 'name') return m * a.displayName.localeCompare(b.displayName)
      if (sort.key === 'since') return m * (a.optedInAt - b.optedInAt)
      return m * (daysActive(a, now) - daysActive(b, now))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testers, sort])

  const th = (key: SortKey, label: string, num = false) => {
    const on = sort.key === key
    return (
      <th className={num ? 'num' : ''} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button onClick={() => setSort({ key, dir: on && sort.dir === 'desc' ? 'asc' : 'desc' })}>
          {label}{on && <IconSort dir={sort.dir} />}
        </button>
      </th>
    )
  }
  const active = testers.filter((t) => t.status === 'active').length

  return (
    <section className="panel flush span-12" aria-labelledby="testers-h">
      <header>
        <h2 id="testers-h">Daftar tester</h2>
        <span style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span className="meta num">{active} aktif · {testers.length - active} riwayat</span>
          {isCreator && <button className="btn sm" onClick={onManual}><IconPlus />Tambah manual</button>}
        </span>
      </header>
      <div className="table-wrap dtable dtable-t" style={{ marginTop: 8 }}>
        <table className="data">
          <thead>
            <tr>
              <th className="num" style={{ width: 48 }}>#</th>
              {th('name', 'Nama')}
              <th>Email</th>
              {th('since', 'Opt-in sejak')}
              {th('days', 'Hari aktif', true)}
              <th>Status</th>
              <th>Feedback di Play</th>
              <th>Dibalas</th>
              {isCreator && <th><span className="sr-only">Kelola</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }, (_, i) => (
              <tr key={i}><td /><td><Skel w={140} /></td><td><Skel w={120} /></td><td><Skel w={80} /></td><td className="num"><Skel w={24} /></td><td><Skel w={70} h={22} /></td><td><Skel w={80} /></td><td><Skel w={24} /></td>{isCreator && <td />}</tr>
            ))}
            {!loading && rows.map((t, i) => {
              const d = daysActive(t, now)
              const elig = t.status === 'active' && d >= TARGET_DAYS
              return (
                <tr key={t.id} className={`${t.status !== 'active' ? 'muted' : ''} ${t.uid && t.uid === myUid ? 'mine' : ''}`}>
                  <td className="num faint">{i + 1}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={t.displayName} photo={t.photoURL} id={t.uid ?? t.id} />
                      <span className="cell-2" style={{ minWidth: 0 }}>
                        {t.uid ? <Link to={`/u/${t.uid}`}><b>{t.displayName}</b></Link> : <b>{t.displayName}</b>}
                        {(t.note || t.addedBy === 'creator') && <span>{t.note ?? 'Ditambahkan kreator'}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="muted">{t.maskedEmail}</td>
                  <td className="num" style={{ textAlign: 'left' }}>{fmtDate(t.optedInAt)}</td>
                  <td className="num">{d}</td>
                  <td>{elig ? <span className="pill acc">Lulus 14 hari</span> : <span className={`pill ${t.status === 'removed' ? 'neg' : ''}`}>{testerStatusLabel[t.status]}</span>}</td>
                  <td><FeedbackMark t={t} /></td>
                  <td>{t.replied ? 'Sudah' : <span className="dash">—</span>}</td>
                  {isCreator && <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => onManage(t)}>Kelola</button></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mlist mlist-t" style={{ marginTop: 8 }}>
        {!loading && rows.map((t) => {
          const d = daysActive(t, now)
          const elig = t.status === 'active' && d >= TARGET_DAYS
          return (
            <div className="mrow" key={t.id} style={t.uid && t.uid === myUid ? { background: 'var(--accent-soft)' } : undefined}>
              <span className="l1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={t.displayName} photo={t.photoURL} id={t.uid ?? t.id} />{t.displayName}</span>
              <span className="r1 num">{d}<span className="muted"> hari</span></span>
              <span className="l2">
                {elig ? <span className="pill acc">Lulus 14 hari</span> : <span className={`pill ${t.status === 'removed' ? 'neg' : ''}`}>{testerStatusLabel[t.status]}</span>}
                <FeedbackMark t={t} />
                <span>{t.replied ? 'dibalas' : 'belum dibalas'}</span>
                <span>{t.maskedEmail}</span>
                {isCreator && <button className="text-action" style={{ marginLeft: 'auto' }} onClick={() => onManage(t)}>Kelola</button>}
              </span>
            </div>
          )
        })}
      </div>
      {!loading && testers.length === 0 && (
        <div style={{ padding: 16 }}><div className="empty">Belum ada tester. Kursi pertama masih kosong.</div></div>
      )}
    </section>
  )
}

function FeedbackMark({ t }: { t: TesterDoc }) {
  if (t.feedbackVerified) return <span className="fb verified"><IconCheck double />Terverifikasi</span>
  if (t.feedbackSent) return <span className="fb sent"><IconCheck />Terkirim</span>
  return <span className="dash">—</span>
}

function BuildLog({ builds, loading, error, retry, p, app, isCreator, onAdd }: {
  builds: BuildDoc[]; loading: boolean; error: string | null; retry: () => void; p: Progress; app: AppDoc; isCreator: boolean; onAdd: () => void
}) {
  const shown = builds.slice(0, 5)
  return (
    <div aria-labelledby="builds-h">
      <header>
        <h2 id="builds-h">Log build</h2>
        {isCreator ? <button className="btn sm" onClick={onAdd}><IconPlus />Catat build</button> : <span className="meta num">{p.builds} selama uji{app.testStartDate ? ` sejak ${fmtShort(app.testStartDate)}` : ''}</span>}
      </header>
      {error ? <ErrorBox text="Log build gagal dimuat." onRetry={retry} /> : loading ? (
        <div>{[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={120} /></span><Skel w={60} /></div>)}</div>
      ) : shown.length === 0 ? (
        <div className="empty">Belum ada build baru yang dicatat. Tester menunggu pembaruan untuk diuji ulang.</div>
      ) : (
        <ol>
          {shown.map((b) => (
            <li className="row-line" key={b.id}>
              <span className="grow cell-2"><b>{b.versionName}</b><span>{b.changelog}</span></span>
              <span className="num muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.uploadedAt)}</span>
            </li>
          ))}
        </ol>
      )}
      {builds.length > 5 && <p className="muted small num" style={{ marginTop: 8 }}>{builds.length - 5} build lebih lama tidak ditampilkan.</p>}
    </div>
  )
}

function FeedbackList({ testers, loading }: { testers: TesterDoc[]; loading: boolean }) {
  const withSummary = testers
    .filter((t) => t.feedbackSent && t.feedbackSummary && t.status !== 'removed')
    .sort((a, b) => (b.feedbackSentAt ?? 0) - (a.feedbackSentAt ?? 0))
  const shown = withSummary.slice(0, 5)
  return (
    <div aria-labelledby="fb-h">
      <header>
        <h2 id="fb-h">Catatan feedback tester</h2>
        <span className="meta num">{withSummary.length} catatan</span>
      </header>
      {loading ? (
        <div>{[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={200} /></span></div>)}</div>
      ) : shown.length === 0 ? (
        <div className="empty">Belum ada catatan. Tester bisa menulis ringkasan saat menandai feedback terkirim.</div>
      ) : (
        <ul>
          {shown.map((t) => (
            <li className="row-line" key={t.id} style={{ alignItems: 'flex-start' }}>
              <Avatar name={t.displayName} photo={t.photoURL} id={t.uid ?? t.id} />
              <span className="grow">
                <span style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <b style={{ fontWeight: 500 }}>{t.displayName}</b>
                  <span className="muted small num" style={{ whiteSpace: 'nowrap' }}>{fmtShort(t.feedbackSentAt)}{t.feedbackVerified ? ' · terverifikasi' : ''}</span>
                </span>
                <span style={{ display: 'block', marginTop: 2 }}>{t.feedbackSummary}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {withSummary.length > 5 && <p className="muted small num" style={{ marginTop: 8 }}>{withSummary.length - 5} catatan lain tidak ditampilkan.</p>}
    </div>
  )
}

function CreatorCard({ app }: { app: AppDoc }) {
  const t = app.creatorTestingCount ?? 0
  const f = app.creatorFeedbackSentCount ?? 0
  const v = app.creatorFeedbackVerifiedCount ?? 0
  return (
    <section className="panel stack-12" aria-labelledby="creator-h">
      <h2 id="creator-h" style={{ fontSize: 16 }}>Kreatornya juga membantu?</h2>
      <Link to={`/u/${app.creatorUid}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={app.creatorName} photo={app.creatorPhotoURL} id={app.creatorUid} />
        <span style={{ fontWeight: 500 }}>{app.creatorName}</span>
      </Link>
      <p className="num">{t === 0 ? <span>Belum menguji aplikasi anggota lain.</span> : <>Menguji <b>{t} aplikasi</b> · feedback di {f}{f > 0 ? ` (${v} terverifikasi)` : ''}</>}</p>
    </section>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat aplikasi">
      <Skel w={80} />
      <div style={{ margin: '16px 0 32px' }}><Skel w={280} h={32} /></div>
      <div className="grid">
        <div className="panel span-8" style={{ height: 380 }} />
        <div className="panel span-4" style={{ height: 380 }} />
      </div>
    </div>
  )
}
