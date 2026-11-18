import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePageMeta } from '../lib/pageMeta'
import { Link } from 'react-router-dom'
import { StoryHeader, StoryFooter, WaIcon, useReducedMotion, useSignIn } from '../components/StoryChrome'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL, WHATSAPP_URL } from '../lib/community'
import { supabase } from '../lib/supabase'
import { useT } from '../lib/i18n'
import './landing.css'

/* Story surface: the landing page at `/` (ADR-001 §2–§4, ADR-008 option A, ADR-010), rebuilt on the
   landing-page-ui-v2 mockup (docs/design). Owner decisions 3 Nov 2026: dark mode + JetBrains Mono, the mockup's
   sample content (labelled "Data contoh"), and all of the mockup's motion. Every effect is plain CSS or a small
   rAF/IntersectionObserver loop (no animation library), switches off live under prefers-reduced-motion, and the
   markup always carries the final state, so nothing depends on an effect having run. */


const nf = new Intl.NumberFormat('id-ID')

/* Header height, shared with the ring's sticky stage (CSS reads --hh, the scrub reads HH). */
let HH = 0

/** Sticky header: --hh, the `scrolled` rule, the page progress line and the back-to-top button. Direct DOM writes, no re-render per frame. */
function usePageChrome(header: React.RefObject<HTMLElement | null>, fill: React.RefObject<HTMLElement | null>, totop: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const bar = header.current
    if (!bar) return
    const root = document.documentElement
    const row = bar.firstElementChild as HTMLElement | null
    const setHH = () => {
      HH = (row?.offsetHeight ?? bar.offsetHeight) + (parseFloat(getComputedStyle(bar).borderBottomWidth) || 0)
      root.style.setProperty('--hh', `${HH}px`)
    }
    setHH()
    const ro = 'ResizeObserver' in window ? new ResizeObserver(setHH) : null
    if (row) ro?.observe(row)
    let raf = 0
    const frame = () => {
      raf = 0
      const y = window.scrollY, max = root.scrollHeight - window.innerHeight
      bar.classList.toggle('scrolled', y > 8)
      fill.current?.style.setProperty('--sp', max > 0 ? Math.min(1, y / max).toFixed(4) : '0')
      totop.current?.classList.toggle('show', y > window.innerHeight * 1.2)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    frame()
    return () => {
      ro?.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      root.style.removeProperty('--hh')
    }
  }, [header, fill, totop])
}

/** Which section sits in the middle of the viewport, for the nav's active state. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      (es) => { for (const e of es) if (e.isIntersecting) setActive(e.target.id || null) },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const id of key.split(',')) { const el = document.getElementById(id); if (el) io.observe(el) }
    return () => io.disconnect()
  }, [key])
  return active
}

/* ---------------------------------------------------------------------------
   Reveal effects (.lp.fx): scan-line wipe on .rv blocks, h2 glitch, segment fill,
   count-up and masked-email scramble. Each effect starts from the final state already
   in the markup, so a missed observer or reduced motion leaves correct content.
   --------------------------------------------------------------------------- */
/** Running effects, so unmount (or reduced motion switching on) can stop them and write the final value. */
type Running = Map<HTMLElement, () => void>
function countUp(el: HTMLElement, running: Running) {
  const n = Number(el.dataset.count)
  if (!Number.isFinite(n) || n <= 0) return
  const final = nf.format(n)
  let t0 = 0, raf = 0
  el.textContent = nf.format(0)
  const stop = () => { cancelAnimationFrame(raf); el.textContent = final; running.delete(el) }
  const st = (ts: number) => {
    if (!t0) t0 = ts
    const p = Math.min(1, (ts - t0) / 700)
    el.textContent = nf.format(Math.round(n * (1 - Math.pow(1 - p, 3))))
    if (p < 1) raf = requestAnimationFrame(st)
    else stop()
  }
  running.set(el, stop)
  raf = requestAnimationFrame(st)
}
const GLYPHS = '█▓▒░<>/#*01'
function scramble(el: HTMLElement, running: Running) {
  const target = el.dataset.scramble ?? el.textContent ?? ''
  let i = 0
  const steps = 18
  const stop = () => { window.clearInterval(id); el.textContent = target; running.delete(el) }
  const id = window.setInterval(() => {
    i++
    let out = ''
    for (let k = 0; k < target.length; k++) out += k < (i / steps) * target.length ? target[k] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
    el.textContent = out
    if (i >= steps) stop()
  }, 45)
  running.set(el, stop)
}

