// B3 · Cohort detail (PRD §10, FR-33a/33b, FR-38, FR-49–51; ADR-007; ADR-009 §1 and §7).
// Public read. Primary action: "Gabung sebagai tester" while joinOpen() and the viewer is not a member.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar, Badge, Bar, Chip, Dialog, Empty, ErrorBox, failToast, OverflowMenu, Skel, useToast, type MenuItem } from '../components/bits'
import { CohortChip, StandingChip, useFocusAfterClose } from '../components/cohortBits'
import { IconBack, IconExternal } from '../components/icons'
import { useAuth } from '../lib/auth'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { errorText, useBadgesOf } from '../lib/data'
import { usePageMeta } from '../lib/pageMeta'
import { fmtDate, fmtDateTime } from '../lib/progress'
import {
  CLOSE_DAY, cohortDay, fmtWib, joinCohortAsTester, joinDeadline, joinOpen, LAST_JOIN_DAY, leaveCohort, MIN_APPS, ownDay, schedule,
  useCohort, useCohortLink, useOwingCohorts, useAssignmentStatus,
  type CohortDetail as Cohort, type CohortMember, type CellState,
} from '../lib/cohorts'
import type { BadgeTier } from '../lib/types'
import './cohort-detail.css'

const DAY = 86_400_000
/** A pure tester counts as "late" when assigned after Day 0 (FR-33b). One minute of slack for clock noise. */
const isLate = (c: Cohort, m: CohortMember | undefined) =>
  !!m && m.appId == null && m.assignedAt != null && c.day0At != null && m.assignedAt - c.day0At > 60_000

// "Kam, 5 Nov, 19.30" in WIB: due times are base + N × 24 h, so the hour matters for the 48 h opt-in.
const dueFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
const longDay = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jakarta' })

type DialogKind = null | 'join' | 'whatsapp'

export function CohortDetail() {
  const { id } = useParams()
  const cohort = useCohort(id)
  const c = cohort.data
  usePageMeta(c ? c.name : 'Cohort', c ? `${c.name}: ${c.appCount} aplikasi dan ${c.pureTesterCount} tester murni saling menguji selama ${CLOSE_DAY} hari.` : undefined)

  if (cohort.error && !c) return <ErrorBox text="Cohort gagal dimuat. Periksa koneksi, lalu coba lagi." onRetry={cohort.retry} />
  if (c === null) return <CohortNotFound />
  if (!c) return <DetailSkeleton />
  return <Detail c={c} refresh={cohort.refresh} />
}

