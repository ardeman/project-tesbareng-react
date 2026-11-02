import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePageMeta } from '../lib/pageMeta'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { supabase } from '../lib/supabase'
import './landing.css'

/* Story surface: the landing page at `/` (ADR-001 §2–§4, ADR-008 option A, ADR-010).
   The cohort ring is the only loud moment. Its scrub is a small rAF loop instead of GSAP,
   which keeps this chunk far below the 80 KB budget. */

const TITLE = 'TesBareng: 12 tester, 14 hari, dikerjakan bareng'
const DESCRIPTION =
  'Komunitas creator Android Indonesia yang saling ngetes app: 12 tester opt-in selama 14 hari untuk closed test Google Play, dibagi rata lewat cohort.'

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Fade-and-rise entrances for `.rv` blocks below the fold. The hero is never animated. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el || reduceMotion() || !('IntersectionObserver' in window)) return
    el.classList.add('fx')
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    )
    el.querySelectorAll('.rv').forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [root])
}

/* ---------------------------------------------------------------------------
   Cohort ring geometry: an example cohort of 15 apps (full mesh, PRD FR-32:
   13–16 apps means everyone tests every other app, k = 14) plus 3 pure testers
   assigned 14 apps each, fewest-testers first (FR-33). Every number shown next to
   the ring is computed from this, so it is true by construction.
   --------------------------------------------------------------------------- */
const C = 300
const N_APPS = 15
const N_PURE = 3
const K = 14
type Pt = { x: number; y: number }
type Tie = { o: number; t: number; d: string; pure: boolean }

const onCircle = (i: number, n: number, r: number): Pt => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}
const CREATORS = Array.from({ length: N_APPS }, (_, i) => onCircle(i, N_APPS, 252))
const PURES = Array.from({ length: N_PURE }, (_, i) => onCircle(i, N_PURE, 70))
const NODES = [...CREATORS, ...PURES]
const f = (n: number) => n.toFixed(1)

function curve(a: Pt, b: Pt, bow: number) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  // Pull toward the centre, and bow sideways so A→B and B→A stay two visible lines.
  const cx = mx + (C - mx) * 0.3 + (-dy / len) * bow * len
  const cy = my + (C - my) * 0.3 + (dx / len) * bow * len
  return `M${f(a.x)} ${f(a.y)}Q${f(cx)} ${f(cy)} ${f(b.x)} ${f(b.y)}`
}

const RING = (() => {
  const ties: Tie[] = []
  const load = new Array<number>(N_APPS).fill(0)
  for (let o = 0; o < N_APPS; o++) {
    for (let d = 1; d < N_APPS; d++) {
      const t = (o + d) % N_APPS
      ties.push({ o, t, d: curve(CREATORS[o], CREATORS[t], 0.07), pure: false })
      load[t]++
    }
  }
  for (let p = 0; p < N_PURE; p++) {
    const order = Array.from({ length: N_APPS }, (_, i) => i).sort(
      (a, b) => load[a] - load[b] || ((a - p * 5 + N_APPS) % N_APPS) - ((b - p * 5 + N_APPS) % N_APPS),
    )
    for (const t of order.slice(0, Math.min(K, N_APPS))) {
      ties.push({ o: N_APPS + p, t, d: curve(PURES[p], CREATORS[t], 0), pure: true })
      load[t]++
    }
  }
  const byOwner = NODES.map((_, o) => ties.filter((x) => x.o === o).map((x) => x.t))
  return { ties, byOwner, total: ties.length, min: Math.min(...load), max: Math.max(...load) }
})()

const RING_DESC =
  `Contoh cohort berisi ${N_APPS} app. ${N_APPS} creator, masing-masing membawa satu app, berbaris di lingkar luar sebagai kotak, ` +
  `dan ${N_PURE} tester murni tanpa app ada di tengah sebagai lingkaran. Karena jumlah app antara 13 dan 16, setiap creator ngetes semua app lain, ` +
  `yaitu ${N_APPS - 1} app. Setiap tester murni ngetes ${K} app, dimulai dari app yang testernya paling sedikit. ` +
  `Totalnya ${RING.total} tugas, dan setiap app dites ${RING.min} sampai ${RING.max} orang.`