function useReveal(root: React.RefObject<HTMLElement | null>, reduced: boolean) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    const html = document.documentElement
    if (reduced || !('IntersectionObserver' in window)) {
      el.classList.remove('fx')
      html.classList.remove('fx')
      return
    }
    html.classList.add('fx')
    el.classList.add('fx')
    const FX = '.seg, [data-count], [data-scramble]'
    const timers: number[] = []
    const running: Running = new Map()
    const play = (n: Element) => {
      if (n.classList.contains('seg')) n.classList.add('go')
      else if (n instanceof HTMLElement && n.dataset.count) countUp(n, running)
      else if (n instanceof HTMLElement && n.dataset.scramble) scramble(n, running)
      else n.classList.add('in')
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const n = e.target
          io.unobserve(n)
          play(n)
          if (n.classList.contains('rv')) timers.push(window.setTimeout(() => n.querySelectorAll(FX).forEach(play), 420))
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    el.querySelectorAll('main .rv, main h2').forEach((n) => io.observe(n))
    el.querySelectorAll(FX).forEach((n) => { if (!n.closest('.rv') && !n.closest('.hero')) io.observe(n) })
    return () => {
      io.disconnect()
      timers.forEach(clearTimeout)
      for (const stop of [...running.values()]) stop()
      el.classList.remove('fx')
      html.classList.remove('fx')
      el.querySelectorAll('.in, .go').forEach((n) => n.classList.remove('in', 'go'))
    }
  }, [root, reduced])
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
const CREATORS = Array.from({ length: N_APPS }, (_, i) => onCircle(i, N_APPS, 250))
const PURES = Array.from({ length: N_PURE }, (_, i) => onCircle(i, N_PURE, 74))
const NODES = [...CREATORS, ...PURES]
/** Sample initials (mockup v2). Creators first, then the pure testers. */
const INITIALS = ['AR', 'BN', 'CS', 'DW', 'EK', 'FP', 'GH', 'IS', 'JN', 'KM', 'LT', 'MY', 'NR', 'OP', 'RA', 'SW', 'TY', 'YH']
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
      ties.push({ o: N_APPS + p, t, d: curve(PURES[p], CREATORS[t], 0.04), pure: true })
      load[t]++
    }
  }
  const byOwner = NODES.map((_, o) => ties.filter((x) => x.o === o).map((x) => x.t))
  return { ties, byOwner, total: ties.length, min: Math.min(...load), max: Math.max(...load) }
})()


/** Scrub (pin + draw) only where the pinned ring still gets a usable size: tall enough for the stacked layout on narrow
 *  screens, or side by side on wide ones. Landscape phones and short windows get the completed static ring. */