function Detail({ c, refresh }: { c: Cohort; refresh: () => void }) {
  const { user, isAdmin, signIn } = useAuth()
  const toast = useToast()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const me = user ? c.members.find((m) => m.userId === user.uid) : undefined
  const owing = useOwingCohorts(user && !me ? user.uid : null)
  // Only members and the admin may read the link (get_cohort_link): don't ask on behalf of anyone else.
  const link = useCohortLink(c.id, !!me || isAdmin)
  const badges = useBadgesOf(c.members.map((m) => m.userId))
  const [acked, setAcked] = useState(() => readAck(c.id))
  // Join and leave remove their own trigger: land on the page title (after the join dialog has closed).
  const title = useRef<HTMLHeadingElement>(null)
  const focusTitle = useFocusAfterClose(dialog !== null, title)
  const done = () => { focusTitle(); refresh() }

  // ADR-009 §7 (owner decision 2026-11-03): leaving while Forming is reversible, so it acts at once and offers
  // "Urungkan" for 8 s instead of a confirm dialog. Undo re-joins through join_cohort_as_tester.
  const leaving = useRef(false)
  const leave = async () => {
    if (leaving.current) return
    leaving.current = true
    try {
      await leaveCohort(c.id)
      title.current?.focus()
      refresh()
      toast({
        text: `Anda keluar dari ${c.name}.`, duration: 8000,
        action: {
          label: 'Urungkan',
          onClick: () => { joinCohortAsTester(c.id).then(() => { toast(`Anda kembali bergabung di ${c.name}.`); refresh() }, (e) => toast(failToast(e))) },
        },
      })
    } catch (e) {
      toast(failToast(e))
    } finally {
      leaving.current = false
    }
  }
  const deadline = joinDeadline(c.day0At)

  const late = isLate(c, me)
  const day = cohortDay(c)
  const myDay = late ? ownDay(me!.assignedAt) : null
  const open = joinOpen(c)
  const creators = c.members.filter((m) => m.appId != null)
  const pure = c.members.filter((m) => m.appId == null)
  const owedIn = owing.data.filter((o) => o.cohortId !== c.id)

  const join = async () => {
    try {
      if (!user) await signIn()
      setDialog('join')
    } catch (e) { toast(failToast(e)) }
  }

  // ---------- actions (ADR-009 §1: one primary, up to two secondary, the rest behind "…") ----------
  const wa = link.data
  const waButton = wa && (acked
    ? <a className="btn" href={wa} target="_blank" rel="noreferrer"><IconExternal />Grup WhatsApp<span className="sr-only"> (tab baru)</span></a>
    : <button type="button" className="btn" onClick={() => setDialog('whatsapp')}>Grup WhatsApp</button>)
  const overflow: MenuItem[] = []
  if (me && me.appId == null && c.status === 'forming') overflow.push({ label: 'Keluar dari cohort', danger: true, onSelect: () => { void leave() } })
  if (isAdmin) overflow.push({ label: 'Kelola di Admin', to: `/admin?bagian=cohort&cohort=${c.id}` })

  let primary: React.ReactNode = null
  let note: React.ReactNode = null
  if (me) {
    if (c.status === 'active') primary = <Link className="btn primary" to="/me">Lihat tugas saya</Link>
    note = me.appId
      ? <>Anda ikut dengan <Link className="link" to={`/apps/${me.appId}`}>{me.appName ?? 'aplikasi Anda'}</Link>.{c.status === 'forming' && ' Untuk keluar, hubungi admin.'}</>
      : <>Anda ikut sebagai tester murni.{c.status === 'forming' && ' Tugas dibagikan saat cohort dimulai.'}</>
  } else if (open) {
    if (user && owedIn.length > 0) {
      // aria-disabled, not disabled: the button stays focusable so the reason below is read with it.
      primary = <button type="button" className="btn primary" aria-disabled="true" aria-describedby="owing-why" onClick={(e) => e.preventDefault()}>Gabung sebagai tester</button>
      note = (
        <span id="owing-why" className="err-text">
          <span>Anda masih Berutang di {owedIn.map((o, i) => <span key={o.cohortId}>{i > 0 && ', '}<Link className="link" to={`/cohorts/${o.cohortId}`}>{o.name}</Link></span>)}. Selesaikan kewajiban di sana, lalu minta admin menandai Lunas.</span>
        </span>
      )
    } else {
      primary = <button type="button" className="btn primary" onClick={join}>Gabung sebagai tester</button>
      // Creators ask, the admin decides (FR-30a/b, ADR-013): say so to everyone viewing a Forming cohort.
      const creators = c.status === 'forming' ? 'Punya aplikasi? Ajukan untuk ikut sebagai creator, lalu admin menyetujui atau menolak. Tanpa aplikasi, Anda bisa gabung sendiri sebagai tester murni.' : null
      const timing = c.status === 'active' && deadline != null ? `Pendaftaran tester murni dibuka sampai akhir Hari ${LAST_JOIN_DAY - 1}: ${fmtWib(deadline)}.` : null
      note = [creators, timing, user ? null : 'Anda diminta masuk dengan Google dulu.'].filter(Boolean).join(' ') || null
    }
  } else if (c.status === 'active') {
    note = `Pendaftaran tester murni sudah ditutup${deadline != null ? ` ${fmtWib(deadline)}` : ''} (akhir Hari ${LAST_JOIN_DAY - 1}). Anda tetap bisa menguji aplikasi mana pun dari daftar aplikasi.`
  }

  return (
    <>
      <Link to="/cohorts" className="crumb"><IconBack />Cohort</Link>

      <header className="record-head cohort-head">
        <div className="rh-main">
          <h1 ref={title} tabIndex={-1}>{c.name}</h1>
          <div className="meta-line">
            <CohortChip status={c.status} />
            <span className="num"><b>{c.appCount}</b> aplikasi · <b>{c.pureTesterCount}</b> tester murni</span>
          </div>
        </div>

        <div className="rh-progress">
          {c.status === 'active' && day != null && (
            <>
              <p className="rh-count num"><b>Hari {day}</b><small> dari {CLOSE_DAY}</small></p>
              <Bar value={Math.min(day, CLOSE_DAY)} max={CLOSE_DAY} label={`Hari ${day} dari ${CLOSE_DAY}`} />
              <p className="rh-sub num">
                Mulai {fmtDate(c.day0At)} · ditutup paling lambat {fmtDate(c.day0At! + CLOSE_DAY * DAY)}
                {day > CLOSE_DAY && ' · lewat batas, menunggu admin menutup'}
              </p>
              {late && myDay != null && (
                <p className="own-day num"><b>Hari Anda: {myDay}</b> · dihitung dari saat Anda bergabung, {fmtDate(me!.assignedAt)}</p>
              )}
            </>
          )}
          {c.status === 'forming' && (
            <>
              <p className="rh-count num"><b>{c.appCount}</b><small> / {MIN_APPS}</small><span className="rh-label">aplikasi untuk mulai</span></p>
              <Bar value={Math.min(c.appCount, MIN_APPS)} max={MIN_APPS} label={`${c.appCount} dari ${MIN_APPS} aplikasi minimum`} />
              <p className="rh-sub num">
                {c.appCount >= MIN_APPS ? 'Sudah cukup aplikasi. Admin akan memulai cohort.' : `Butuh ${MIN_APPS - c.appCount} aplikasi lagi sebelum admin bisa memulai.`} Dibuat {fmtDate(c.createdAt)}.
              </p>
            </>
          )}
          {c.status === 'closed' && <ClosedSummary c={c} day={day} />}
        </div>

        {(primary || note || waButton || overflow.length > 0) && (
          <div className="rh-actions">
            {primary}
            {(waButton || overflow.length > 0) && (
              <div className="rh-more">
                {waButton}
                <OverflowMenu items={overflow} label="Aksi lain" />
              </div>
            )}
            {note && <p className="small muted rh-note">{note}</p>}
          </div>
        )}
      </header>

      <div className="grid">
        <Schedule c={c} me={me} late={late} />
        <Members c={c} creators={creators} pure={pure} badges={badges.data} myUid={user?.uid} />

        <ObligationMatrix c={c} />
      </div>

      <JoinDialog open={dialog === 'join'} onClose={() => setDialog(null)} c={c} onDone={done} />
      {wa && (
        <WhatsAppNotice
          open={dialog === 'whatsapp'} onClose={() => setDialog(null)} url={wa}
          onAck={() => { writeAck(c.id); setAcked(true); setDialog(null) }}
        />
      )}
    </>
  )
}

