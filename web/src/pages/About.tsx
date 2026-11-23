import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePageMeta } from '../lib/pageMeta'
import { Link } from 'react-router-dom'
import { StoryHeader, StoryFooter, useSignIn } from '../components/StoryChrome'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { useT } from '../lib/i18n'
import './about.css'

/* /about: the full rules and how it works, PRD v2.2 (§1, §5–§6, §8). Story surface, same system as the landing.
   No photos: the page uses the product's own visual language (ruled sheets, chips, 12/14 counters, the ring). */

const TOC_IDS = [
  'syarat', 'ngetes', 'cohort', 'tester-murni', 'titik-cek', 'badge', 'pengingat', 'whatsapp', 'privasi', 'aturan',
] as const
const TOC_KEYS = [
  'about_toc_syarat', 'about_toc_ngetes', 'about_toc_cohort', 'about_toc_tester_murni', 'about_toc_titik_cek',
  'about_toc_badge', 'about_toc_pengingat', 'about_toc_whatsapp', 'about_toc_privasi', 'about_toc_aturan',
] as const

function Section({ id, n, title, lede, children }: { id: string; n: number; title: string; lede?: ReactNode; children: ReactNode }) {
  return (
    <section className="ab-sec" id={id} aria-labelledby={`${id}-h`}>
      <div className="ab-wrap ab-sec-grid">
        <div className="ab-sec-head">
          <p className="ab-label"><b>{String(n).padStart(2, '0')}</b></p>
          <h2 id={`${id}-h`}>{title}</h2>
          {lede && <p className="ab-lede">{lede}</p>}
        </div>
        <div className="ab-sec-body">{children}</div>
      </div>
    </section>
  )
}

function Segments({ n, label }: { n: number; label: string }) {
  return (
    <div className="ab-seg" style={{ ['--n' as string]: n }} role="img" aria-label={label}>
      {Array.from({ length: n }, (_, i) => <i key={i} />)}
    </div>
  )
}

function CopyEmail() {
  const t = useT()
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const id = setTimeout(() => setState('idle'), 2400)
    return () => clearTimeout(id)
  }, [state])
  const copy = async () => {
    try { await navigator.clipboard.writeText(COMMUNITY_GROUP); setState('ok') } catch { setState('fail') }
  }
  return (
    <span className="ab-copy">
      <button type="button" className={`ab-btn ab-btn--sm ${state === 'ok' ? 'is-ok' : ''}`} onClick={copy}>
        {state === 'ok' ? t('copy_email_ok') : t('copy_email_btn')}
      </button>
      <span className="ab-copy-status" role="status" aria-live="polite">
        {state === 'fail' ? t('copy_email_fail') : state === 'ok' ? t('copy_email_ok_status') : ''}
      </span>
    </span>
  )
}

/** Ring rule for cohorts above 16 apps: the member at position i tests i+1 … i+14 (PRD FR-32). Static. */
function RingRule() {
  const t = useT()
  const n = 20, k = 14, c = 160, r = 132
  const pt = (i: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) }
  }
  const me = pt(0)
  return (
    <figure className="ab-ring">
      <svg viewBox="0 0 320 320" width="320" height="320" role="img" aria-labelledby="ab-ring-t">
        <title id="ab-ring-t">{t('about_ring_title')}</title>
        {Array.from({ length: k }, (_, j) => {
          const p = pt(j + 1)
          return <line key={j} x1={me.x} y1={me.y} x2={p.x} y2={p.y} className="ab-ring-tie" />
        })}
        {Array.from({ length: n }, (_, i) => {
          const p = pt(i)
          const cls = i === 0 ? 'me' : i <= k ? 'on' : 'off'
          return (
            <g key={i} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} className={`ab-ring-node ${cls}`}>
              <rect x={-9} y={-9} width={18} height={18} />
            </g>
          )
        })}
      </svg>
      <figcaption>
        <span><i className="k me" aria-hidden="true" />{t('about_ring_legend_you')}</span>
        <span><i className="k on" aria-hidden="true" />{t('about_ring_legend_yours')}</span>
        <span><i className="k off" aria-hidden="true" />{t('about_ring_legend_others')}</span>
      </figcaption>
    </figure>
  )
}