const SCRUB_QUERY = '(min-height: 640px), (min-width: 981px) and (min-height: 480px)'
function useMedia(q: string) {
  const [m, setM] = useState(() => typeof matchMedia !== 'function' || matchMedia(q).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

/** True when the device can afford the scroll-scrubbed ring (reduced motion is checked separately, live). */
function deviceCanScrub() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return false
  if ((navigator.hardwareConcurrency ?? 4) <= 2) return false
  return true
}

const Ring = memo(function Ring({ reduced }: { reduced: boolean }) {
  const t = useT()
  const secRef = useRef<HTMLElement>(null)
  const figRef = useRef<HTMLElement>(null)
  const copyRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const countersRef = useRef<HTMLDListElement>(null)
  const drawnRef = useRef<HTMLSpanElement>(null)
  const minRef = useRef<HTMLSpanElement>(null)
  const finalRef = useRef<HTMLParagraphElement>(null)
  const hintRef = useRef<HTMLParagraphElement>(null)
  // Client-only SPA, so the device check can run on first render (no static frame flash).
  const [deviceOk] = useState(deviceCanScrub)
  const roomy = useMedia(SCRUB_QUERY)
  const scrub = deviceOk && roomy && !reduced
  const legRef = useRef<HTMLElement>(null)

  // Strokes are specified in screen pixels: 1 user unit = 600 / rendered width.
  useEffect(() => {
    const fig = figRef.current, svg = svgRef.current, copy = copyRef.current, leg = legRef.current
    if (!fig || !svg || !('ResizeObserver' in window)) return
    // Also hands the copy block's height to CSS, so the pinned ring on narrow screens can take the rest of the viewport.
    const ro = new ResizeObserver(() => {
      const w = svg.getBoundingClientRect().width
      if (w > 0) fig.style.setProperty('--u', (600 / w).toFixed(3))
      if (copy) fig.style.setProperty('--copy-h', `${copy.offsetHeight}px`)
      if (leg) fig.style.setProperty('--leg-h', `${leg.offsetHeight}px`)
    })
    ro.observe(svg)
    if (copy) ro.observe(copy)
    if (leg) ro.observe(leg)
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
    const countersEl = countersRef.current, hintEl = hintRef.current
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
          p.style.strokeDashoffset = (1 - w).toFixed(3)
          p.classList.toggle('drawing', live)
        }
        nodeEls[o].classList.toggle('act', live)
        nodeEls[o].classList.toggle('done', w >= 1)
      }
      const min = Math.min(...load)
      if (drawn !== lastDrawn && drawnEl) { drawnEl.textContent = nf.format(drawn); lastDrawn = drawn }
      if (min !== lastMin && minEl) { minEl.textContent = nf.format(min); lastMin = min }
      finalEl?.classList.toggle('show', t >= 0.999)
      countersEl?.style.setProperty('--rp', t.toFixed(3))
    }
    const measure = () => {
      const r = sec.getBoundingClientRect()
      const span = sec.offsetHeight - (window.innerHeight - HH)
      const p = span > 0 ? Math.min(1, Math.max(0, (HH - r.top) / span)) : 1
      hintEl?.classList.toggle('gone', p > 0.04)
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
      // Back to the completed static frame (e.g. reduced motion switched on mid-scroll).
      for (const list of tieEls) for (const p of list) { p.style.strokeDashoffset = ''; p.classList.remove('drawing') }
      for (const n of nodeEls) { n.classList.remove('act'); n.classList.add('done') }
      if (drawnEl) drawnEl.textContent = nf.format(RING.total)
      if (minEl) minEl.textContent = nf.format(RING.min)
      finalEl?.classList.remove('show')
      countersEl?.style.removeProperty('--rp')
      hintEl?.classList.remove('gone')
    }
  }, [scrub])

  return (
    <section className="ring-scroll" ref={secRef} id="cohort" aria-labelledby="ring-h">
      <div className="lp-wrap ring-stage">
        <div className="ring-copy" ref={copyRef}>
          <p className="lp-hud"><b aria-hidden="true">01</b>{t('landing_hud_cohort')}</p>
          <h2 id="ring-h">{t('landing_h2_cohort')}</h2>
          <p className="lp-lede ring-lede">
            {t('landing_lede_cohort', { n_apps: String(N_APPS), n_others: String(N_APPS - 1), n_pure: String(N_PURE), k: String(K) })}
          </p>
          {/* The scrubbed numbers are visual only; screen readers get the final values, and the closing line is never hidden from them. */}
          <div className="ring-status">
            <dl className="counters" ref={countersRef}>
              <div><dt>{t('landing_counter_tasks')}</dt><dd><span aria-hidden="true"><span ref={drawnRef}>{nf.format(RING.total)}</span><span className="dim">{t('landing_counter_total_ratio', { total: nf.format(RING.total) })}</span></span><span className="sr-only">{t('landing_counter_sr_ratio', { drawn: nf.format(RING.total), total: nf.format(RING.total) })}</span></dd></div>
              <div><dt>{t('landing_counter_min_testers')}</dt><dd><span aria-hidden="true"><span ref={minRef}>{nf.format(RING.min)}</span><span className="dim">{t('landing_counter_min_unit')}</span></span><span className="sr-only">{t('landing_counter_min_sr', { min: nf.format(RING.min) })}</span></dd></div>
            </dl>
            <p className="ring-final theme-light" ref={finalRef}>{t('landing_ring_final', { min: String(RING.min) })}</p>
          </div>
        </div>
        <figure className="ring-fig" ref={figRef}>
          <svg ref={svgRef} viewBox="0 0 600 600" width="600" height="600" role="img" aria-labelledby="ring-t ring-d">
            <title id="ring-t">{t('landing_ring_title')}</title>
            <desc id="ring-d">{t('landing_ring_desc', { n_apps: String(N_APPS), n_pure: String(N_PURE), n_others: String(N_APPS - 1), k: String(K), total: String(RING.total), min: String(RING.min), max: String(RING.max) })}</desc>
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
                      <><rect className="nshadow" x={-14} y={-14} width={34} height={34} /><rect className="nbody" x={-17} y={-17} width={34} height={34} /></>
                    ) : (
                      <><circle className="nshadow" cx={3} cy={3} r={17} /><circle className="nbody" r={17} /></>
                    )}
                    <text y={4.5}>{INITIALS[i]}</text>
                    <g className="ncheck"><rect x={8} y={-27} width={18} height={18} /><path d="M12 -18.5l3.5 3.5 6.5-7" /></g>
                  </g>
                </g>
              ))}
            </g>
          </svg>
          <figcaption className="ring-legend" ref={legRef}>
            <span><i className="lg-sq" aria-hidden="true" />{t('landing_ring_legend_creator')}</span>
            <span><i className="lg-ci" aria-hidden="true" />{t('landing_ring_legend_pure')}</span>
            <span><i className="lg-line" aria-hidden="true" />{t('landing_ring_legend_line')}</span>
            <span><i className="lg-ok" aria-hidden="true">✓</i>{t('landing_ring_legend_done')}</span>
          </figcaption>
        </figure>
        <p className="ring-hint" ref={hintRef} aria-hidden="true">{t('landing_scroll_hint')} <b>↓</b></p>
      </div>
    </section>
  )
})

/* ---------------------------------------------------------------------------
   Small pieces
   --------------------------------------------------------------------------- */
/** Segment meter. aria-hidden: the label next to it carries the same numbers in text. */
function Seg({ n, on, c }: { n: number; on: number; c: string }) {
  return (
    <div className="seg" style={{ ['--n' as string]: n, ['--c' as string]: `var(--${c})` }} aria-hidden="true">
      {Array.from({ length: n }, (_, k) => <i key={k} className={k < on ? 'on' : undefined} style={{ ['--k' as string]: k }} />)}
    </div>
  )
}

/** A horizontal scroller is a tab stop (keyboard scrolling) only while its content actually overflows. */
function useOverflowTab<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [over, setOver] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('ResizeObserver' in window)) return
    const ro = new ResizeObserver(() => setOver(el.scrollWidth > el.clientWidth + 1))
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
  return [ref, over ? 0 : undefined] as const
}

