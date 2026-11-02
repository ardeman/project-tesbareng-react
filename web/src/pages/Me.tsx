import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, ErrorBox, Seats, Skel, StatusPill, useToast } from '../components/bits'
import { IconPlus } from '../components/icons'
import { useAuth } from '../lib/auth'
import { errorText, useApps, useAppsBy, useEntriesOf, usePublicProfile } from '../lib/data'
import { daysActive, isNewBuild, relDays, TARGET_DAYS, TARGET_TESTERS } from '../lib/progress'
import type { AppDoc, TesterDoc } from '../lib/types'

interface Todo { entry: TesterDoc; app: AppDoc; kind: 'build' | 'feedback' }

export function Me() {
  const { user, ready, signIn } = useAuth()
  const toast = useToast()
  if (!ready) return <Skel w={200} h={32} />
  if (!user) {
    return (
      <div className="stack-16" style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 'var(--fs-title)', lineHeight: '38px', fontWeight: 700, letterSpacing: '-0.02em' }}>Tugas saya</h1>
        <p className="muted" style={{ fontSize: 16, lineHeight: '24px' }}>Masuk untuk melihat aplikasi yang sedang Anda uji, feedback yang belum dikirim, dan build baru yang menunggu diuji ulang.</p>
        <button className="btn primary" style={{ justifySelf: 'start' }} onClick={() => signIn().catch((e) => toast(errorText(e)))}>Masuk dengan Google</button>
      </div>
    )
  }
  return <MeSignedIn uid={user.uid} />
}