/** True when the device should get the scroll-scrubbed ring instead of the finished frame. */
function canScrub() {
  if (reduceMotion()) return false
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return false
  if ((navigator.hardwareConcurrency ?? 4) <= 2) return false
  return true
}

const Ring = memo(function Ring() {
  const secRef = useRef<HTMLElement>(null)
  const figRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const drawnRef = useRef<HTMLSpanElement>(null)
  const minRef = useRef<HTMLSpanElement>(null)
  const finalRef = useRef<HTMLParagraphElement>(null)
  // Client-only SPA, so the device check can run on first render (no static frame flash).
  const [scrub] = useState(canScrub)

  // Strokes are specified in screen pixels: 1 user unit = 600 / rendered width.
  useEffect(() => {
    const fig = figRef.current, svg = svgRef.current, copy = copyRef.current
    if (!fig || !svg || !('ResizeObserver' in window)) return
    // Also hands the copy block's height to CSS, so the pinned ring on narrow screens can take the rest of the viewport.
    const ro = new ResizeObserver(() => {
      const w = svg.getBoundingClientRect().width
      if (w > 0) fig.style.setProperty('--u', (600 / w).toFixed(3))
      if (copy) fig.style.setProperty('--copy-h', `${copy.offsetHeight}px`)
    })
    ro.observe(svg)
    if (copy) ro.observe(copy)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const sec = secRef.current, svg = svgRef.current
    if (!scrub || !sec || !svg) return
    const M = NODES.length
    const tieEls: SVGPathElement[][] = NODES.map(() => [])
    svg.querySelectorAll<SVGPathElement>('.tie').forEach((p) => tieEls[Number(p.dataset.o)].push(p))
    const nodeEls = Array.from(svg.querySelectorAll<SVGGElement>('.node'))
    const prev = new Array<number>(M).fill(-1)
    const drawnEl = drawnRef.current, minEl = minRef.current, finalEl = finalRef.current
    let cur = 0, target = 0, raf = 0, last = 0, lastDrawn = -1, lastMin = -1

    const render = (t: number) => {
      const load = new Array<number>(N_APPS).fill(0)
      let drawn = 0
      for (let o = 0; o < M; o++) {
        const w = Math.min(1, Math.max(0, t * M - o))
        const list = tieEls[o]
        drawn += Math.floor(w * list.length + 1e-6)
        if (w >= 1) for (const a of RING.byOwner[o]) load[a]++
        if (w === prev[o]) continue
        prev[o] = w
        const live = w > 0 && w < 1
        for (const p of list) {
          if (o < N_APPS) p.style.strokeDashoffset = (1 - w).toFixed(3)
          else p.style.opacity = w.toFixed(3)
          p.classList.toggle('drawing', live)
        }
        nodeEls[o].classList.toggle('act', live)
        nodeEls[o].classList.toggle('done', w >= 1)
      }
      const min = Math.min(...load)
      if (drawn !== lastDrawn && drawnEl) { drawnEl.textContent = String(drawn); lastDrawn = drawn }
      if (min !== lastMin && minEl) { minEl.textContent = String(min); lastMin = min }
      finalEl?.classList.toggle('show', t >= 0.999)
    }
    const measure = () => {
      const r = sec.getBoundingClientRect()
      const span = sec.offsetHeight - window.innerHeight
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 1
      target = Math.min(1, Math.max(0, (p - 0.05) / 0.82))
    }
    // Scrub ≈ 0.5 s: ease the drawn state toward the scroll position (ADR-001 §3).
    const tick = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16
      last = now
      cur += (target - cur) * (1 - Math.exp(-dt / 140))
      if (Math.abs(target - cur) < 0.0008) cur = target
      render(cur)
      raf = cur === target ? 0 : requestAnimationFrame(tick)
      if (!raf) last = 0
    }
    const onScroll = () => { measure(); if (!raf) raf = requestAnimationFrame(tick) }

    sec.classList.add('is-scrub')
    measure()
    cur = target
    render(cur)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
      sec.classList.remove('is-scrub')
    }
  }, [scrub])

  return (
    <section className="ring-scroll" ref={secRef} id="cohort-ring" aria-labelledby="ring-h">
      <div className="lp-wrap ring-stage">
        <div className="ring-copy" ref={copyRef}>
          <p className="lp-label"><b>01</b>Cohort</p>
          <h2 id="ring-h">Tidak ada yang cuma minta dites.</h2>
          <p className="lp-lede ring-lede">
            Contoh cohort berisi {N_APPS} app. Dengan 13 sampai 16 app, setiap creator ngetes semua app lain. Tester murni tanpa app ikut ngetes {K} app,
            dimulai dari app yang testernya paling sedikit.
          </p>
          <div className="ring-status">
          <dl className="counters">
            <div><dt>Tugas terbagi</dt><dd><span ref={drawnRef}>{RING.total}</span><span className="dim"> / {RING.total}</span></dd></div>
            <div><dt>Tester paling sedikit di satu app</dt><dd><span ref={minRef}>{RING.min}</span><span className="dim"> orang</span></dd></div>
          </dl>
          <p className="ring-final" ref={finalRef}>{N_APPS} app. Setiap app dites {N_APPS - 1} creator lain. Semua ikut ngetes.</p>
          </div>
        </div>
        <figure className="ring-fig" ref={figRef}>
          <svg ref={svgRef} viewBox="0 0 600 600" width="600" height="600" role="img" aria-labelledby="ring-t ring-d">
            <title id="ring-t">Cincin cohort</title>
            <desc id="ring-d">{RING_DESC}</desc>
            <g className="ties">
              {RING.ties.map((x, i) => (
                <path key={i} className={x.pure ? 'tie tie--p' : 'tie tie--c'} data-o={x.o} pathLength={1} d={x.d} />
              ))}
            </g>
            <g className="nodes">
              {NODES.map((p, i) => (
                <g key={i} className={`node done ${i < N_APPS ? 'node--c' : 'node--p'}`} transform={`translate(${f(p.x)} ${f(p.y)})`}>
                  <g className="nstamp">
                    {i < N_APPS ? (
                      <><rect className="nshadow" x={-13} y={-13} width={34} height={34} /><rect className="nbody" x={-17} y={-17} width={34} height={34} /></>
                    ) : (
                      <><circle className="nshadow" cx={4} cy={4} r={18} /><circle className="nbody" r={18} /></>
                    )}
                    <path className="ncheck" d="M-7 0.5l4.5 4.5 9-9.5" />
                  </g>
                </g>
              ))}
            </g>
          </svg>
          <figcaption className="ring-legend">
            <span><i className="lg-sq" aria-hidden="true" />Creator, membawa app</span>
            <span><i className="lg-ci" aria-hidden="true" />Tester murni</span>
            <span><i className="lg-dash" aria-hidden="true" />Tugas tester murni</span>
            <span><i className="lg-ok" aria-hidden="true">✓</i>Semua {K} tugasnya terbagi</span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
})

