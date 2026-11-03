// B2 · Cohort list (PRD §10 "Cohort list", §6.9). Public: visitors read it too.
// Grouped by status: Aktif first (where the work is), then Sedang dibentuk (where you can still join),
// then Selesai, folded by default because it only grows.
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Empty, ErrorBox, Skel } from '../components/bits'
import { IconChevron } from '../components/icons'
import { usePageMeta } from '../lib/pageMeta'
import { fmtDate } from '../lib/progress'
import { CLOSE_DAY, cohortDay, fmtWib, joinDeadline, joinOpen, LAST_JOIN_DAY, MIN_APPS, useCohorts, type CohortDoc } from '../lib/cohorts'
import { CohortChip } from '../components/cohortBits'

export function CohortList() {
  const cohorts = useCohorts()
  usePageMeta('Cohort', 'Kelompok anggota yang saling menguji aplikasi selama 21 hari: jadwal, anggota, dan status tiap cohort.')
  const [showClosed, setShowClosed] = useState(false)
  const closedId = useId()

  const groups = useMemo(() => {
    const by = { active: [] as CohortDoc[], forming: [] as CohortDoc[], closed: [] as CohortDoc[] }
    for (const c of cohorts.data) by[c.status].push(c)
    // Closed: most recently closed first (the list arrives newest-created first).
    by.closed.sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    return by
  }, [cohorts.data])

  const loading = cohorts.loading
  const total = cohorts.data.length
  const open = groups.forming.length + groups.active.filter((c) => joinOpen(c)).length

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Cohort</h1>
          <p className="sub">
            {loading ? <Skel w={360} h={16} /> : total === 0
              ? 'Cohort mengelompokkan anggota supaya saling menguji aplikasi selama 21 hari.'
              : <>{open > 0 ? <b>{open} cohort masih menerima tester.</b> : 'Belum ada cohort yang menerima tester saat ini.'} Satu cohort berjalan paling lama {CLOSE_DAY} hari. <Link className="link" to="/about">Cara kerja cohort</Link></>}
          </p>
        </div>
      </div>

      {cohorts.error && <ErrorBox text="Daftar cohort gagal dimuat. Periksa koneksi, lalu coba lagi." onRetry={cohorts.retry} />}

      {loading ? (
        <section className="cohort-group" aria-busy="true" aria-label="Memuat cohort">
          <div className="panel flush cohort-rows">{[0, 1, 2].map((i) => <RowSkeleton key={i} />)}</div>
        </section>
      ) : !cohorts.error && total === 0 ? (
        // ADR-001 §2.6: spot illustration slot (Empty `art`) once the asset pipeline exists.
        <Empty title="Belum ada cohort.">
          <p>Admin membuka cohort baru lewat grup komunitas. Sambil menunggu, Anda tetap bisa menguji aplikasi mana pun, dan itu tetap dihitung untuk badge Anda.</p>
          <Link className="text-action" to="/apps">Lihat aplikasi yang butuh tester</Link>
        </Empty>
      ) : (
        <>
          <Group id="active" title="Aktif" note="Sedang berjalan. Hari dihitung dari Hari 0, saat admin memulai cohort." list={groups.active} />
          <Group id="forming" title="Sedang dibentuk" note={`Belum dimulai. Butuh minimal ${MIN_APPS} aplikasi; tester murni bisa langsung gabung.`} list={groups.forming} />
          {groups.closed.length > 0 && (
            <section className="cohort-group" aria-labelledby="g-closed">
              <h2 id="g-closed" className="group-title">
                <button type="button" className="cohort-fold" aria-expanded={showClosed} aria-controls={closedId} onClick={() => setShowClosed((s) => !s)}>
                  <IconChevron />Selesai<span className="n num">{groups.closed.length}</span>
                </button>
              </h2>
              {showClosed && (
                <div id={closedId} className="panel flush cohort-rows">
                  {groups.closed.map((c) => <CohortRow key={c.id} c={c} />)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  )
}

function Group({ id, title, note, list }: { id: string; title: string; note: string; list: CohortDoc[] }) {
  if (list.length === 0) return null
  return (
    <section className="cohort-group" aria-labelledby={`g-${id}`}>
      <div className="group-head">
        <h2 id={`g-${id}`} className="group-title">{title}<span className="n num">{list.length}</span></h2>
        <p className="meta">{note}</p>
      </div>
      <div className="panel flush cohort-rows">
        {list.map((c) => <CohortRow key={c.id} c={c} />)}
      </div>
    </section>
  )
}

function CohortRow({ c }: { c: CohortDoc }) {
  const day = cohortDay(c)
  const members = (
    <span className="num">
      <b>{c.appCount}</b> aplikasi · <b>{c.pureTesterCount}</b> tester murni
    </span>
  )
  let when: string
  if (c.status === 'forming') when = `Dibuat ${fmtDate(c.createdAt)}`
  else if (c.status === 'active') when = `Mulai ${fmtDate(c.day0At)} · ditutup paling lambat ${fmtDate(c.day0At! + CLOSE_DAY * 86_400_000)}`
  else when = `${fmtDate(c.day0At)} – ${fmtDate(c.closedAt)}`

  return (
    <Link to={`/cohorts/${c.id}`} className="cohort-row">
      <span className="cr-main">
        <span className="cr-name"><b>{c.name}</b><CohortChip status={c.status} /></span>
        <span className="cr-meta num">{when}</span>
      </span>

      <span className="cr-progress">
        {c.status === 'active' && day != null && (
          <>
            <span className="cr-day num"><b>Hari {day}</b> dari {CLOSE_DAY}{day > CLOSE_DAY && <> · menunggu ditutup</>}</span>
            <Bar value={Math.min(day, CLOSE_DAY)} max={CLOSE_DAY} label={`${c.name}: hari ${day} dari ${CLOSE_DAY}`} />
          </>
        )}
        {c.status === 'forming' && (
          <>
            <span className="cr-day num"><b>{c.appCount}</b>/{MIN_APPS} aplikasi</span>
            <Bar value={Math.min(c.appCount, MIN_APPS)} max={MIN_APPS} label={`${c.name}: ${c.appCount} dari ${MIN_APPS} aplikasi minimum untuk mulai`} />
          </>
        )}
        {c.status === 'closed' && day != null && <span className="cr-day num">Ditutup pada Hari {day}</span>}
      </span>

      <span className="cr-side">
        {members}
        {c.status === 'active' && joinOpen(c) && <span className="cr-open">Tester murni bisa gabung sampai akhir Hari {LAST_JOIN_DAY - 1} ({fmtWib(joinDeadline(c.day0At)!, true)})</span>}
        {c.status === 'forming' && <span className="cr-open">Tester murni bisa gabung</span>}
      </span>
    </Link>
  )
}

function RowSkeleton() {
  return (
    <div className="cohort-row" aria-hidden="true">
      <span className="cr-main"><Skel w={160} h={20} /><Skel w={220} h={12} /></span>
      <span className="cr-progress"><Skel w={120} /><Skel w="100%" h={16} /></span>
      <span className="cr-side"><Skel w={150} /></span>
    </div>
  )
}