function ClosedSummary({ c, day }: { c: Cohort; day: number | null }) {
  const n = { good: 0, owing: 0, settled: 0 }
  for (const m of c.members) if (m.standing) n[m.standing]++
  return (
    <>
      <p className="rh-count num"><b>Selesai</b>{day != null && <small> pada Hari {day}</small>}</p>
      <p className="rh-sub num">{fmtDate(c.day0At)} – {fmtDate(c.closedAt)}</p>
      <p className="standing-sum num">
        <span><b>{n.good}</b> baik</span>
        <span><b>{n.owing}</b> berutang</span>
        {n.settled > 0 && <span><b>{n.settled}</b> lunas</span>}
      </p>
    </>
  )
}

// ---------- schedule: the cohort's milestones, today's position marked by glyph + text ----------

type StepState = 'past' | 'today' | 'next' | 'later'
interface Row { key: string; day: number; at: number | null; title: string; detail: string; state: StepState }

function Schedule({ c, me, late }: { c: Cohort; me: CohortMember | undefined; late: boolean }) {
  const now = Date.now()
  const base = late ? me!.assignedAt : c.day0At
  const current = c.status === 'active' ? (late ? ownDay(me!.assignedAt, now) : cohortDay(c, now)) : null

  const rows = useMemo<Row[]>(() => {
    let steps = schedule(base)
    if (late) {
      // A late pure tester's own milestones; the close stays on the cohort's clock (in the note below).
      steps = steps.filter((s) => s.day !== CLOSE_DAY).map((s) => s.day === LAST_JOIN_DAY ? { ...s, detail: 'Check-in “Sudah buka app” dan feedback terkirim.' } : s)
    }
    if (c.status === 'closed' && c.closedAt != null) {
      // Show the real close, which may be before Day 21.
      const d = cohortDay(c) ?? CLOSE_DAY
      steps = steps.filter((s) => s.day !== CLOSE_DAY && s.day <= d).concat({ day: d, at: c.closedAt, title: 'Cohort ditutup', detail: 'Status tiap anggota ditetapkan: Baik atau Berutang.' })
    }
    let nextSet = false
    return steps.map((s) => {
      let state: StepState = 'later'
      if (c.status === 'closed') state = 'past'
      else if (current != null) {
        if (s.day < current) state = 'past'
        else if (s.day === current) state = 'today'
        else if (!nextSet) { state = 'next'; nextSet = true }
      } else if (!nextSet) { state = 'next'; nextSet = true }
      return { key: `${s.day}-${s.title}`, ...s, state }
    })
  }, [base, late, c, current])

  // "Hari ini" marker between milestones when today has none of its own.
  const markerAt = current != null && !rows.some((r) => r.state === 'today')
    ? (() => { const i = rows.findIndex((r) => r.day > current); return i === -1 ? rows.length : i })()
    : -1

  return (
    <section className="panel span-5 sched-panel" aria-labelledby="sched-h">
      <header>
        <h2 id="sched-h">{late ? 'Jadwal Anda' : 'Jadwal'}</h2>
        {current != null && <span className="meta num">Hari ini: Hari {current}</span>}
      </header>
      {c.status === 'forming' && <p className="small muted sched-note">Tanggal muncul setelah admin memulai cohort (Hari 0).</p>}
      {late && (
        <p className="small muted sched-note num">
          Tenggat Anda dihitung dari saat Anda bergabung ({fmtDateTime(me!.assignedAt)}). Cohort tetap ditutup paling lambat Hari {CLOSE_DAY} cohort, {fmtDate(c.day0At! + CLOSE_DAY * DAY)}.
        </p>
      )}
      <ol className="sched">
        {rows.map((r, i) => (
          <ScheduleItem key={r.key} r={r} marker={i === markerAt ? current : null} />
        ))}
        {markerAt === rows.length && current != null && <TodayMarker day={current} />}
      </ol>
    </section>
  )
}

