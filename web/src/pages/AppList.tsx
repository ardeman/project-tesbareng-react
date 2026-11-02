import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Empty, ErrorBox, Seats, Skel, StatusPill, useToast } from '../components/bits'
import { IconPlus, IconSearch } from '../components/icons'
import { useAuth } from '../lib/auth'
import { usePageMeta } from '../lib/pageMeta'
import { errorText, useApps } from '../lib/data'
import { appStatusLabel, relDays, TARGET_TESTERS } from '../lib/progress'
import type { AppDoc, AppStatus } from '../lib/types'

type Tab = 'all' | AppStatus
type Sort = 'need' | 'creator' | 'new'
const TABS: Tab[] = ['all', 'recruiting', 'testing', 'applied', 'live']
const STILL_TESTING: AppStatus[] = ['recruiting', 'testing']

interface Row { app: AppDoc; eligible: number }

export function AppList() {
  const apps = useApps()
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('need')
  usePageMeta('Daftar aplikasi', 'Aplikasi Android anggota komunitas yang sedang uji tertutup dan butuh tester.')

  const rows = useMemo<Row[]>(() => apps.data.map((app) => ({ app, eligible: app.eligibleCount })), [apps.data])

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: rows.length, recruiting: 0, testing: 0, applied: 0, live: 0 }
    for (const r of rows) c[r.app.status]++
    return c
  }, [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = rows.filter((r) => (tab === 'all' || r.app.status === tab) && (!needle || r.app.name.toLowerCase().includes(needle)))
    const still = (r: Row) => (STILL_TESTING.includes(r.app.status) ? 0 : 1)
    const created = (r: Row) => r.app.createdAt ?? 0
    return list.sort((a, b) => {
      if (sort === 'creator') return (b.app.creatorTestingCount ?? 0) - (a.app.creatorTestingCount ?? 0) || a.app.activeTesterCount - b.app.activeTesterCount
      if (sort === 'new') return created(b) - created(a)
      return still(a) - still(b) || a.app.activeTesterCount - b.app.activeTesterCount || created(b) - created(a)
    })
  }, [rows, tab, q, sort])

  const short = rows.filter((r) => STILL_TESTING.includes(r.app.status) && r.app.activeTesterCount < TARGET_TESTERS).length
  const ready = rows.filter((r) => r.eligible >= TARGET_TESTERS && r.app.status !== 'live').length
  const loading = apps.loading

  const add = async () => {
    try {
      if (!user) await signIn('/apps/new')
      navigate('/apps/new')
    } catch (e) { toast(errorText(e)) }
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Aplikasi</h1>
          <p className="sub">
            {loading ? <Skel w={360} h={16} /> : rows.length === 0 ? 'Belum ada aplikasi yang sedang uji tertutup.' : (
              <><b>{short} dari {rows.length} aplikasi</b> masih kurang dari 12 tester aktif{ready > 0 && <>; {ready} sudah siap ajukan produksi</>}.</>
            )}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={add}><IconPlus />Tambah aplikasi</button>
        </div>
      </div>

      {/* A filter, not tabs: one list below, narrowed by status. Toggle buttons, one pressed at a time. */}
      <div className="tabs" role="group" aria-label="Saring menurut status">
        {TABS.map((t) => (
          <button key={t} type="button" className="tab" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === 'all' ? 'Semua' : appStatusLabel[t]}<span className="n num">{loading ? '' : counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Cari nama aplikasi</span>
          <IconSearch />
          <input className="input" type="search" placeholder="Cari nama aplikasi" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="spacer" />
        <span className="total num">{loading ? '' : `${shown.length} aplikasi`}</span>
        <label className="sr-only" htmlFor="sort">Urutkan</label>
        <select id="sort" className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="need">Paling butuh tester</option>
          <option value="creator">Kreator paling aktif menguji</option>
          <option value="new">Terbaru</option>
        </select>
      </div>

      {apps.error && <ErrorBox text="Daftar aplikasi gagal dimuat." onRetry={apps.retry} />}

      <div className="panel flush">
        <div className="table-wrap dtable">
          <table className="data">
            <thead>
              <tr>
                <th className="col-id">Aplikasi</th>
                <th>Tester aktif</th>
                <th className="num md-hide">Lewat 14 hari</th>
                <th className="num">Feedback di Play</th>
                <th className="md-hide">Kreatornya menguji</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      <td className="cell-2"><Skel w={160} /><br /><Skel w={110} h={12} /></td>
                      <td><Skel w={150} /></td><td className="num md-hide"><Skel w={40} /></td><td className="num"><Skel w={90} /></td>
                      <td className="md-hide"><Skel w={140} /></td><td><Skel w={120} h={24} /></td>
                    </tr>
                  ))
                : shown.map((r) => <DesktopRow key={r.app.id} row={r} onOpen={() => navigate(`/apps/${r.app.id}`)} />)}
            </tbody>
          </table>
        </div>
        <div className="mlist">
          {loading
            ? Array.from({ length: 5 }, (_, i) => <div className="mrow" key={i}><Skel w={150} /><Skel w={40} /><span className="l2"><Skel w={220} h={12} /></span></div>)
            : shown.map((r) => <PhoneRow key={r.app.id} row={r} />)}
        </div>
        {!loading && shown.length === 0 && (
          <div className="empty-pad">
            {rows.length === 0 ? (
              <Empty title="Belum ada aplikasi yang sedang uji tertutup.">
                <p>Daftarkan aplikasi Anda lewat tombol Tambah aplikasi di atas, agar anggota lain bisa ikut menguji.</p>
              </Empty>
            ) : q ? (
              <Empty title={`Tidak ada aplikasi bernama “${q}” dengan status ini.`}>
                <button className="text-action" onClick={() => { setQ(''); setTab('all') }}>Hapus pencarian dan lihat semua</button>
              </Empty>
            ) : (
              <Empty title="Belum ada aplikasi dengan status ini.">
                <button className="text-action" onClick={() => setTab('all')}>Lihat semua aplikasi</button>
              </Empty>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function SeatCell({ app, eligible }: Row) {
  return (
    <span className="seat-cell">
      <Seats active={app.activeTesterCount} eligible={eligible} />
      <span className="seat-count num">{app.activeTesterCount}<small> / {TARGET_TESTERS}</small></span>
    </span>
  )
}

function creatorLine(app: AppDoc) {
  const t = app.creatorTestingCount ?? 0
  const f = app.creatorFeedbackSentCount ?? 0
  const v = app.creatorFeedbackVerifiedCount ?? 0
  return { t, f, v }
}

function DesktopRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { app, eligible } = row
  const c = creatorLine(app)
  return (
    <tr className="clickable" onClick={onOpen}>
      <td className="cell-2">
        <Link to={`/apps/${app.id}`} onClick={(e) => e.stopPropagation()}><b>{app.name}</b></Link>
        <span>{app.creatorName} · didaftarkan {relDays(app.createdAt)}</span>
        <span className="md-show">Kreatornya menguji {c.t} aplikasi <Badge tier={app.creatorBadgeTier} size="sm" /></span>
      </td>
      <td className="cell-2"><SeatCell app={app} eligible={eligible} /><span className="md-show">{eligible} lewat 14 hari</span></td>
      <td className="num md-hide"><b>{eligible}</b><span className="of"> / {TARGET_TESTERS}</span></td>
      <td className="num">
        {app.feedbackSentCount === 0 ? <span className="dash">0</span> : <><b>{app.feedbackSentCount}</b><span className="muted"> · {app.feedbackVerifiedCount} terverifikasi</span></>}
      </td>
      <td className="muted md-hide">
        <span className="creator-nums">
          {c.t === 0 ? <span>Belum menguji aplikasi lain</span> : <span><b style={{ color: 'var(--ink)' }}>{c.t} aplikasi</b> · feedback {c.f}</span>}
          <Badge tier={app.creatorBadgeTier} size="sm" />
        </span>
      </td>
      <td><StatusPill status={app.status} /></td>
    </tr>
  )
}

function PhoneRow({ row }: { row: Row }) {
  const { app, eligible } = row
  const c = creatorLine(app)
  return (
    <Link to={`/apps/${app.id}`} className="mrow">
      <span className="l1">{app.name}</span>
      <span className="r1 num">{app.activeTesterCount}<span className="of"> / {TARGET_TESTERS}</span></span>
      <span className="l2">
        <Seats active={app.activeTesterCount} eligible={eligible} />
        <span>{eligible} lewat 14 hari</span>
        <span>feedback {app.feedbackSentCount}</span>
      </span>
      <span className="l2">
        <StatusPill status={app.status} />
        <span>{app.creatorName} · menguji {c.t} aplikasi</span>
        <Badge tier={app.creatorBadgeTier} size="sm" />
      </span>
    </Link>
  )
}