function HeroSheet() {
  const t = useT()
  const [scRef, scTab] = useOverflowTab<HTMLDivElement>()
  const sheetRows = [
    { who: 'Budi S.', email: 'bu*****@gmail.com', days: '15', chip: 'c-pandan', status: t('landing_sheet_chip_eligible') },
    { who: 'Sari A.', email: 'sa*****@gmail.com', days: '14', chip: 'c-pandan', status: t('landing_sheet_chip_eligible') },
    { who: 'Dimas P.', email: 'di*****@studio.co.id', days: '9', chip: 'c-langit', status: t('landing_sheet_chip_active') },
    { who: 'Wulan L.', email: 'wu*****@gmail.com', days: '3', chip: 'c-langit', status: t('landing_sheet_chip_active') },
    { who: 'Rizky H.', email: 'ri*****@gmail.com', days: '—', chip: 'c-cabai', status: t('landing_sheet_chip_no_test') },
  ]
  return (
    <div className="sheet hero-sheet" role="group" aria-labelledby="sheet-h">
      <div className="sheet-head"><strong id="sheet-h">Kopi Catat</strong><span className="lp-chip c-langit">Cohort #3</span></div>
      <div className="scroller" ref={scRef} role="region" aria-label={t('landing_sheet_region')} tabIndex={scTab}>
        <table className="tsheet">
          <caption className="sr-only">{t('landing_sheet_caption')}</caption>
          <thead><tr><th scope="col">{t('landing_sheet_col_tester')}</th><th scope="col">{t('landing_sheet_col_email')}</th><th scope="col">{t('landing_sheet_col_days')}</th><th scope="col">{t('landing_sheet_col_status')}</th></tr></thead>
          <tbody>
            {sheetRows.map((r) => (
              <tr key={r.who}><th scope="row">{r.who}</th><td>{r.email}</td><td className="n">{r.days}</td><td><span className={`lp-chip ${r.chip}`}>{r.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sheet-more">{t('landing_sheet_more')}</p>
      <div className="sheet-ft">
        <div className="lp-meter">
          <div className="meter-top"><span>{t('landing_sheet_meter_eligible')}</span><span>9 / 12</span></div>
          <Seg n={12} on={9} c="pandan" />
        </div>
        <div className="lp-meter">
          <div className="meter-top"><span>{t('landing_sheet_meter_days')}</span><span>{t('landing_sheet_days_left')}</span></div>
          <Seg n={14} on={9} c="kunyit" />
        </div>
      </div>
      <p className="sample"><b>{t('landing_sheet_sample')}</b></p>
    </div>
  )
}

function CopyEmail({ onCopied }: { onCopied: (msg: string) => void }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const id = setTimeout(() => setState('idle'), state === 'fail' ? 6000 : 2000)
    return () => clearTimeout(id)
  }, [state])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COMMUNITY_GROUP)
      setState('ok')
      onCopied(t('copy_email_ok_status'))
    } catch {
      setState('fail')
    }
  }
  return (
    <div className="copy-row">
      <button type="button" className={`copy ${state === 'ok' ? 'ok' : ''}`} onClick={copy}>
        {state === 'ok' ? t('copy_email_ok') : t('copy_email_btn')}
      </button>
      <span className="copy-status" role="status" aria-live="polite">
        {state === 'fail' ? t('copy_email_fail') : ''}
      </span>
    </div>
  )
}

type Stats = { apps: number; members: number; ready: number }

/** Live counts from the public views (ADR-004). Hidden when the request fails or everything is zero.
 *  Requested once the browser is idle after first paint, so it never competes with the hero. */
function useLiveStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    let alive = true
    const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
    const start = () => { if (alive) load() }
    const idle = w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 1200)
    return () => {
      alive = false
      if (w.requestIdleCallback && w.cancelIdleCallback) w.cancelIdleCallback(idle)
      else clearTimeout(idle)
    }
    function load() {
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
    }
  }, [])
  return stats
}

/** Proof (ADR-010 §2.6, §4): real counts only. The whole section is left out when there is nothing real to show. */
function Proof() {
  const t = useT()
  const s = useLiveStats()
  if (!s) return null
  const items = [
    { n: s.apps, l: t('landing_proof_apps_label') },
    { n: s.members, l: t('landing_proof_members_label') },
    { n: s.ready, l: t('landing_proof_ready_label') },
  ].filter((x) => x.n > 0)
  if (!items.length) return null
  return (
    <section className="lp-sec" id="bukti" aria-labelledby="bukti-h">
      <div className="lp-wrap">
        <p className="lp-hud"><b>{t('landing_hud_proof')}</b>{t('landing_hud_proof_detail')}</p>
        <h2 id="bukti-h">{t('landing_h2_proof')}</h2>
        <dl className="live-row">
          {items.map((x) => (
            <div key={x.l}><dt>{x.l}</dt><dd>{nf.format(x.n)}</dd></div>
          ))}
        </dl>
        <p className="live-note">{t('landing_live_note')}</p>
      </div>
    </section>
  )
}

/* Matrix demo. Sample cohort, consistent with the hero: "Kamu" is the creator of Kopi Catat,
   and its column matches the hero sheet (Budi and Sari verified, Dimas active, Rizky late). "Aktif" uses → everywhere, as on the work surface; ✓✓ is verified. */
type CellKind = 'ok2' | 'ok' | 'wait' | 'late' | 'own'
const MATRIX_APPS = ['Kopi Catat', 'Resep Ibu', 'Angkot Kita', 'Hafalan', 'Jajan']
const MATRIX_ROWS: { who: string; me?: boolean; cells: CellKind[] }[] = [
  { who: 'Budi S.', cells: ['ok2', 'own', 'ok2', 'ok', 'ok'] },
  { who: 'Kamu', me: true, cells: ['own', 'ok', 'ok', 'ok2', 'wait'] },
  { who: 'Sari A.', cells: ['ok2', 'ok2', 'own', 'ok2', 'ok'] },
  { who: 'Rizky H.', cells: ['late', 'late', 'ok', 'own', 'late'] },
  { who: 'Dimas P.', cells: ['ok', 'ok', 'ok2', 'ok', 'own'] },
]
const FILTERS: CellKind[] = ['ok2', 'ok', 'wait', 'late']