function ScheduleItem({ r, marker }: { r: Row; marker: number | null }) {
  return (
    <>
      {marker != null && <TodayMarker day={marker} />}
      <li className={`sched-row ${r.state}`} aria-current={r.state === 'today' ? 'date' : undefined}>
        <span className="sched-day num">Hari {r.day}</span>
        <span className="sched-body">
          <span className="sched-head">
            <span className="sched-title">{r.title}</span>
            <StepState state={r.state} />
          </span>
          <span className="sched-detail">{r.detail}</span>
          {r.at != null && <time className="sched-at num" dateTime={new Date(r.at).toISOString()} title={fmtDateTime(r.at)}>{dueFmt.format(r.at)} WIB</time>}
        </span>
      </li>
    </>
  )
}

/** Position in the schedule, in glyph + text (never the row colour alone). */
function StepState({ state }: { state: StepState }) {
  if (state === 'today') return <Chip glyph="●">Hari ini</Chip>
  if (state === 'next') return <Chip glyph="→">Berikutnya</Chip>
  if (state === 'past') return <span className="sched-done"><span aria-hidden="true">· </span>Lewat</span>
  return null
}

function TodayMarker({ day }: { day: number }) {
  return (
    <li className="sched-row today marker" aria-current="date">
      <span className="sched-day num">Hari {day}</span>
      <span className="sched-body">
        <span className="sched-head"><span className="sched-title">{longDay.format(Date.now())}</span><StepState state="today" /></span>
        <span className="sched-detail">Belum ada tenggat hari ini.</span>
      </span>
    </li>
  )
}