const readHh = () => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hh'))
  return Number.isNaN(v) ? 72 : v
}

/** Inside the app shell there is no story header: the strip sticks under the mobile top bar, or at 0 on desktop. */
function useShellHh(on: boolean) {
  useEffect(() => {
    if (!on) return
    const root = document.documentElement
    const bar = document.querySelector<HTMLElement>('.topbar')
    const set = () => root.style.setProperty('--hh', `${bar?.offsetHeight ?? 0}px`)
    set()
    const ro = bar && 'ResizeObserver' in window ? new ResizeObserver(set) : null
    if (bar) ro?.observe(bar)
    window.addEventListener('resize', set)
    return () => { ro?.disconnect(); window.removeEventListener('resize', set); root.style.removeProperty('--hh') }
  }, [on])
}

type TocItem = { id: string; label: string }

/** Floating section strip: one scrollable row, shown once the 5x2 grid has scrolled away. Scroll-spy sets the current item. */
function TocStrip({ gridRef, toc }: { gridRef: React.RefObject<HTMLElement | null>; toc: TocItem[] }) {
  const t = useT()
  const [shown, setShown] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const [hh, setHh] = useState(readHh)
  useEffect(() => {
    let frame = 0
    const onResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setHh(readHh())) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(frame) }
  }, [])

  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(
      ([e]) => setShown(!e.isIntersecting && e.boundingClientRect.bottom < hh + 1),
      { rootMargin: `-${hh}px 0px 0px 0px` },
    )
    io.observe(grid)
    return () => io.disconnect()
  }, [gridRef, hh])

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const seen = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id)
        const cur = toc.find((x) => seen.has(x.id))
        if (cur) setActive(cur.id)
      },
      { rootMargin: `-${hh + 48 + 8}px 0px -60% 0px` },
    )
    toc.forEach((x) => { const el = document.getElementById(x.id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [hh, toc])

  useEffect(() => {
    const list = listRef.current
    const el = active ? list?.querySelector<HTMLElement>(`[aria-current]`) : null
    if (!list || !el) return
    const l = el.offsetLeft, r = l + el.offsetWidth
    if (l < list.scrollLeft) list.scrollLeft = l - 8
    else if (r > list.scrollLeft + list.clientWidth) list.scrollLeft = r - list.clientWidth + 8
  }, [active, shown])

  return (
    <nav className="ab-strip" aria-label={t('about_strip_aria')} hidden={!shown ? true : undefined}>
      <ol ref={listRef}>
        {toc.map((x, i) => (
          <li key={x.id}>
            <a href={`#${x.id}`} aria-current={active === x.id ? 'location' : undefined}>
              <span className="ab-toc-n num">{String(i + 1).padStart(2, '0')}</span>{x.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

const TIERS = [
  { name: 'Bronze', n: 3, cls: 't-bronze' },
  { name: 'Silver', n: 7, cls: 't-silver' },
  { name: 'Gold', n: 14, cls: 't-gold' },
  { name: 'Platinum', n: 25, cls: 't-platinum' },
]

/** `embedded`: rendered inside the app shell for signed-in members, so the shell supplies the nav, skip link and <main>. */
export function About({ embedded = false }: { embedded?: boolean }) {
  const t = useT()
  usePageMeta(t('about_meta_title'), t('about_meta_desc'))
  const signIn = useSignIn()
  const gridRef = useRef<HTMLElement>(null)
  useShellHh(embedded)
  const Main = embedded ? 'div' : 'main'

  const toc = useMemo(
    () => TOC_IDS.map((id, i) => ({ id, label: t(TOC_KEYS[i]) })),
    [t],
  )

  const schedule = useMemo(
    () => [
      { d: 0, t: t('about_sched0_t'), x: t('about_sched0_x') },
      { d: 2, t: t('about_sched2_t'), x: t('about_sched2_x') },
      { d: 7, t: t('about_sched7_t'), x: t('about_sched7_x') },
      { d: 13, t: t('about_sched13_t'), x: t('about_sched13_x') },
      { d: 21, t: t('about_sched21_t'), x: t('about_sched21_x') },
    ],
    [t],
  )

  const checks = useMemo(
    () => [
      { m: t('about_check1_m'), when: t('about_check1_when'), what: t('about_check1_what') },
      { m: t('about_check2_m'), when: t('about_check2_when'), what: t('about_check2_what') },
      { m: t('about_check3_m'), when: t('about_check3_when'), what: t('about_check3_what') },
      { m: t('about_check4_m'), when: t('about_check4_when'), what: t('about_check4_what') },
    ],
    [t],
  )

  const cohortFacts = useMemo(
    () => [
      { t: t('about_fact1_t'), d: t('about_fact1_d') },
      {
        t: t('about_fact2_t'),
        d: (
          <>
            {t('about_fact2_d1')}
            <span className="ab-chip c-cabai">{t('about_fact2_chip')}</span>
            {t('about_fact2_d2')}
          </>
        ),
      },
      { t: t('about_fact3_t'), d: t('about_fact3_d') },
      { t: t('about_fact4_t'), d: t('about_fact4_d') },
    ],
    [t],
  )

  const rules = useMemo(
    () => [
      {
        group: t('about_rules_tester_h'),
        items: [
          { t: t('about_rt1_t'), d: t('about_rt1_d') },
          { t: t('about_rt2_t'), d: t('about_rt2_d') },
          { t: t('about_rt3_t'), d: t('about_rt3_d') },
          { t: t('about_rt4_t'), d: t('about_rt4_d') },
        ],
      },
      {
        group: t('about_rules_creator_h'),
        items: [
          { t: t('about_rc1_t'), d: t('about_rc1_d', { community_group: COMMUNITY_GROUP }) },
          { t: t('about_rc2_t'), d: t('about_rc2_d') },
          { t: t('about_rc3_t'), d: t('about_rc3_d') },
          { t: t('about_rc4_t'), d: t('about_rc4_d') },
          { t: t('about_rc5_t'), d: t('about_rc5_d') },
          { t: t('about_rc6_t'), d: t('about_rc6_d') },
        ],
      },
    ],
    [t],
  )

  const tierNote = t('landing_tier_note_apps')

  return (
    <div className={`ab surface-story dark-ready${embedded ? ' ab--embedded' : ''}`}>
      {!embedded && <a className="ab-skip" href="#isi">{t('skip_to_content')}</a>}

      {!embedded && <StoryHeader page="about" signIn={signIn} />}

      <Main id="isi">
        <TocStrip gridRef={gridRef} toc={toc} />
        <div className="ab-wrap ab-hero">
          <p className="ab-label"><b>{t('about_hero_kicker')}</b>TesBareng</p>
          <h1>{t('about_hero_h1')}</h1>
          <p className="ab-lede">{t('about_hero_lede')}</p>
          <nav className="ab-toc" aria-label={t('about_toc_aria')} ref={gridRef}>
            <ol>
              {toc.map((x, i) => (
                <li key={x.id}><a href={`#${x.id}`}><span className="ab-toc-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{x.label}</a></li>
              ))}
            </ol>
          </nav>
        </div>

        <Section id="syarat" n={1} title={t('about_s1_title')} lede={t('about_s1_lede')}>
          <div className="ab-sheet">
            <div className="ab-meter">
              <div className="ab-meter-top"><span>{t('about_s1_meter_testers')}</span><span className="num">{t('about_s1_meter_testers_val')}</span></div>
              <Segments n={12} label={t('about_s1_seg_testers')} />
            </div>
            <div className="ab-meter">
              <div className="ab-meter-top"><span>{t('about_s1_meter_days')}</span><span className="num">{t('about_s1_meter_days_val')}</span></div>
              <Segments n={14} label={t('about_s1_seg_days')} />
            </div>
            <p className="ab-sheet-sub">{t('about_s1_engagement_sub')}</p>
            <ul className="ab-checks">
              <li><span className="ab-tick" aria-hidden="true">✓</span>{t('about_s1_check1')}</li>
              <li><span className="ab-tick" aria-hidden="true">✓</span>{t('about_s1_check2')}</li>
              <li><span className="ab-tick" aria-hidden="true">✓</span><span>{t('about_s1_check3')} <small>{t('about_s1_check3_note')}</small></span></li>
            </ul>
            <p className="ab-sheet-foot">{t('about_s1_foot')}</p>
          </div>
        </Section>

        <Section id="ngetes" n={2} title={t('about_s2_title')} lede={t('about_s2_lede')}>
          <ol className="ab-steps">
            <li>
              <span className="ab-step-n num" aria-hidden="true">1</span>
              <div>
                <h3>{t('about_step1_t')}</h3>
                <p>
                  {t('about_step1_d1')}
                  <b>{t('about_step1_d_bold')}</b>
                  {t('about_step1_d2')}
                  <code className="ab-email">{COMMUNITY_GROUP}</code>
                  {t('about_step1_d3')}
                </p>
                <CopyEmail />
              </div>
            </li>
            {([2, 3, 4, 5, 6] as const).map((i) => (
              <li key={i}>
                <span className="ab-step-n num" aria-hidden="true">{i}</span>
                <div>
                  <h3>{t(`about_step${i}_t` as const)}</h3>
                  <p>{t(`about_step${i}_d` as const)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="cohort" n={3} title={t('about_s3_title')} lede={t('about_s3_lede')}>
          <div className="ab-split">
            <div className="ab-card-flat">
              <h3>{t('about_s3_split_h')}</h3>
              <ul className="ab-rule-list">
                <li><b>{t('about_s3_rule1_t')}</b><span>{t('about_s3_rule1_d')}</span></li>
                <li><b>{t('about_s3_rule2_t')}</b><span>{t('about_s3_rule2_d')}</span></li>
                <li><b>{t('about_s3_rule3_t')}</b><span>{t('about_s3_rule3_d')}</span></li>
              </ul>
            </div>
            <RingRule />
          </div>
          <dl className="ab-facts">
            {cohortFacts.map((x) => (
              <div key={x.t}><dt>{x.t}</dt><dd>{x.d}</dd></div>
            ))}
          </dl>
          <ol className="ab-schedule" aria-label={t('about_schedule_aria')}>
            {schedule.map((x) => (
              <li key={x.d} className={x.d === 21 ? 'end' : undefined}>
                <p className="ab-day num"><small>{t('about_schedule_day')}</small>{x.d}</p>
                <p className="ab-day-t">{x.t}</p>
                <p className="ab-day-x">{x.x}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="tester-murni" n={4} title={t('about_s4_title')} lede={t('about_s4_lede')}>
          <ul className="ab-rule-list ab-rule-list--boxed">
            <li><b>{t('about_s4_rule1_t')}</b><span>{t('about_s4_rule1_d')}</span></li>
            <li><b>{t('about_s4_rule2_t')}</b><span>{t('about_s4_rule2_d')}</span></li>
            <li><b>{t('about_s4_rule3_t')}</b><span>{t('about_s4_rule3_d')}</span></li>
          </ul>
        </Section>

        <Section id="titik-cek" n={5} title={t('about_s5_title')} lede={t('about_s5_lede')}>
          <div className="ab-table" role="region" aria-label={t('about_s5_table_aria')} tabIndex={0}>
            <table>
              <thead><tr><th scope="col">{t('about_s5_col_milestone')}</th><th scope="col">{t('about_s5_col_when')}</th><th scope="col">{t('about_s5_col_what')}</th></tr></thead>
              <tbody>
                {checks.map((x) => (
                  <tr key={x.m}><th scope="row">{x.m}</th><td>{x.when}</td><td>{x.what}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ab-note">
            <span className="ab-chip c-pandan">{t('about_s5_chip')}</span>
            <p>{t('about_s5_verify_note')}</p>
          </div>
        </Section>

        <Section id="badge" n={6} title={t('about_s6_title')} lede={t('about_s6_lede')}>
          <ul className="ab-tiers">
            {TIERS.map((tier) => (
              <li key={tier.name}><span className={`ab-pill ${tier.cls}`}>{tier.name}</span><b className="num">{tier.n}</b><small>{tierNote}</small></li>
            ))}
          </ul>
          <ul className="ab-bullets">
            <li>{t('about_s6_bullet1')}</li>
            <li>{t('about_s6_bullet2')}</li>
            <li>{t('about_s6_bullet3')}</li>
            <li>{t('about_s6_bullet4')}</li>
          </ul>
        </Section>

        <Section id="pengingat" n={7} title={t('about_s7_title')} lede={t('about_s7_lede')}>
          <ul className="ab-rule-list ab-rule-list--boxed">
            <li><b className="num">{t('about_s7_rule1_t')}</b><span>{t('about_s7_rule1_d')}</span></li>
            <li>
              <b>{t('about_s7_rule2_t')}</b>
              <span>
                {t('about_s7_rule2_d1')}
                <Link to="/me">{t('nav_tasks')}</Link>
                {t('about_s7_rule2_d2')}
              </span>
            </li>
            <li><b>{t('about_s7_rule3_t')}</b><span>{t('about_s7_rule3_d')}</span></li>
          </ul>
        </Section>

        <Section id="whatsapp" n={8} title={t('about_s8_title')} lede={t('about_s8_lede')}>
          <ul className="ab-bullets">
            <li>{t('about_s8_b1')}</li>
            <li>{t('about_s8_b2')}</li>
            <li>{t('about_s8_b3')}</li>
          </ul>
        </Section>

        <Section id="privasi" n={9} title={t('about_s9_title')}>
          <div className="ab-privacy">
            <span className="ab-masked">bu*****@gmail.com</span>
            <ul className="ab-bullets">
              <li>{t('about_s9_b1')}</li>
              <li>{t('about_s9_b2')}</li>
              <li>{t('about_s9_b3')}</li>
            </ul>
          </div>
        </Section>

        <Section id="aturan" n={10} title={t('about_s10_title')}>
          <div className="ab-rules">
            {rules.map((g) => (
              <div key={g.group} className="ab-rule-group">
                <h3>{g.group}</h3>
                <ul>
                  {g.items.map((x) => (
                    <li key={x.t}><b>{x.t}</b><span>{x.d}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <section className="ab-cta" aria-labelledby="ab-cta-h">
          <div className="ab-wrap">
            <h2 id="ab-cta-h">{t('about_cta_h')}</h2>
            <p className="ab-lede">{t('about_cta_lede')}</p>
            <div className="ab-cta-row">
              <a className="ab-btn ab-btn--ink" href={COMMUNITY_GROUP_URL} target="_blank" rel="noopener noreferrer">
                {t('cta_join_community')}<span className="sr-only">{t('about_cta_group_sr')}</span><span aria-hidden="true"> ↗</span>
              </a>
              <Link className="ab-btn" to="/apps">{t('cta_see_apps')}</Link>
            </div>
          </div>
        </section>
      </Main>

      {!embedded && <StoryFooter page="about" />}
    </div>
  )
}