/* ---------------------------------------------------------------------------
   Small pieces
   --------------------------------------------------------------------------- */
function Segments({ n, on, label }: { n: number; on: number; label: string }) {
  return (
    <div className="seg" style={{ ['--n' as string]: n }} role="img" aria-label={label}>
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < on ? 'on' : undefined} />)}
    </div>
  )
}

function CopyEmail() {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const id = setTimeout(() => setState('idle'), 2400)
    return () => clearTimeout(id)
  }, [state])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMUNITY_GROUP)
      setState('ok')
    } catch {
      setState('fail')
    }
  }
  return (
    <div className="copy-row">
      <button type="button" className={`lp-btn lp-btn--sm ${state === 'ok' ? 'is-ok' : ''}`} onClick={copy}>
        {state === 'ok' ? '✓ Tersalin' : 'Salin email grup'}
      </button>
      <span className="copy-status" role="status" aria-live="polite">
        {state === 'fail' ? 'Tidak bisa menyalin otomatis. Pilih teks email di atas, lalu salin.' : state === 'ok' ? 'Email grup tersalin.' : ''}
      </span>
    </div>
  )
}

type Stats = { apps: number; members: number; ready: number }

/** Live counts from the public views (ADR-004). Hidden when the request fails or everything is zero. */
function useLiveStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    let alive = true
    const head = { count: 'exact' as const, head: true }
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    Promise.race([
      Promise.all([
        supabase.from('apps').select('id', head).eq('deleted', false),
        supabase.from('profiles').select('id', head),
        supabase.from('app_stats').select('app_id', head).gte('eligible_count', 12),
      ]),
      timeout,
    ])
      .then(([a, m, r]) => {
        if (!alive || a.error || m.error || r.error) return
        setStats({ apps: a.count ?? 0, members: m.count ?? 0, ready: r.count ?? 0 })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return stats
}

const nf = new Intl.NumberFormat('id-ID')

function LiveStats() {
  const s = useLiveStats()
  if (!s) return null
  const items = [
    { n: s.apps, l: 'app terdaftar' },
    { n: s.members, l: 'anggota' },
    { n: s.ready, l: 'app siap ajukan production' },
  ].filter((x) => x.n > 0)
  if (!items.length) return null
  return (
    <div className="live">
      <p className="lp-label lp-label--plain">Di TesBareng sekarang</p>
      <dl className="live-row">
        {items.map((x) => (
          <div key={x.l}><dt>{x.l}</dt><dd>{nf.format(x.n)}</dd></div>
        ))}
      </dl>
    </div>
  )
}

type CellKind = 'ok2' | 'ok' | 'wait' | 'late' | 'own'
const CELL: Record<CellKind, { glyph: string; short: string; label: string }> = {
  ok2: { glyph: '✓✓', short: 'Verified', label: 'Feedback diverifikasi creator' },
  ok: { glyph: '✓', short: 'Aktif', label: 'Sudah opt-in dan aktif' },
  wait: { glyph: '—', short: 'Belum', label: 'Belum, masih dalam batas waktu' },
  late: { glyph: '!', short: 'Belum tes', label: 'Lewat batas opt-in (Belum tes)' },
  own: { glyph: '·', short: 'Sendiri', label: 'App sendiri, tidak ditugaskan' },
}
const MATRIX_APPS = ['App A', 'App B', 'App C', 'App D', 'App E']
const MATRIX_ROWS: { who: string; me?: boolean; cells: CellKind[] }[] = [
  { who: 'Anggota 1', cells: ['own', 'ok2', 'ok2', 'ok', 'ok'] },
  { who: 'Kamu', me: true, cells: ['ok', 'own', 'ok', 'ok2', 'wait'] },
  { who: 'Anggota 3', cells: ['ok2', 'ok2', 'own', 'ok2', 'ok'] },
  { who: 'Anggota 4', cells: ['late', 'late', 'ok', 'own', 'late'] },
  { who: 'Anggota 5', cells: ['ok', 'ok', 'ok2', 'ok', 'own'] },
]
const FILTERS: CellKind[] = ['ok2', 'ok', 'wait', 'late']

function MatrixDemo() {
  const [filter, setFilter] = useState<CellKind | null>(null)
  return (
    <div className="matrix-wrap rv">
      <div className={`matrix ${filter ? 'filtering' : ''}`}>
        <div className="scroller" role="region" aria-label="Contoh matriks kewajiban cohort" tabIndex={0}>
          <table>
            <caption className="sr-only">Contoh matriks: baris adalah anggota, kolom adalah app yang ditugaskan</caption>
            <thead>
              <tr><th scope="col">Anggota</th>{MATRIX_APPS.map((a) => <th key={a} scope="col">{a}</th>)}</tr>
            </thead>
            <tbody>
              {MATRIX_ROWS.map((r) => (
                <tr key={r.who} className={r.me ? 'me' : undefined}>
                  <th scope="row">{r.who}</th>
                  {r.cells.map((c, i) => (
                    <td key={i}>
                      <span className={`cell cell--${c} ${filter === c ? 'match' : ''}`}>
                        <span aria-hidden="true">{CELL[c].glyph}</span>
                        <span className="cell-t" aria-hidden="true">{CELL[c].short}</span>
                        <span className="sr-only">{CELL[c].label}</span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="matrix-note"><span className="matrix-hint" aria-hidden="true">Geser tabel ke samping untuk melihat semua app. </span>Contoh. Nama anggota dan app di cohort sungguhan tampil di halaman cohort.</p>
      </div>
      <div className="legend">
        <p className="lp-label lp-label--plain">Ketuk status untuk menyorot</p>
        {FILTERS.map((k) => (
          <button key={k} type="button" className="lg-btn" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)}>
            <span className={`cell cell--${k}`} aria-hidden="true">{CELL[k].glyph}</span>
            <span>{CELL[k].label}</span>
          </button>
        ))}
        <p className="lg-row">
          <span className="cell cell--own" aria-hidden="true">{CELL.own.glyph}</span>
          <span>{CELL.own.label}</span>
        </p>
        <div className="privacy">
          <strong>Emailmu tetap rahasia</strong>
          <span className="masked">bu*****@gmail.com</span>
          <p>Di halaman mana pun, email hanya tampil disamarkan seperti ini, termasuk untuk creator. Alamat lengkap hanya dipakai untuk mengirim pengingat.</p>
        </div>
      </div>
    </div>
  )
}

const DAYS = [
  { d: 0, title: 'Opt-in dan install', text: 'Daftar app tugasmu muncul di Tugas saya. Buka link opt-in tiap app, jadi tester, lalu install. Batasnya 48 jam.', chip: 'c-langit', chipText: '✓ Opt-in' },
  { d: 2, title: 'Batas opt-in', text: 'Lewat 48 jam, yang belum opt-in tercatat Behind, dan app miliknya mendapat label Belum tes yang terlihat semua orang.', chip: 'c-cabai', chipText: '! Belum tes' },
  { d: 7, title: 'Sudah buka app', text: 'Pakai app-nya, centang Sudah buka app, lalu kirim feedback di Google Play dengan kata-katamu sendiri. Creator menandai Verified.', chip: 'c-pandan', chipText: '✓✓ Verified' },
  { d: 13, title: 'Masih opt-in', text: 'Centang sekali lagi. App dengan 12 tester yang sudah 14 hari siap diajukan ke production.', chip: 'c-langit', chipText: '✓ Masih opt-in' },
]
const RAIL: Record<number, string> = { 0: 'c-langit', 2: 'c-cabai', 7: 'c-pandan', 13: 'c-langit' }

const TIERS = [
  { name: 'Bronze', n: 3, cls: 't-bronze', note: 'app dites 14 hari' },
  { name: 'Silver', n: 7, cls: 't-silver', note: 'app dites 14 hari' },
  { name: 'Gold', n: 14, cls: 't-gold', note: 'satu cohort penuh sebagai tester murni' },
  { name: 'Platinum', n: 25, cls: 't-platinum', note: 'app dites 14 hari' },
]

const FAQ = [
  { q: 'Apakah TesBareng layanan resmi Google?', a: 'Bukan. TesBareng dibuat oleh komunitas creator Android Indonesia untuk saling membantu memenuhi syarat closed test Google Play.' },
  { q: 'Apakah TesBareng tersambung ke Play Console?', a: 'Tidak. Google tidak menyediakan data opt-in untuk aplikasi lain, jadi semua dicatat sendiri oleh anggota. Feedback yang ditandai Verified adalah bukti terkuat, karena creator mengeceknya langsung di Play Console.' },
  { q: 'Kenapa feedback harus dikirim di Google Play?', a: 'Feedback di Play masuk ke Play Console milik creator, lengkap dengan nama pengirimnya. TesBareng hanya mencatat bahwa kamu sudah mengirimnya. Tulis dengan kata-katamu sendiri: ulasan yang disalin dari banyak akun terlihat tidak asli.' },
  { q: 'Bagaimana kalau ada anggota yang tidak ikut ngetes?', a: 'Lewat 48 jam, app miliknya mendapat label Belum tes, dan admin bisa memindahkan slotnya ke anggota lain. Saat cohort ditutup, kewajiban yang belum selesai tercatat Owing. Dia tidak bisa ikut cohort berikutnya sampai admin menandainya Settled.' },
  { q: 'Wajib gabung grup WhatsApp cohort?', a: 'Tidak. Grup WhatsApp cohort opsional, dan anggota grup bisa melihat nomor HP satu sama lain. Status tetap dilaporkan di TesBareng, bukan di chat. Yang wajib hanya Google Group, karena Play Console membutuhkannya.' },
  { q: 'Siapa yang bisa melihat emailku?', a: 'Tidak ada. Di semua halaman, email tampil disamarkan, misalnya bu*****@gmail.com. Alamat lengkap hanya dipakai sistem untuk mengirim pengingat.' },
]

/* ---------------------------------------------------------------------------
   Page
   --------------------------------------------------------------------------- */
export function Landing() {
  usePageMeta(TITLE, DESCRIPTION)
  const root = useRef<HTMLDivElement>(null)
  useReveal(root)
  const { user, signIn } = useAuth()
  const [signInError, setSignInError] = useState(false)
  const startSignIn = () => { setSignInError(false); signIn().catch(() => setSignInError(true)) }

  return (
    <div className="lp surface-story" ref={root}>
      <a className="lp-skip" href="#isi">Langsung ke isi</a>

      <header className="lp-top">
        <div className="lp-wrap lp-top-row">
          <Link to="/" className="lp-brand" aria-label="TesBareng, beranda"><span className="lp-brand-box" aria-hidden="true" />TesBareng</Link>
          <nav className="lp-nav" aria-label="Utama">
            <a className="hide-s" href="#cara-kerja">Cara kerja</a>
            <a className="hide-s" href="#badge">Badge</a>
            <Link className="hide-s" to="/about">Aturan main</Link>
            <Link to="/apps">Daftar app</Link>
            {user ? (
              <Link className="lp-btn lp-btn--sm" to="/me">Tugas saya</Link>
            ) : (
              <button type="button" className="lp-btn lp-btn--sm" onClick={startSignIn}>Masuk</button>
            )}
          </nav>
        </div>
        {signInError && (
          <p className="lp-wrap lp-alert" role="alert">Halaman masuk Google tidak bisa dibuka. Periksa koneksi, lalu coba lagi.</p>
        )}
      </header>

      <main id="isi">
        <section className="lp-wrap hero" aria-labelledby="hero-h">
          <p className="lp-label"><b>00</b>Komunitas creator Android Indonesia</p>
          <h1 id="hero-h"><span>12 tester.</span><span>14 hari.</span><span>Bareng.</span></h1>
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="lp-lede">
                Itu syarat closed test Google Play untuk akun developer pribadi baru. Di TesBareng, creator saling ngetes:
                kamu tes app mereka, mereka tes app kamu, dan semua orang bisa melihat siapa sudah ngetes siapa.
              </p>
              <div className="cta-row">
                <a className="lp-btn lp-btn--primary" href="#gabung">Cara gabung</a>
                <Link className="lp-btn" to="/apps">Lihat daftar app</Link>
              </div>
            </div>

            <section className="sheet" aria-labelledby="syarat-h">
              <div className="sheet-head">
                <h2 id="syarat-h">Syarat closed test Google Play</h2>
              </div>
              <div className="sheet-body">
                <div className="meter">
                  <div className="meter-top"><span>Tester tetap opt-in</span><span className="num">12 / 12</span></div>
                  <Segments n={12} on={12} label="12 dari 12 tester" />
                </div>
                <div className="meter">
                  <div className="meter-top"><span>Hari berturut-turut</span><span className="num">14 / 14</span></div>
                  <Segments n={14} on={14} label="14 dari 14 hari" />
                </div>
                <ul className="checks">
                  <li><span className="tick" aria-hidden="true">✓</span>Tester mengirim feedback di Google Play</li>
                  <li><span className="tick" aria-hidden="true">✓</span>Creator membalas feedback di Play Console</li>
                  <li><span className="tick" aria-hidden="true">✓</span><span>2–3 build baru selama tes <small>kebiasaan komunitas, bukan aturan resmi Google</small></span></li>
                </ul>
              </div>
              <div className="sheet-foot">
                <span className="chip c-pandan">✓ Siap ajukan production</span>
                <p>Tester yang keluar sebelum 14 hari mulai lagi dari nol.</p>
              </div>
            </section>
          </div>
        </section>

        <Ring />

        <section className="lp-sec" id="cara-kerja" aria-labelledby="cara-h">
          <div className="lp-wrap">
            <div className="sec-head">
              <div><p className="lp-label"><b>02</b>Cara kerja</p><h2 id="cara-h">Satu cohort, empat titik cek.</h2></div>
              <p className="lp-lede">Tidak ada absen harian. Cukup centang di empat titik ini. Kalau ada yang terlewat, satu email ringkasan datang jam 19.00 WIB.</p>
            </div>
            <div className="rail rv" aria-hidden="true">
              <div className="rail-head"><span>Hari</span><span>Tutup paling lambat hari 21</span></div>
              <div className="rail-cells">
                {Array.from({ length: 15 }, (_, d) => (
                  <i key={d} className={d === 14 ? 'fin' : RAIL[d] ? `cp ${RAIL[d]}` : 'plain'}>{d}</i>
                ))}
                <i className="close">21</i>
              </div>
            </div>
            <ol className="days rv">
              {DAYS.map((x) => (
                <li className="day" key={x.d}>
                  <p className="day-n"><small>Hari ke</small>{x.d}</p>
                  <h3>{x.title}</h3>
                  <p>{x.text}</p>
                  <span className={`chip ${x.chip}`}>{x.chipText}</span>
                </li>
              ))}
            </ol>
            <p className="build-strip rv"><span className="chip c-putih">Build baru</span><span>Setiap kali creator mencatat build baru: update app-nya, coba lagi, lalu centang Sudah update dalam 3 hari.</span></p>
          </div>
        </section>

        <section className="lp-sec" id="transparansi" aria-labelledby="lembar-h">
          <div className="lp-wrap">
            <div className="sec-head">
              <div><p className="lp-label"><b>03</b>Transparansi</p><h2 id="lembar-h">Semua lihat lembar yang sama.</h2></div>
              <p className="lp-lede">Siapa sudah ngetes siapa terlihat di matriks cohort. Tidak perlu menagih satu per satu di grup.</p>
            </div>
            <MatrixDemo />
          </div>
        </section>

        <section className="lp-sec" id="badge" aria-labelledby="badge-h">
          <div className="lp-wrap">
            <div className="sec-head">
              <div><p className="lp-label"><b>04</b>Tester murni</p><h2 id="badge-h">Belum punya app? Ikut ngetes saja.</h2></div>
              <p className="lp-lede">Gabung cohort sampai hari ke-7. Setiap app yang kamu temani sampai 14 hari dihitung untuk badge di profilmu.</p>
            </div>
            <ul className="tiers rv">
              {TIERS.map((t) => (
                <li className="tier" key={t.name}>
                  <span className={`pill ${t.cls}`}>{t.name}</span>
                  <b className="num">{t.n}</b>
                  <small>{t.note}</small>
                </li>
              ))}
            </ul>
            <p className="tier-note rv">Badge dihitung dari data, tidak bisa diklaim. Keluar sebelum 14 hari, dikeluarkan creator, atau app yang dihapus tidak dihitung.</p>
          </div>
        </section>

        <section className="lp-sec join" id="gabung" aria-labelledby="gabung-h">
          <div className="lp-wrap">
            <p className="lp-label"><b>05</b>Gabung</p>
            <h2 id="gabung-h">Mulai dari tiga langkah.</h2>
            <LiveStats />
            <ol className="steps rv">
              <li>
                <span className="n" aria-hidden="true">1</span>
                <h3>Gabung Google Group</h3>
                <p>Masuk ke <code className="email">{COMMUNITY_GROUP}</code> dengan akun Google di HP-mu. Creator memasang grup ini sebagai daftar tester di Play Console.</p>
                <CopyEmail />
              </li>
              <li>
                <span className="n" aria-hidden="true">2</span>
                <h3>Masuk dengan Google</h3>
                <p>Daftarkan app-mu, atau langsung pilih app yang ingin kamu bantu tes. Melihat-lihat tidak perlu masuk.</p>
              </li>
              <li>
                <span className="n" aria-hidden="true">3</span>
                <h3>Ikut cohort berikutnya</h3>
                <p>Sebagai creator dengan satu app, atau sebagai tester murni. Kewajibannya: opt-in dalam 48 jam, centang di setiap titik cek, kirim feedback di Play.</p>
              </li>
            </ol>
            <div className="cta-row">
              <a className="lp-btn lp-btn--ink" href={COMMUNITY_GROUP_URL} target="_blank" rel="noopener noreferrer">
                Gabung komunitas<span className="sr-only"> (Google Group, tab baru)</span><span aria-hidden="true"> ↗</span>
              </a>
              {user ? (
                <Link className="lp-btn" to="/apps">Lihat daftar app</Link>
              ) : (
                <button type="button" className="lp-btn" onClick={startSignIn}>Masuk dengan Google</button>
              )}
            </div>
            <p className="join-note">Email selalu tampil disamarkan. Nomor HP tidak pernah diminta.</p>
          </div>
        </section>

        <section className="lp-sec" id="faq" aria-labelledby="faq-h">
          <div className="lp-wrap">
            <p className="lp-label"><b>06</b>FAQ</p>
            <h2 id="faq-h">Pertanyaan yang sering muncul.</h2>
            <div className="faq rv">
              {FAQ.map((x, i) => (
                <details key={x.q}>
                  <summary><span className="q-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><span className="q-t">{x.q}</span></summary>
                  <p className="ans">{x.a}</p>
                </details>
              ))}
            </div>
            <p className="faq-more">Aturan lengkapnya ada di <Link to="/about">halaman aturan main</Link>.</p>
          </div>
        </section>
      </main>

      <footer className="lp-wrap lp-foot">
        <p className="foot-word" aria-hidden="true">TesBareng</p>
        <div className="foot-row">
          <span>Komunitas creator Android Indonesia. Bukan layanan resmi Google.</span>
          <nav aria-label="Kaki halaman">
            <Link to="/about">Aturan main</Link>
            <Link to="/apps">Daftar app</Link>
            <a href={COMMUNITY_GROUP_URL} target="_blank" rel="noopener noreferrer">Google Group<span className="sr-only"> (tab baru)</span></a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