function MeSignedIn({ uid }: { uid: string }) {
  const entries = useEntriesOf(uid)
  const apps = useApps()
  const myApps = useAppsBy(uid)
  const profile = usePublicProfile(uid)
  const byId = useMemo(() => new Map(apps.data.map((a) => [a.id, a])), [apps.data])
  const loading = entries.loading || apps.loading

  const testing = useMemo(
    () => entries.data
      .filter((e) => e.status === 'active' && byId.has(e.appId))
      .map((entry) => ({ entry, app: byId.get(entry.appId)! }))
      .sort((a, b) => daysActive(b.entry) - daysActive(a.entry)),
    [entries.data, byId],
  )

  const todos = useMemo<Todo[]>(() => {
    const out: Todo[] = []
    for (const { entry, app } of testing) {
      const since = entry.feedbackSentAt ?? entry.optedInAt
      if (isNewBuild(app) && app.lastBuildAt && app.lastBuildAt > since) out.push({ entry, app, kind: 'build' })
      else if (!entry.feedbackSent) out.push({ entry, app, kind: 'feedback' })
    }
    return out.sort((a, b) => (a.kind === b.kind ? daysActive(b.entry) - daysActive(a.entry) : a.kind === 'build' ? -1 : 1))
  }, [testing])

  const suggestions = useMemo(() => {
    const mineIds = new Set(entries.data.map((e) => e.appId))
    return apps.data
      .filter((a) => (a.status === 'recruiting' || a.status === 'testing') && a.creatorUid !== uid && !mineIds.has(a.id) && a.activeTesterCount < TARGET_TESTERS)
      .sort((a, b) => a.activeTesterCount - b.activeTesterCount)
      .slice(0, 3)
  }, [apps.data, entries.data, uid])

  const suggestList = (
    <>
            <h3 style={{ fontWeight: 600, marginTop: 20 }}>Butuh tester sekarang</h3>
              {apps.loading ? <RowsSkeleton /> : suggestions.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>Semua aplikasi yang mencari tester sudah Anda uji.</p> : (
                <ul>
                  {suggestions.map((a) => (
                    <li className="row-line" key={a.id}>
                      <span className="grow cell-2"><Link to={`/apps/${a.id}`}><b>{a.name}</b></Link><span>{a.creatorName}</span></span>
                      <Seats active={a.activeTesterCount} eligible={a.eligibleCount} />
                      <span className="num" style={{ width: 44, textAlign: 'right' }}>{a.activeTesterCount}<span className="muted"> /{TARGET_TESTERS}</span></span>
                    </li>
                  ))}
                </ul>
              )}
  
    </>
  )
  const owe = todos.filter((t) => t.kind === 'feedback').length
  const builds = todos.length - owe
  const p = profile.data
  const listed = myApps.data.length
  const nudge = p && listed > 0 && p.testingCount < listed

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Tugas saya</h1>
          <p className="sub">
            {loading ? <Skel w={340} h={16} /> : todos.length === 0
              ? testing.length === 0 ? 'Anda belum menguji aplikasi apa pun.' : 'Tidak ada tugas tertunda. Semua aplikasi yang Anda uji sudah dapat feedback.'
              : <><b>{[owe > 0 && `${owe} feedback belum dikirim`, builds > 0 && `${builds} build baru menunggu diuji ulang`].filter(Boolean).join(', ')}</b>.</>}
          </p>
        </div>
        <div className="actions"><Link className="btn" to="/">Cari aplikasi yang butuh tester</Link></div>
      </div>

      {(entries.error || apps.error) && <ErrorBox text="Data Anda gagal dimuat." onRetry={() => { entries.retry(); apps.retry() }} />}

      <div className="grid">
        <div className="span-7 col-fill stretch">
          <section className="panel" aria-labelledby="todo-h">
            <header><h2 id="todo-h">Perlu dikerjakan</h2><span className="meta num">{loading ? '' : `${todos.length} tugas`}</span></header>
            {loading ? <RowsSkeleton /> : todos.length === 0 ? (
              <div className="empty">{testing.length === 0 ? 'Belum ada tugas. Daftar jadi tester di satu aplikasi; tugasnya muncul di sini.' : 'Beres. Cek lagi besok, atau bantu aplikasi lain.'}</div>
            ) : (
              <ul>
                {todos.slice(0, 4).map(({ entry, app, kind }) => (
                  <li className="row-line" key={entry.appId}>
                    <span className="grow cell-2">
                      <Link to={`/apps/${app.id}`}><b>{app.name}</b></Link>
                      <span>{kind === 'build' ? `Build baru dirilis ${relDays(app.lastBuildAt)}. Perbarui dari Play Store lalu uji lagi.` : `Hari ke-${daysActive(entry)}. Feedback di Play belum Anda tandai terkirim.`}</span>
                    </span>
                    <Link className="btn sm" to={`/apps/${app.id}`}>{kind === 'build' ? 'Uji build baru' : 'Kirim feedback'}</Link>
                  </li>
                ))}
              </ul>
            )}
            {todos.length > 4 && <p className="muted small" style={{ marginTop: 8 }}>{todos.length - 4} tugas lain: buka aplikasi di daftar “Sedang saya uji”.</p>}
          </section>

          <section className="panel fill" aria-labelledby="testing-h">
            <header><h2 id="testing-h">Sedang saya uji</h2><span className="meta num">{testing.length} aplikasi aktif</span></header>
            <div className="grow-body">
              {loading ? <RowsSkeleton /> : testing.length === 0 ? <><p className="muted">Belum ada. Mulai dari aplikasi dengan kursi paling kosong:</p>{suggestList}</> : (
                <ul>
                  {testing.slice(0, 4).map(({ entry, app }) => {
                    const d = daysActive(entry)
                    return (
                      <li className="row-line" key={entry.appId}>
                        <span className="grow cell-2"><Link to={`/apps/${app.id}`}><b>{app.name}</b></Link>
                          <span>{entry.feedbackVerified ? 'Feedback terverifikasi' : entry.feedbackSent ? 'Feedback terkirim' : 'Feedback belum dikirim'}{entry.replied ? ' · dibalas kreator' : ''}</span></span>
                        <span style={{ width: 140 }} className="hide-sm">
                          <Bar value={Math.min(d, TARGET_DAYS)} max={TARGET_DAYS} label={`Hari aktif di ${app.name}`} ends={false} />
                        </span>
                        <span className="num" style={{ width: 64, textAlign: 'right' }}>{d}<span className="muted"> /{TARGET_DAYS}</span></span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            {testing.length > 4 && <Link className="link small" style={{ marginTop: 12, alignSelf: 'flex-start' }} to={`/u/${uid}`}>Lihat semua {testing.length} aplikasi di profil</Link>}
          </section>
        </div>

        <div className="span-5 col-fill stretch">
          <section className="panel" aria-labelledby="recip-h">
            <header><h2 id="recip-h">Timbal balik Anda</h2><Link className="link small" to={`/u/${uid}`}>Profil publik</Link></header>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div><div className="kpi-label">Menguji</div><div className="kpi-value num">{p ? <>{p.testingCount}<small> aplikasi</small></> : <Skel w={60} h={24} />}</div><p className="note small muted" style={{ marginTop: 4 }}>aktif, atau selesai 14 hari</p></div>
              <div><div className="kpi-label">Feedback terkirim</div><div className="kpi-value num">{p ? <>{p.feedbackSentCount}<small> · {p.feedbackVerifiedCount} terverifikasi</small></> : <Skel w={60} h={24} />}</div></div>
            </div>
            {nudge && <p className="notice" style={{ margin: '16px 0 0' }}>Anda punya {listed} aplikasi terdaftar tapi baru menguji {p!.testingCount}. Bantu yang lain supaya dibantu balik.</p>}
            {testing.length > 0 && suggestList}
          </section>

          <section className="panel fill" aria-labelledby="mine-h">
            <header><h2 id="mine-h">Aplikasi saya</h2><span className="meta num">{myApps.data.length} aplikasi</span></header>
            <div className="grow-body">
              {myApps.loading ? <RowsSkeleton /> : myApps.data.length === 0 ? <p className="muted">Belum ada. Daftarkan aplikasi Anda agar komunitas bisa ikut menguji.</p> : (
                <ul>
                  {myApps.data.map((a) => (
                    <li className="row-line" key={a.id}>
                      <span className="grow cell-2"><Link to={`/apps/${a.id}`}><b>{a.name}</b></Link><span><StatusPill status={a.status} /></span></span>
                      <Seats active={a.activeTesterCount} eligible={a.eligibleCount} />
                      <span className="num" style={{ width: 44, textAlign: 'right' }}>{a.activeTesterCount}<span className="muted"> /{TARGET_TESTERS}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Link className="btn" style={{ alignSelf: 'flex-start', marginTop: 16 }} to="/apps/new"><IconPlus />Tambah aplikasi</Link>
          </section>
        </div>
      </div>
    </>
  )
}

function RowsSkeleton() {
  return <div>{[0, 1, 2].map((i) => <div className="row-line" key={i}><span className="grow"><Skel w={180} /></span><Skel w={60} /></div>)}</div>
}