// ---------- members: creators with their app, pure testers separately ----------

function Members({ c, creators, pure, badges, myUid }: {
  c: Cohort; creators: CohortMember[]; pure: CohortMember[]; badges: Map<string, BadgeTier>; myUid?: string
}) {
  return (
    <section className="panel span-7" aria-labelledby="members-h">
      <header>
        <h2 id="members-h">Anggota</h2>
        <span className="meta num">{c.members.length} orang</span>
      </header>

      <h3 className="member-group num">Kreator dan aplikasinya · {creators.length}</h3>
      {creators.length === 0 ? (
        <Empty title="Belum ada kreator.">
          <p>Admin menambahkan kreator beserta aplikasinya. Cohort butuh minimal {MIN_APPS} aplikasi untuk mulai.</p>
        </Empty>
      ) : (
        <ul className="member-list">{creators.map((m) => <MemberRow key={m.userId} m={m} c={c} tier={badges.get(m.userId)} mine={m.userId === myUid} />)}</ul>
      )}

      <h3 className="member-group num">Tester murni · {pure.length}</h3>
      {pure.length === 0 ? (
        <p className="small muted member-none">
          {joinOpen(c) ? 'Belum ada. Tester murni tidak membawa aplikasi, hanya menguji, dan mendapat hingga 14 aplikasi.' : 'Tidak ada tester murni di cohort ini.'}
        </p>
      ) : (
        <ul className="member-list">{pure.map((m) => <MemberRow key={m.userId} m={m} c={c} tier={badges.get(m.userId)} mine={m.userId === myUid} />)}</ul>
      )}
    </section>
  )
}

function MemberRow({ m, c, tier, mine }: { m: CohortMember; c: Cohort; tier?: BadgeTier; mine: boolean }) {
  const name = m.displayName || 'Anggota'
  const lateDay = isLate(c, m) ? Math.floor((m.assignedAt! - c.day0At!) / DAY) : null
  return (
    <li className={`member-row ${mine ? 'mine' : ''}`}>
      <Avatar name={name} photo={m.photoURL} />
      <span className="member-main">
        <span className="name-with-badge">
          <Link className="member-name" to={`/u/${m.userId}`}>{name}</Link>
          {mine && <span className="you">Anda</span>}
          <Badge tier={tier} size="sm" />
        </span>
        <span className="member-sub">
          {m.appId
            ? m.appDeleted
              ? <span>Aplikasi sudah dihapus</span>
              : <Link className="member-app" to={`/apps/${m.appId}`}>{m.appName}</Link>
            : lateDay != null ? <span className="num">Gabung pada Hari {lateDay}</span> : <span>Tanpa aplikasi</span>}
        </span>
      </span>
      {m.standing && <StandingChip standing={m.standing} />}
    </li>
  )
}

// ---------- B5: obligation matrix (FR-38, cohort_assignment_status view) ----------

const CELL_GLYPH: Record<CellState, string> = {
  not_joined: '○', left: '×', opted_in: '◑', used: '◕',
  feedback_sent: '✓', feedback_verified: '✓✓', reassigned: '→',
}
const CELL_LABEL: Record<CellState, string> = {
  not_joined: 'Belum opt-in', left: 'Keluar', opted_in: 'Opt-in', used: 'Memakai app',
  feedback_sent: 'Feedback terkirim', feedback_verified: 'Feedback terverifikasi', reassigned: 'Dipindah',
}