function MatrixDemo() {
  const t = useT()
  const [filter, setFilter] = useState<CellKind | null>(null)
  const tblRef = useRef<HTMLTableElement>(null)
  const [scRef, scTab] = useOverflowTab<HTMLDivElement>()
  const CELL: Record<CellKind, { glyph: string; short: string; label: string; cls: string }> = {
    ok2: { glyph: '✓✓', short: t('landing_cell_ok2_short'), label: t('landing_cell_ok2_label'), cls: 'c-pandan' },
    ok: { glyph: '→', short: t('landing_cell_ok_short'), label: t('landing_cell_ok_label'), cls: 'c-langit' },
    wait: { glyph: '—', short: t('landing_cell_wait_short'), label: t('landing_cell_wait_label'), cls: 'none' },
    late: { glyph: '!', short: t('landing_cell_late_short'), label: t('landing_cell_late_label'), cls: 'c-cabai' },
    own: { glyph: '·', short: t('landing_cell_own_short'), label: t('landing_cell_own_label'), cls: 'own' },
  }
  // Crosshair: highlight the hovered cell's row and column. Direct class toggles, no re-render per pointer move.
  const clearX = () => tblRef.current?.querySelectorAll('.x-col, .x-row, .x-hit').forEach((n) => n.classList.remove('x-col', 'x-row', 'x-hit'))
  const onOver = (e: React.PointerEvent<HTMLTableElement>) => {
    if (e.pointerType !== 'mouse') return
    const tbl = tblRef.current
    const cell = (e.target as Element).closest('td, th') as HTMLTableCellElement | null
    if (!tbl || !cell) return
    clearX()
    const idx = cell.cellIndex, tr = cell.parentElement as HTMLTableRowElement
    if (idx > 0) for (const r of Array.from(tbl.rows)) r.cells[idx]?.classList.add('x-col')
    if (tr.parentElement?.tagName === 'TBODY') tr.classList.add('x-row')
    if (cell.tagName === 'TD') cell.classList.add('x-hit')
  }
  return (
    <div className="matrix-wrap rv">
      <div className={`matrix ${filter ? 'filtering' : ''}`}>
        <div className="scroller" ref={scRef} role="region" aria-label={t('landing_matrix_region')} tabIndex={scTab}>
          <table ref={tblRef} onPointerOver={onOver} onPointerLeave={clearX}>
            <caption className="sr-only">{t('landing_matrix_caption')}</caption>
            <thead>
              <tr><th scope="col">Anggota</th>{MATRIX_APPS.map((a) => <th key={a} scope="col">{a}</th>)}</tr>
            </thead>
            <tbody>
              {MATRIX_ROWS.map((r) => (
                <tr key={r.who} className={r.me ? 'me' : undefined}>
                  <th scope="row">{r.who}</th>
                  {r.cells.map((c, i) => (
                    <td key={i}>
                      <span className={`cell ${CELL[c].cls} ${filter === c ? 'match' : ''}`}>
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
        <p className="matrix-note"><b>{t('landing_matrix_note')}</b><span className="matrix-hint" aria-hidden="true"> {t('landing_matrix_hint')}</span> {t('landing_matrix_real')}</p>
      </div>
      <div className="lp-legend">
        <p className="lp-hud"><b>Filter</b>{t('landing_matrix_hud')}</p>
        {FILTERS.map((k) => (
          <button key={k} type="button" className="lg-btn" aria-pressed={filter === k} onClick={() => setFilter(filter === k ? null : k)}>
            <span className={`cell ${CELL[k].cls}`} aria-hidden="true">{CELL[k].glyph}</span>
            <span>{CELL[k].label}</span>
          </button>
        ))}
        <p className="lg-row">
          <span className="cell own" aria-hidden="true">{CELL.own.glyph}</span>
          <span>{CELL.own.label}</span>
        </p>
        <div className="privacy">
          <strong>{t('landing_privacy_title')}</strong>
          <span className="masked" aria-hidden="true" data-scramble="bu*****@gmail.com">bu*****@gmail.com</span>
          <span className="sr-only">{t('landing_privacy_example_sr')}</span>
          <p>{t('landing_privacy_text')}</p>
        </div>
      </div>
    </div>
  )
}

const RAIL: Record<number, string> = { 0: 'c-kunyit', 2: 'c-cabai', 7: 'c-pandan', 13: 'c-langit' }

function Schedule() {
  const t = useT()
  const [hot, setHot] = useState<number | null>(null)
  const days = [
    { d: 0, title: t('landing_day0_title'), text: t('landing_day0_text'), chip: 'c-putih', chipText: t('landing_day0_chip') },
    { d: 2, title: t('landing_day2_title'), text: t('landing_day2_text'), chip: 'c-cabai', chipText: t('landing_day2_chip') },
    { d: 7, title: t('landing_day7_title'), text: t('landing_day7_text'), chip: 'c-pandan', chipText: t('landing_day7_chip') },
    { d: 13, title: t('landing_day13_title'), text: t('landing_day13_text'), chip: 'c-langit', chipText: t('landing_day13_chip') },
  ]
  return (
    <>
      <p className="sr-only">{t('landing_schedule_sr')}</p>
      <div className="rail rv" aria-hidden="true">
        <div className="rail-head"><span>{t('landing_rail_start')}</span><span>{t('landing_rail_close_start')}<span className="long">{t('landing_rail_close_long')}</span>{t('landing_rail_close_end')}</span></div>
        <div className="rail-cells">
          {Array.from({ length: 15 }, (_, d) => (
            <i key={d} className={`${d === 14 ? 'fin' : RAIL[d] ? `cp ${RAIL[d]}` : 'plain'}${hot === d ? ' hot' : ''}`}>{d}</i>
          ))}
          <i className="close">21</i>
        </div>
      </div>
      <ol className="days rv">
        {days.map((x) => (
          <li className={`day${x.d === 0 ? ' now theme-light' : ''}`} key={x.d} onPointerEnter={() => setHot(x.d)} onPointerLeave={() => setHot(null)}>
            <p className="day-n"><small>Hari ke</small>{x.d}</p>
            <h3>{x.title}</h3>
            <p className="day-t">{x.text}</p>
            <span className={`lp-chip ${x.chip}`}>{x.chipText}</span>
          </li>
        ))}
      </ol>
      <p className="build-strip rv"><span className="lp-chip c-kunyit">{t('landing_build_chip')}</span><span>{t('landing_build_text')}</span></p>
    </>
  )
}


/** FAQ: animate the details height open and closed (owner decision; off under reduced motion). */
function Faq({ reduced }: { reduced: boolean }) {
  const t = useT()
  const faq = [
    { q: t('landing_faq_q1'), a: t('landing_faq_a1') },
    { q: t('landing_faq_q2'), a: t('landing_faq_a2') },
    { q: t('landing_faq_q3'), a: t('landing_faq_a3') },
    { q: t('landing_faq_q4'), a: t('landing_faq_a4') },
    { q: t('landing_faq_q5'), a: t('landing_faq_a5') },
    { q: t('landing_faq_q6'), a: t('landing_faq_a6') },
    { q: t('landing_faq_q7'), a: t('landing_faq_a7') },
    { q: t('landing_faq_q8'), a: t('landing_faq_a8') },
    { q: t('landing_faq_q9'), a: t('landing_faq_a9') },
    { q: t('landing_faq_q10'), a: t('landing_faq_a10') },
    { q: t('landing_faq_q11'), a: t('landing_faq_a11') },
    { q: t('landing_faq_q12'), a: t('landing_faq_a12') },
  ]
  const onSummary = (e: React.MouseEvent<HTMLElement>) => {
    const d = e.currentTarget.parentElement as HTMLDetailsElement | null
    if (!d || reduced || !('animate' in Element.prototype)) return
    e.preventDefault()
    if (d.dataset.busy) return
    d.dataset.busy = '1'
    const s = e.currentTarget
    const closing = d.open
    const bw = d.offsetHeight - d.clientHeight
    const from = d.offsetHeight
    let to: number
    d.style.overflow = 'hidden'
    if (closing) to = s.offsetHeight + bw
    else { d.open = true; to = d.offsetHeight }
    const a = d.animate({ height: [`${from}px`, `${to}px`] }, { duration: closing ? 200 : 280, easing: 'cubic-bezier(.2,.8,.2,1)' })
    const end = () => { if (closing) d.open = false; d.style.overflow = ''; delete d.dataset.busy }
    a.onfinish = end
    a.oncancel = end
  }
  return (
    <div className="faq rv">
      {faq.map((x, i) => (
        <details key={x.q}>
          <summary onClick={onSummary}><span className="q-n" aria-hidden="true">Q.{String(i + 1).padStart(2, '0')}</span><span className="q-t">{x.q}</span></summary>
          <p className="ans">{x.a}</p>
        </details>
      ))}
    </div>
  )
}

const OBSERVED = ['cohort', 'cara-kerja', 'transparansi', 'badge', 'bukti', 'gabung', 'faq']

/* ---------------------------------------------------------------------------
   Page
   --------------------------------------------------------------------------- */
export function Landing() {
  const t = useT()
  usePageMeta(t('landing_meta_title'), t('landing_meta_desc'))
  const tiers = [
    { name: 'Bronze', n: 3, cls: 't-bronze', note: t('landing_tier_note_apps') },
    { name: 'Silver', n: 7, cls: 't-silver', note: t('landing_tier_note_apps') },
    { name: 'Gold', n: 14, cls: 't-gold', note: t('landing_tier_note_full') },
    { name: 'Platinum', n: 25, cls: 't-platinum', note: t('landing_tier_note_apps') },
  ]
  const root = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const fillRef = useRef<HTMLElement>(null)
  const totopRef = useRef<HTMLButtonElement>(null)
  const brandRef = useRef<HTMLAnchorElement>(null)
  const reduced = useReducedMotion()
  useReveal(root, reduced)
  usePageChrome(headerRef, fillRef, totopRef)
  const active = useActiveSection(OBSERVED)
  const signIn = useSignIn()
  const { user, startSignIn } = signIn
  const [toast, setToast] = useState('')
  const [toastOn, setToastOn] = useState(false)

  // The static header and hero in index.html cover first paint; this copy is identical, so drop that one now (before paint).
  // If the static hero's CSS entrance is already running, continue from the same point instead of replaying it.
  useLayoutEffect(() => {
    const boot = document.getElementById('boot')
    const t0 = (window as unknown as { __tbT0?: number }).__tbT0
    if (boot && root.current && typeof t0 === 'number') root.current.style.setProperty('--hero-off', `${-Math.round(performance.now() - t0)}ms`)
    boot?.remove()
  }, [])

  // CSS smooth scroll for in-page links, only while the landing is mounted and only without reduced motion.
  useEffect(() => {
    const html = document.documentElement
    html.classList.toggle('lp-smooth', !reduced)
    return () => html.classList.remove('lp-smooth')
  }, [reduced])

  const say = useCallback((msg: string) => { setToast(msg); setToastOn(true) }, [])
  useEffect(() => {
    if (!toastOn) return
    const id = setTimeout(() => setToastOn(false), 2200)
    return () => clearTimeout(id)
  }, [toastOn, toast])
  useEffect(() => {
    if (toastOn || !toast) return
    const id = setTimeout(() => setToast(''), 240) // after the 180 ms fade-out
    return () => clearTimeout(id)
  }, [toastOn, toast])

  /** Scroll to a section and move focus to its heading, so keyboard users are not left on a link that just disappeared. */
  const goTo = useCallback((id: string, smooth: boolean) => {
    const sec = document.getElementById(id)
    if (!sec) return false
    const target = (sec.querySelector('h2') as HTMLElement | null) ?? sec
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
    sec.scrollIntoView({ behavior: smooth && !reduced ? 'smooth' : 'auto', block: 'start' })
    target.focus({ preventScroll: true })
    return true
  }, [reduced])

  // Deep links such as /#faq: the page is built after load, so scroll there once after mount.
  const goToRef = useRef(goTo)
  goToRef.current = goTo
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (!id) return
    const raf = requestAnimationFrame(() => { goToRef.current(id, false) })
    return () => cancelAnimationFrame(raf)
  }, [])

  const toTop = () => {
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
    brandRef.current?.focus({ preventScroll: true })
  }

  const signInBtn = (cls: string, long: boolean) =>
    user ? (
      <Link className={cls} to="/me">{t('nav_tasks')}</Link>
    ) : (
      <button type="button" className={cls} onClick={startSignIn}>
        <span>{long ? t('sign_in_google') : <>{t('sign_in_short')}<span className="hide-xs"> {t('sign_in_suffix')}</span></>}</span>
      </button>
    )

  return (
    <div className="lp surface-story dark-ready" ref={root}>
      <a className="lp-skip" href="#isi">{t('skip_to_content')}</a>

      {/* Header: shared with /about (components/StoryChrome). Keep it in step with the static copy in web/index.html (same classes and text). */}
      <StoryHeader page="home" signIn={signIn} active={active ?? undefined} headerRef={headerRef} fillRef={fillRef} brandRef={brandRef} onAnchor={(id) => goTo(id, true)} />

      <main id="isi">
        <section className="lp-wrap hero" aria-labelledby="hero-h">
          <div className="hero-copy">
            <p className="lp-hud"><b aria-hidden="true">00</b>{t('landing_hud_hero')}</p>
            <h1 id="hero-h"><span>{t('landing_h1_1')}</span><span>{t('landing_h1_2')}</span><span>{t('landing_h1_3')}<i className="caret" aria-hidden="true" /></span></h1>
            <p className="lp-lede">{t('landing_lede_hero')}</p>
            <div className="cta-row">
              <a className="lp-btn lp-btn--primary" href="#gabung">{t('cta_join_community')}</a>
              <a className="lp-btn lp-btn--wa" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><WaIcon />{t('cta_wa_group')}<span className="sr-only"> (tab baru)</span></a>
              <a className="lp-btn" href="#cara-kerja">{t('landing_cta_how')}</a>
            </div>
          </div>
          <HeroSheet />
        </section>

        <Ring reduced={reduced} />

        <section className="lp-sec" id="cara-kerja" aria-labelledby="cara-h">
          <div className="lp-wrap">
            <div className="sec-head">
              <div><p className="lp-hud"><b aria-hidden="true">02</b>{t('landing_hud_how')}</p><h2 id="cara-h">{t('landing_h2_how')}</h2></div>
              <p className="lp-lede dim">{t('landing_lede_how')}</p>
            </div>
            <Schedule />
          </div>
        </section>

        <section className="lp-sec" id="transparansi" aria-labelledby="lembar-h">
          <div className="lp-wrap">
            <div className="sec-head">
              <div><p className="lp-hud"><b aria-hidden="true">03</b>{t('landing_hud_transparency')}</p><h2 id="lembar-h">{t('landing_h2_transparency')}</h2></div>
              <p className="lp-lede dim">{t('landing_lede_transparency')}</p>
            </div>
            <MatrixDemo />
          </div>
        </section>

        <section className="lp-sec" id="badge" aria-labelledby="badge-h">
          <div className="lp-wrap">
            <div className="sec-head">
              <div><p className="lp-hud"><b aria-hidden="true">04</b>{t('landing_hud_badge')}</p><h2 id="badge-h">{t('landing_h2_badge')}</h2></div>
              <p className="lp-lede dim">{t('landing_lede_badge')}</p>
            </div>
            <div className="badge-grid">
              <div className="badge-side">
                <ul className="tiers rv">
                  {tiers.map((tier) => (
                    <li className="tier" key={tier.name}>
                      <span className={`pill ${tier.cls}`}>{tier.name}</span>
                      <b data-count={tier.n}>{nf.format(tier.n)}</b>
                      <small>{tier.note}</small>
                    </li>
                  ))}
                </ul>
                <p className="tier-note">{t('landing_tier_footer')}</p>
              </div>
              <article className="profile rv" aria-labelledby="wl-h">
                <div className="who">
                  <span className="lp-avatar" aria-hidden="true">WL</span>
                  <div><strong id="wl-h">Wulan L.</strong><span className="dim">{t('landing_profile_since')}</span></div>
                  <span className="pill t-silver">Silver</span>
                </div>
                <div className="lp-meter">
                  <div className="meter-top"><span>{t('landing_profile_toward_gold')}</span><span>{t('landing_profile_gold_count')}</span></div>
                  <Seg n={14} on={9} c="ubi" />
                </div>
                <dl className="stats">
                  <div><dt>{t('landing_profile_stat_testing')}</dt><dd data-count={12}>12</dd></div>
                  <div><dt>{t('landing_profile_stat_done')}</dt><dd data-count={9}>9</dd></div>
                  <div><dt>{t('landing_profile_stat_verified')}</dt><dd data-count={8}>8</dd></div>
                </dl>
                <p className="sample-tag">{t('landing_profile_sample')}</p>
              </article>
            </div>
          </div>
        </section>

        <Proof />

        <section className="lp-sec join theme-light" id="gabung" aria-labelledby="gabung-h">
          <div className="lp-wrap">
            <p className="lp-hud"><b aria-hidden="true">05</b>{t('landing_hud_join')}</p>
            <h2 id="gabung-h">{t('landing_h2_join')}</h2>
            <ol className="steps rv">
              <li>
                <span className="n" aria-hidden="true">1</span>
                <h3>{t('landing_step1_h')}</h3>
                <p>{t('landing_step1_p1')}<b>{t('landing_step1_p_bold')}</b>{t('landing_step1_p2')}<code className="email">{COMMUNITY_GROUP}</code>{t('landing_step1_p3')}</p>
                <CopyEmail onCopied={say} />
              </li>
              <li>
                <span className="n" aria-hidden="true">2</span>
                <h3>{t('landing_step2_h')}</h3>
                <p>{t('landing_step2_p1')}<b>{t('landing_step2_p_bold')}</b>{t('landing_step2_p2')}</p>
              </li>
              <li>
                <span className="n" aria-hidden="true">3</span>
                <h3>{t('landing_step3_h')}</h3>
                <p>{t('landing_step3_p')}</p>
              </li>
            </ol>
            <div className="cta-row join-cta">
              <a className="lp-btn lp-btn--ink" href={COMMUNITY_GROUP_URL} target="_blank" rel="noopener noreferrer">{t('cta_open_group')}<span className="sr-only"> (Google Group, tab baru)</span></a>
              {signInBtn('lp-btn', true)}
              <a className="lp-btn lp-btn--wa" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><WaIcon />{t('cta_wa_community')}<span className="sr-only"> (tab baru)</span></a>
            </div>
            <p className="wa-note">{t('landing_wa_note')}</p>
            <div className="duty rv">
              <h3>{t('landing_duty_h')}</h3>
              <ul>
                <li><b>{t('landing_duty1_title')}</b><span>{t('landing_duty1_text')}</span></li>
                <li><b>{t('landing_duty2_title')}</b><span>{t('landing_duty2_text')}</span></li>
                <li><b>{t('landing_duty3_title')}</b><span>{t('landing_duty3_text')}</span></li>
                <li><b>{t('landing_duty4_title')}</b><span>{t('landing_duty4_text')}</span></li>
              </ul>
            </div>
            <div className="join-notes">
              <p>{t('landing_join_note1')}</p>
              <p>{t('landing_join_note2_pre')}<Link to="/apps">{t('landing_join_browse')}</Link></p>
            </div>
          </div>
        </section>

        <section className="lp-sec lp-sec--faq" id="faq" aria-labelledby="faq-h">
          <div className="lp-wrap">
            <p className="lp-hud"><b aria-hidden="true">06</b>{t('landing_hud_faq')}</p>
            <h2 id="faq-h">{t('landing_h2_faq')}</h2>
            <Faq reduced={reduced} />
            <p className="faq-more">{t('landing_faq_more_pre')}<Link to="/about">{t('landing_faq_more_link')}</Link>{t('landing_faq_more_post')}</p>
          </div>
        </section>
      </main>

      <StoryFooter page="home" />

      <button type="button" className="totop" ref={totopRef} aria-label={t('back_to_top')} onClick={toTop}><span aria-hidden="true">↑</span></button>
      <div className="lp-toast-region theme-light" role="status" aria-live="polite">
        <p className={`lp-toast${toastOn ? ' show' : ''}`}>{toast}</p>
      </div>
    </div>
  )
}
