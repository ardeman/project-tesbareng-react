import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Bar, Chip, Dialog, Empty, ErrorBox, FeedbackChip, NotFound, Skel, StatusPill, TesterChip, useToast } from '../components/bits'
import { IconBack, IconExternal, IconPlus, IconSort } from '../components/icons'
import { Board, BoardLegend } from '../components/Board'
import { BuildDialog, FeedbackDialog, JoinDialog, ManualTesterDialog, TesterDialog } from '../components/dialogs'
import { useAuth } from '../lib/auth'
import { usePageMeta } from '../lib/pageMeta'
import { api, errorText, useApp, useBadgesOf, useBuilds, useTesters } from '../lib/data'
import {
  computeProgress, daysActive, fmtDate, fmtShort, isNewBuild, relDays, TARGET_BUILDS, TARGET_DAYS, TARGET_TESTERS,
  type Progress,
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
  usePageMeta(app.data && !app.data.deleted ? app.data.name : 'Aplikasi', app.data && !app.data.deleted ? app.data.description : undefined)

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
      <Link to="/apps" className="crumb"><IconBack />Aplikasi</Link>
      <div className="title-row">
        <div style={{ minWidth: 0 }}>
          <h1>{a.name}</h1>
          <div className="sub meta-line">
            <StatusPill status={a.status} />
            <Link to={`/u/${a.creatorUid}`} className="creator-link">
              <Avatar name={a.creatorName} photo={a.creatorPhotoURL} /><span>{a.creatorName}</span>
            </Link>
            {a.packageName && <span className="pkg">{a.packageName}</span>}
          </div>
        </div>
        <div className="actions">
          {a.storeUrl && <a className="btn" href={a.storeUrl} target="_blank" rel="noreferrer"><IconExternal />Halaman Play</a>}
          {isCreator && <Link className="btn" to={`/apps/${a.id}/edit`}>Edit aplikasi</Link>}
        </div>
      </div>

      <Finding app={a} p={progress} loading={loading} description={a.description} />

      {isNewBuild(a) && builds.data[0] && (
        <div className="notice info" role="status">
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
              <p className="lead-num num" style={{ marginTop: 'var(--s-2)' }}>{loading ? <Skel w={90} h={32} /> : <>{progress.eligible}<small> / {TARGET_TESTERS} tester lulus 14 hari</small></>}</p>
            </div>
            <BoardLegend />
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

        <section className="panel split-host span-12" aria-label="Build dan catatan feedback">
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
  if (loading) return <div className="finding"><Skel w={420} h={20} /></div>
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
    <div className="finding">
      <p className="verdict num">{text}</p>
      <p className="desc">{description}</p>
      {p.lowEngagement && app.status !== 'live' && (
        <p className="flag">
          <Chip glyph="!">Keterlibatan rendah</Chip>
          <span>{p.builds === 0 ? 'Belum ada build baru selama uji.' : 'Kurang dari separuh tester yang lulus 14 hari sudah kirim feedback.'} Google juga menilai feedback dan pembaruan, bukan hanya jumlah tester.</span>
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
  const [confirmLeave, setConfirmLeave] = useState(false)
  // Stamp the feedback chip only when "sent" flips on while this panel is open, not on every visit.
  const sentBefore = useRef(mine?.feedbackSent)
  const [stamp, setStamp] = useState(false)
  useEffect(() => {
    if (mine?.feedbackSent && sentBefore.current === false) setStamp(true)
    sentBefore.current = mine?.feedbackSent
  }, [mine?.feedbackSent])
  const guide = app.feedbackGuide ? (
    <div className="stack-8">
      <h3>Yang ingin diuji kreator</h3>
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
        <div className="btn-row">
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
      setConfirmLeave(false)
      setBusy(true)
      try { await api.leaveTesting({ appId: app.id }); toast('Anda berhenti menguji aplikasi ini.') } catch (e) { toast(errorText(e)) } finally { setBusy(false) }
    }
    return (
      <section className="panel stack-16" aria-label="Status Anda sebagai tester">
        <div>
          <h2>Anda tester di sini</h2>
          <p className="lead-num num" style={{ marginTop: 'var(--s-2)' }}>{Math.min(d, 999)}<small> / {TARGET_DAYS} hari</small></p>
          <div style={{ marginTop: 'var(--s-2)' }}><Bar value={Math.min(d, TARGET_DAYS)} max={TARGET_DAYS} label="Hari aktif Anda" /></div>
          <p className="muted small num" style={{ marginTop: 'var(--s-2)' }}>Sejak {fmtDate(mine.optedInAt)}. Jangan uninstall sebelum 14 hari.</p>
        </div>
        {mine.feedbackSent ? (
          <div className="stack-8">
            <p className="creator-nums">
              <span className="strong">Feedback</span>
              <FeedbackChip t={mine} className={stamp ? 'stamp' : undefined} />
              <span className="muted small num">{fmtShort(mine.feedbackSentAt)}{mine.replied ? ' · sudah dibalas' : ''}</span>
            </p>
            {mine.feedbackSummary && <p className="guide-quote">{mine.feedbackSummary}</p>}
            <button className="text-action" style={{ justifySelf: 'start' }} onClick={props.onFeedback}>Ubah catatan feedback</button>
          </div>
        ) : (
          <>
            {guide}
            <button className="btn primary block" onClick={props.onFeedback}>Saya sudah kirim feedback di Play</button>
          </>
        )}
        <button className="text-action quiet" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => setConfirmLeave(true)}>{busy ? 'Menyimpan…' : 'Berhenti menguji'}</button>
        <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)} label={`Berhenti menguji ${app.name}?`}>
          <div className="sheet-body">
            <h2>Berhenti menguji {app.name}?</h2>
            <p className="lede">Hari aktif Anda ({d} hari) berhenti dihitung.</p>
          </div>
          <div className="sheet-foot">
            <button type="button" className="btn" onClick={() => setConfirmLeave(false)}>Batal</button>
            <button type="button" className="btn danger" onClick={leave}>Berhenti menguji</button>
          </div>
        </Dialog>
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
        <div className="kpi-value num">{v(<>{p.active}<small> / {TARGET_TESTERS}</small></>)}</div>
        <div style={{ marginTop: 'var(--s-2)' }}><Bar value={p.active} max={TARGET_TESTERS} label="Tester aktif" /></div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Hari uji</div>
        <div className="kpi-value num">{p.testDay == null ? <span className="dash">—</span> : v(<>{p.testDay}<small> / {TARGET_DAYS}</small></>)}</div>
        {p.testDay == null ? <p className="note">Tanggal mulai uji belum diisi kreator.</p> : <div style={{ marginTop: 'var(--s-2)' }}><Bar value={Math.min(p.testDay, TARGET_DAYS)} max={TARGET_DAYS} label="Hari uji" /></div>}
      </div>
      <div className="kpi">
        <div className="kpi-label">Feedback di Play</div>
        <div className="kpi-value num">{v(<>{p.feedbackSent}<small> terkirim</small></>)}</div>
        <p className="note">{p.feedbackVerified} terverifikasi kreator</p>
      </div>
      <div className="kpi">
        <div className="kpi-label">Dibalas kreator</div>
        <div className="kpi-value num">{v(p.feedbackSent === 0 ? <span className="dash">—</span> : <>{p.replied}<small> / {p.feedbackSent}</small></>)}</div>
        <p className="note">{p.feedbackSent === 0 ? 'Belum ada feedback untuk dibalas' : 'dari tester yang kirim feedback'}</p>
      </div>
      <div className="kpi">
        <div className="kpi-label">Build selama uji</div>
        <div className="kpi-value num">{v(<>{p.builds}<small> / {TARGET_BUILDS}</small></>)}</div>
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

  const th = (key: SortKey, label: string, num = false, extra = '') => {
    const on = sort.key === key
    return (
      <th className={`${num ? 'num' : ''} ${extra}`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="sort" onClick={() => setSort({ key, dir: on && sort.dir === 'desc' ? 'asc' : 'desc' })}>
          {label}{on && <IconSort dir={sort.dir} />}
        </button>
      </th>
    )
  }
  const active = testers.filter((t) => t.status === 'active').length
  // FR-27j: badge beside each member's name; manual entries (no uid) have none
  const badges = useBadgesOf(testers.filter((t) => t.uid).map((t) => t.uid!)).data

  return (
    <section className="panel flush span-12" aria-labelledby="testers-h">
      <header>
        <h2 id="testers-h">Daftar tester</h2>
        <span className="btn-row" style={{ alignItems: 'center' }}>
          <span className="meta num">{active} aktif · {testers.length - active} riwayat</span>
          {isCreator && <button className="btn sm" onClick={onManual}><IconPlus />Tambah manual</button>}
        </span>
      </header>
      {/* One sheet on every width (CLAUDE.md, DR-14): narrow screens scroll sideways, the name column stays. */}
      <div className="table-wrap" style={{ marginTop: 'var(--s-3)' }} tabIndex={0} role="region" aria-labelledby="testers-h">
        <table className="data sheet-table">
          <thead>
            <tr>
              {th('name', 'Nama', false, 'sticky')}
              {th('days', 'Hari aktif', true)}
              <th>Status</th>
              <th>Feedback di Play</th>
              <th>Dibalas</th>
              {th('since', 'Opt-in sejak')}
              <th>Email</th>
              {isCreator && <th><span className="sr-only">Kelola</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 4 }, (_, i) => (
              <tr key={i}><td className="sticky"><Skel w={140} /></td><td className="num"><Skel w={24} /></td><td><Skel w={80} h={24} /></td><td><Skel w={90} h={24} /></td><td><Skel w={40} /></td><td><Skel w={80} /></td><td><Skel w={120} /></td>{isCreator && <td />}</tr>
            ))}
            {!loading && rows.map((t) => {
              const d = daysActive(t, now)
              const me = !!t.uid && t.uid === myUid
              return (
                <tr key={t.id} className={`${t.status !== 'active' ? 'muted' : ''} ${me ? 'mine' : ''}`}>
                  <td className="sticky">
                    <span className="who">
                      <Avatar name={t.displayName} photo={t.photoURL} />
                      <span className="cell-2">
                        {t.uid
                          ? <span className="name-with-badge"><Link to={`/u/${t.uid}`}><b>{t.displayName}</b></Link><Badge tier={badges.get(t.uid)} size="sm" /></span>
                          : <b>{t.displayName}</b>}
                        {me && <span className="you">Anda</span>}
                        {(t.note || t.addedBy === 'creator') && <span>{t.note ?? 'Ditambahkan kreator'}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="num"><b>{d}</b></td>
                  <td><TesterChip t={t} days={d} /></td>
                  <td><FeedbackChip t={t} /></td>
                  <td>{t.replied ? <span className="strong">Sudah</span> : <span className="dash">—</span>}</td>
                  <td className="num" style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>{fmtDate(t.optedInAt)}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{t.maskedEmail}</td>
                  {isCreator && <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => onManage(t)}>Kelola<span className="sr-only"> {t.displayName}</span></button></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!loading && testers.length === 0 && (
        <div className="empty-pad">
          {/* ADR-001 §2.6: spot illustration for the empty tester list goes in Empty's `art` slot. */}
          <Empty title="Belum ada tester. Kursi pertama masih kosong.">
            <p>{isCreator ? 'Bagikan halaman ini ke grup komunitas, atau tambahkan tester yang sudah opt-in secara manual.' : 'Jadilah tester pertama lewat tombol Daftar jadi tester.'}</p>
          </Empty>
        </div>
      )}
    </section>
  )
}

function BuildLog({ builds, loading, error, retry, p, app, isCreator, onAdd }: {
  builds: BuildDoc[]; loading: boolean; error: string | null; retry: () => void; p: Progress; app: AppDoc; isCreator: boolean; onAdd: () => void
}) {
  const shown = builds.slice(0, 5)
  return (
    <section aria-labelledby="builds-h">
      <header>
        <h2 id="builds-h">Log build</h2>
        {isCreator ? <button className="btn sm" onClick={onAdd}><IconPlus />Catat build</button> : <span className="meta num">{p.builds} selama uji{app.testStartDate ? ` sejak ${fmtShort(app.testStartDate)}` : ''}</span>}
      </header>
      {error ? <ErrorBox text="Log build gagal dimuat." onRetry={retry} /> : loading ? (
        <div>{[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={120} /></span><Skel w={60} /></div>)}</div>
      ) : shown.length === 0 ? (
        <Empty title="Belum ada build yang dicatat.">
          <p>Tester menunggu pembaruan untuk diuji ulang. Target komunitas: 2–3 build selama uji.</p>
        </Empty>
      ) : (
        <ol>
          {shown.map((b) => (
            <li className="row-line" key={b.id}>
              <span className="grow cell-2"><b>{b.versionName}</b><span>{b.changelog}</span></span>
              <span className="num muted small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.uploadedAt)}</span>
            </li>
          ))}
        </ol>
      )}
      {builds.length > 5 && <p className="muted small num" style={{ marginTop: 8 }}>{builds.length - 5} build lebih lama tidak ditampilkan.</p>}
    </section>
  )
}

function FeedbackList({ testers, loading }: { testers: TesterDoc[]; loading: boolean }) {
  const withSummary = testers
    .filter((t) => t.feedbackSent && t.feedbackSummary && t.status !== 'removed')
    .sort((a, b) => (b.feedbackSentAt ?? 0) - (a.feedbackSentAt ?? 0))
  const shown = withSummary.slice(0, 5)
  return (
    <section aria-labelledby="fb-h">
      <header>
        <h2 id="fb-h">Catatan feedback tester</h2>
        <span className="meta num">{withSummary.length} catatan</span>
      </header>
      {loading ? (
        <div>{[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={200} /></span></div>)}</div>
      ) : shown.length === 0 ? (
        <Empty title="Belum ada catatan feedback.">
          <p>Tester bisa menulis ringkasan saat menandai feedback terkirim.</p>
        </Empty>
      ) : (
        <ul>
          {shown.map((t) => (
            <li className="row-line top" key={t.id}>
              <Avatar name={t.displayName} photo={t.photoURL} />
              <span className="grow">
                <span style={{ display: 'flex', gap: 'var(--s-2)', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <b>{t.displayName}</b>
                  <span className="creator-nums"><span className="muted small num">{fmtShort(t.feedbackSentAt)}</span>{t.feedbackVerified && <FeedbackChip t={t} />}</span>
                </span>
                <span style={{ display: 'block', marginTop: 'var(--s-1)', overflowWrap: 'anywhere' }}>{t.feedbackSummary}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {withSummary.length > 5 && <p className="muted small num" style={{ marginTop: 8 }}>{withSummary.length - 5} catatan lain tidak ditampilkan.</p>}
    </section>
  )
}

function CreatorCard({ app }: { app: AppDoc }) {
  const t = app.creatorTestingCount ?? 0
  const f = app.creatorFeedbackSentCount ?? 0
  const v = app.creatorFeedbackVerifiedCount ?? 0
  return (
    <section className="panel stack-12" aria-labelledby="creator-h">
      <h2 id="creator-h">Kreatornya juga membantu?</h2>
      <Link to={`/u/${app.creatorUid}`} className="creator-link">
        <Avatar name={app.creatorName} photo={app.creatorPhotoURL} />
        <span>{app.creatorName}</span>
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