function ObligationMatrix({ c }: { c: Cohort }) {
  const apps = c.members.filter((m) => m.appId != null)
  const shouldLoad = c.status !== 'forming' && apps.length > 0
  const status = useAssignmentStatus(shouldLoad ? c.id : undefined)

  const cells = useMemo<Map<string, Map<string, CellState>>>(() => {
    const m = new Map<string, Map<string, CellState>>()
    for (const s of status.data) {
      const inner = m.get(s.appId) ?? new Map<string, CellState>()
      inner.set(s.testerId, s.cell)
      m.set(s.appId, inner)
    }
    return m
  }, [status.data])

  const behind = useMemo(() => new Set(status.data.filter((s) => s.isBehind).map((s) => s.testerId)), [status.data])

  if (!shouldLoad) return null
  if (status.loading && status.data.length === 0) return null
  if (status.error) return (
    <section className="panel span-12" aria-label="Matriks penugasan">
      <p className="meta cabai">Matriks penugasan gagal dimuat. <button type="button" className="link" onClick={status.retry}>Coba lagi</button></p>
    </section>
  )

  return (
    <section className="panel span-12 matrix-panel" aria-labelledby="matrix-h">
      <header>
        <h2 id="matrix-h">Matriks penugasan</h2>
        {status.loading && <span className="meta">Memuat…</span>}
      </header>
      <div className="matrix-wrap" tabIndex={0} role="region" aria-label="Matriks penugasan, scroll horizontal">
        <table className="matrix-table num">
          <thead>
            <tr>
              <th className="matrix-th-name" scope="col">Tester</th>
              {apps.map((app) => (
                <th key={app.appId} scope="col">
                  <span className="matrix-app-name" title={app.appName ?? ''}>{app.appName ?? 'Aplikasi'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.members.map((m) => (
              <tr key={m.userId} className={behind.has(m.userId) ? 'behind-row' : ''}>
                <td className="matrix-td-name">
                  <Link to={`/u/${m.userId}`}>{m.displayName || 'Anggota'}</Link>
                  {behind.has(m.userId) && <span className="sr-only"> (tertinggal)</span>}
                </td>
                {apps.map((app) => {
                  if (app.userId === m.userId) {
                    return <td key={app.appId} className="matrix-cell own"><span aria-label="Aplikasi sendiri">—</span></td>
                  }
                  const cell = cells.get(app.appId!)?.get(m.userId)
                  if (!cell) {
                    return <td key={app.appId} className="matrix-cell unassigned"><span aria-label="Tidak ditugaskan"></span></td>
                  }
                  return <td key={app.appId} className={`matrix-cell ${cell}`} title={CELL_LABEL[cell]}><span aria-label={CELL_LABEL[cell]}>{CELL_GLYPH[cell]}</span></td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="matrix-legend small muted">
        ○ Belum · ◑ Opt-in · ◕ Memakai · ✓ Feedback · ✓✓ Terverifikasi · × Keluar · → Dipindah · — Aplikasi sendiri
      </p>
    </section>
  )
}

// ---------- dialogs ----------

function useBusy() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    if (busy) return
    setBusy(true); setErr(null)
    try { await fn(); done() } catch (e) { setErr(errorText(e)) } finally { setBusy(false) }
  }
  return { busy, err, run, reset: () => setErr(null) }
}

/** PRD §5.8 step 2: say what joining commits you to before you confirm. */
function JoinDialog({ open, onClose, c, onDone }: { open: boolean; onClose: () => void; c: Cohort; onDone: () => void }) {
  const toast = useToast()
  const { busy, err, run, reset } = useBusy()
  const active = c.status === 'active'
  const close = () => { reset(); onClose() }
  // showModal() focuses the community link first, which scrolls a phone-height dialog: start at the title instead.
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => title.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])
  const confirm = () => run(() => joinCohortAsTester(c.id), () => {
    toast(active ? `Anda bergabung di ${c.name}. Aplikasi yang ditugaskan sudah dibagikan; opt-in dalam 48 jam.` : `Anda bergabung di ${c.name}. Tugas dibagikan saat cohort dimulai.`)
    onClose(); onDone()
  })
  return (
    <Dialog open={open} onClose={close} label={`Gabung sebagai tester di ${c.name}`}>
      <div className="sheet-body">
        <h2 ref={title} tabIndex={-1}>Gabung sebagai tester di {c.name}?</h2>
        <p className="lede">
          {active
            ? 'Cohort sudah berjalan. Anda langsung mendapat hingga 14 aplikasi, dan semua tenggat Anda dihitung dari saat ini.'
            : 'Anda mendapat hingga 14 aplikasi saat admin memulai cohort (Hari 0).'}
        </p>
        <ol className="duties">
          <li><b>Opt-in ke semua aplikasi yang ditugaskan dalam 48 jam.</b> Lewat dari itu, Anda tercatat tertinggal.</li>
          <li><b>Check-in di setiap tahap:</b> “Sudah buka app” sampai hari ke-7, “Masih opt-in” di hari ke-13, dan “Sudah update” dalam 3 hari setiap ada build baru.</li>
          <li><b>Kirim feedback di Google Play</b> sampai hari ke-7, dengan kata-kata Anda sendiri.</li>
        </ol>
        <p className="small muted">
          Opt-in hanya terhitung jika Anda sudah gabung <a className="link" href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer">{COMMUNITY_GROUP}<span className="sr-only"> (tab baru)</span></a>.
          Jika kewajiban belum selesai saat cohort ditutup, Anda ditandai Berutang dan tidak bisa ikut cohort berikutnya sampai admin menandai Lunas.
          {!active && ' Selama cohort belum dimulai, Anda masih bisa keluar.'}
        </p>
        {err && <ErrorBox text={err} />}
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={close}>Batal</button>
        <button type="button" className="btn primary" onClick={confirm} aria-busy={busy || undefined}>{busy ? 'Menyimpan…' : 'Gabung sebagai tester'}</button>
      </div>
    </Dialog>
  )
}

/** FR-51: before the link is shown the first time. Acknowledged once per cohort, per browser. */
function WhatsAppNotice({ open, onClose, url, onAck }: { open: boolean; onClose: () => void; url: string; onAck: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} label="Sebelum gabung grup WhatsApp">
      <div className="sheet-body">
        <h2>Sebelum gabung grup WhatsApp</h2>
        <ul className="duties plain">
          <li><b>Nomor HP Anda terlihat</b> oleh semua anggota grup, dan nomor mereka terlihat oleh Anda.</li>
          <li><b>Gabung grup ini opsional.</b> Grup untuk koordinasi; status tetap dilaporkan di TesBareng.</li>
          <li><b>Google Group tetap wajib.</b> Play Console hanya menghitung tester dari {COMMUNITY_GROUP}.</li>
        </ul>
      </div>
      <div className="sheet-foot">
        <button type="button" className="btn" onClick={onClose}>Nanti saja</button>
        <a className="btn primary" href={url} target="_blank" rel="noreferrer" onClick={onAck}><IconExternal />Mengerti, buka grup<span className="sr-only"> (tab baru)</span></a>
      </div>
    </Dialog>
  )
}

// ---------- WhatsApp acknowledgement (localStorage may be blocked: private mode, cleared data) ----------
const ackKey = (id: string) => `tb:wa-ack:${id}`
function readAck(id: string) {
  try { return localStorage.getItem(ackKey(id)) === '1' } catch { return false }
}
function writeAck(id: string) {
  try { localStorage.setItem(ackKey(id), '1') } catch { /* the notice simply shows again next time */ }
}

// ---------- states ----------

function CohortNotFound() {
  return (
    <div className="state-page">
      <h1 className="page-title">Cohort tidak ditemukan</h1>
      <p>Tautannya mungkin salah ketik, atau cohort ini sudah dihapus admin.</p>
      <Link className="btn primary" to="/cohorts">Lihat semua cohort</Link>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat cohort">
      <Skel w={90} h={20} />
      <div className="record-head skel-head" style={{ marginTop: 'var(--s-2)' }}>
        <div className="rh-main"><Skel w={240} h={32} /><Skel w={200} h={22} /></div>
        <div className="rh-progress"><Skel w={140} h={28} /><Skel w="100%" h={16} /></div>
        <div className="rh-actions"><Skel w={220} h={44} /></div>
      </div>
      <div className="grid">
        <div className="panel span-5">{[0, 1, 2, 3].map((i) => <div className="row-line" key={i}><Skel w={56} /><span className="grow"><Skel w={180} /></span></div>)}</div>
        <div className="panel span-7">{[0, 1, 2, 3, 4].map((i) => <div className="row-line" key={i}><Skel w={32} h={32} /><span className="grow"><Skel w={200} /></span></div>)}</div>
      </div>
    </div>
  )
}
