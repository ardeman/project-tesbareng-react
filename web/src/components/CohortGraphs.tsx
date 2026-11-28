// Live assignment ring + milestone overview for the cohort page (work surface).
// Complements FR-38 matrix: ring answers “who tests whom”; bars answer “how far along”.
import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip, ErrorBox, Skel } from './bits'
import { useT } from '../lib/i18n'
import {
  type AssignmentStatus,
  type CellState,
  type CohortDetail,
  type CohortMember,
} from '../lib/cohorts'
type Pt = { x: number; y: number }

const C = 300
const OUTER_R = 250
const INNER_R = 78

const onCircle = (i: number, n: number, r: number): Pt => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1)
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) }
}

function curve(a: Pt, b: Pt, bow: number) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const cx = mx + (C - mx) * 0.3 + (-dy / len) * bow * len
  const cy = my + (C - my) * 0.3 + (dx / len) * bow * len
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

type EdgeKind = 'pending' | 'progress' | 'done' | 'left' | 'reassigned' | 'behind'

function edgeKind(s: AssignmentStatus): EdgeKind {
  if (s.isBehind && s.cell !== 'reassigned' && s.cell !== 'left') return 'behind'
  if (s.cell === 'reassigned') return 'reassigned'
  if (s.cell === 'left') return 'left'
  if (s.cell === 'feedback_sent' || s.cell === 'feedback_verified') return 'done'
  if (s.cell === 'opted_in' || s.cell === 'used') return 'progress'
  return 'pending'
}

type ProgressBucket = 'not_joined' | 'progress' | 'feedback_sent' | 'feedback_verified' | 'left'

function progressBucket(cell: CellState): ProgressBucket | null {
  if (cell === 'reassigned') return null
  if (cell === 'not_joined') return 'not_joined'
  if (cell === 'opted_in' || cell === 'used') return 'progress'
  if (cell === 'feedback_sent') return 'feedback_sent'
  if (cell === 'feedback_verified') return 'feedback_verified'
  if (cell === 'left') return 'left'
  return null
}

const BUCKET_ORDER: ProgressBucket[] = ['feedback_verified', 'feedback_sent', 'progress', 'not_joined', 'left']

export function CohortGraphs({
  c,
  status,
  loading,
  error,
  onRetry,
  myUid,
}: {
  c: CohortDetail
  status: AssignmentStatus[]
  loading: boolean
  error: string | null
  onRetry: () => void
  myUid?: string
}) {
  const t = useT()
  const creators = useMemo(
    () => [...c.members.filter((m) => m.appId != null)].sort((a, b) => {
      const ra = a.ringPosition ?? 9999
      const rb = b.ringPosition ?? 9999
      if (ra !== rb) return ra - rb
      return (a.displayName || '').localeCompare(b.displayName || '', 'id')
    }),
    [c.members],
  )
  const pures = useMemo(
    () => c.members.filter((m) => m.appId == null),
    [c.members],
  )

  if (creators.length === 0) return null

  if (error) {
    return (
      <section className="panel span-12" aria-labelledby="coh-graph-h">
        <header><h2 id="coh-graph-h">{t('coh_graph_h')}</h2></header>
        <ErrorBox text={t('coh_graph_load_error')} onRetry={onRetry} />
      </section>
    )
  }

  const started = c.status !== 'forming'

  return (
    <section className="panel span-12 coh-graph-panel" aria-labelledby="coh-graph-h">
      <header>
        <h2 id="coh-graph-h">{t('coh_graph_h')}</h2>
        {loading && <span className="meta">{t('loading')}</span>}
        {!loading && started && (
          <span className="meta num">{t('coh_graph_meta', { n: status.filter((s) => s.cell !== 'reassigned').length })}</span>
        )}
      </header>
      <p className="small muted coh-graph-lede">
        {started ? t('coh_graph_lede') : t('coh_graph_lede_forming')}
      </p>
      <div className="coh-graph-grid">
        <AssignmentRing
          creators={creators}
          pures={pures}
          status={started ? status : []}
          myUid={myUid}
          forming={!started}
        />
        {started ? (
          loading && status.length === 0
            ? <div className="coh-progress-skel"><Skel w="100%" h={120} /><Skel w="80%" h={16} /></div>
            : <ProgressOverview status={status} />
        ) : (
          <p className="small muted coh-progress-wait">{t('coh_graph_progress_wait')}</p>
        )}
      </div>
    </section>
  )
}

function AssignmentRing({
  creators,
  pures,
  status,
  myUid,
  forming,
}: {
  creators: CohortMember[]
  pures: CohortMember[]
  status: AssignmentStatus[]
  myUid?: string
  forming: boolean
}) {
  const t = useT()
  const titleId = useId()
  const descId = useId()
  const [focusUid, setFocusUid] = useState<string | null>(myUid ?? null)

  const appOwner = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of creators) if (c.appId) m.set(c.appId, c.userId)
    return m
  }, [creators])

  const nodes = useMemo(() => {
    const creatorPts = creators.map((m, i) => ({
      m,
      kind: 'creator' as const,
      pt: onCircle(i, creators.length, OUTER_R),
    }))
    const purePts = pures.map((m, i) => ({
      m,
      kind: 'pure' as const,
      pt: onCircle(i, Math.max(pures.length, 1), INNER_R),
    }))
    return [...creatorPts, ...purePts]
  }, [creators, pures])

  const byUid = useMemo(() => new Map(nodes.map((n) => [n.m.userId, n])), [nodes])

  const ties = useMemo(() => {
    const out: { key: string; d: string; kind: EdgeKind; from: string; to: string; cell: CellState }[] = []
    for (const s of status) {
      if (s.cell === 'reassigned') continue
      const ownerId = appOwner.get(s.appId)
      if (!ownerId || ownerId === s.testerId) continue
      const from = byUid.get(s.testerId)
      const to = byUid.get(ownerId)
      if (!from || !to) continue
      const bow = from.kind === 'pure' ? 0.04 : 0.07
      out.push({
        key: `${s.testerId}:${s.appId}`,
        d: curve(from.pt, to.pt, bow),
        kind: edgeKind(s),
        from: s.testerId,
        to: ownerId,
        cell: s.cell,
      })
    }
    return out
  }, [status, appOwner, byUid])

  const focus = focusUid && byUid.has(focusUid) ? focusUid : null
  const focusMember = focus ? byUid.get(focus)?.m : null
  const focusTies = focus ? ties.filter((x) => x.from === focus) : ties
  const focusDone = focusTies.filter((x) => x.kind === 'done').length
  const focusBehind = focusTies.filter((x) => x.kind === 'behind').length

  const toggleFocus = (uid: string) => setFocusUid((cur) => (cur === uid ? null : uid))

  return (
    <figure className="coh-ring">
      <svg
        viewBox="0 0 600 600"
        width="600"
        height="600"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        className="coh-ring-svg"
      >
        <title id={titleId}>{t('coh_ring_title')}</title>
        <desc id={descId}>
          {forming
            ? t('coh_ring_desc_forming', { creators: creators.length, pure: pures.length })
            : t('coh_ring_desc', {
                creators: creators.length,
                pure: pures.length,
                ties: ties.length,
              })}
        </desc>
        <g className="coh-ties" aria-hidden="true">
          {ties.map((x) => {
            const dim = focus != null && x.from !== focus
            return (
              <path
                key={x.key}
                className={`coh-tie coh-tie--${x.kind}${dim ? ' is-dim' : ''}`}
                d={x.d}
              />
            )
          })}
        </g>
        <g className="coh-nodes">
          {nodes.map(({ m, kind, pt }) => {
            const name = m.displayName || t('coh_members')
            const mine = m.userId === myUid
            const selected = m.userId === focus
            const label = mine ? `${name} (${t('coh_you')})` : name
            return (
              <g
                key={m.userId}
                className={`coh-node coh-node--${kind}${mine ? ' is-me' : ''}${selected ? ' is-focus' : ''}`}
                transform={`translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`}
              >
                <title>{label}{m.appName ? ` · ${m.appName}` : ''}</title>
                {kind === 'creator' ? (
                  <>
                    <rect className="coh-nshadow" x={-14} y={-14} width={34} height={34} aria-hidden="true" />
                    <rect className="coh-nbody" x={-17} y={-17} width={34} height={34} />
                  </>
                ) : (
                  <>
                    <circle className="coh-nshadow" cx={3} cy={3} r={17} aria-hidden="true" />
                    <circle className="coh-nbody" r={17} />
                  </>
                )}
                <text y={5} aria-hidden="true">{initials(name)}</text>
                {/* Transparent hit target; button semantics via surrounding HTML control below is hard in SVG — use focusable. */}
                <circle
                  className="coh-nhit"
                  r={22}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={t('coh_ring_focus', { name: label })}
                  onClick={() => toggleFocus(m.userId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleFocus(m.userId)
                    }
                  }}
                />
              </g>
            )
          })}
        </g>
      </svg>
      <figcaption className="coh-ring-legend">
        <span><i className="coh-lg-sq" aria-hidden="true" />{t('coh_ring_legend_creator')}</span>
        <span><i className="coh-lg-ci" aria-hidden="true" />{t('coh_ring_legend_pure')}</span>
        <span><i className="coh-lg-line coh-lg-pending" aria-hidden="true" />{t('coh_ring_legend_pending')}</span>
        <span><i className="coh-lg-line coh-lg-progress" aria-hidden="true" />{t('coh_ring_legend_progress')}</span>
        <span><i className="coh-lg-line coh-lg-done" aria-hidden="true" />{t('coh_ring_legend_done')}</span>
        <span><i className="coh-lg-line coh-lg-behind" aria-hidden="true" />{t('coh_ring_legend_behind')}</span>
      </figcaption>
      {focusMember && !forming && (
        <p className="coh-ring-focus small num" role="status">
          <Link className="link" to={`/u/${focusMember.userId}`}><b>{focusMember.displayName || t('coh_members')}</b></Link>
          {focusMember.userId === myUid && <> ({t('coh_you')})</>}
          {' · '}
          {t('coh_ring_focus_stats', { assigned: focusTies.length, done: focusDone, behind: focusBehind })}
          {' · '}
          <button type="button" className="link" onClick={() => setFocusUid(null)}>{t('coh_ring_clear_focus')}</button>
        </p>
      )}
      {forming && (
        <p className="small muted coh-ring-forming-note">{t('coh_ring_forming_note')}</p>
      )}
    </figure>
  )
}

function ProgressOverview({ status }: { status: AssignmentStatus[] }) {
  const t = useT()
  const counts = useMemo(() => {
    const c: Record<ProgressBucket, number> = {
      not_joined: 0, progress: 0, feedback_sent: 0, feedback_verified: 0, left: 0,
    }
    let behind = 0
    let open = 0
    for (const s of status) {
      const b = progressBucket(s.cell)
      if (!b) continue
      c[b]++
      open++
      if (s.isBehind) behind++
    }
    return { c, behind, open }
  }, [status])

  const { c, behind, open } = counts
  if (open === 0) {
    return <p className="small muted">{t('coh_graph_progress_empty')}</p>
  }

  const labels: Record<ProgressBucket, string> = {
    feedback_verified: t('coh_progress_verified'),
    feedback_sent: t('coh_progress_sent'),
    progress: t('coh_progress_in_progress'),
    not_joined: t('coh_progress_not_joined'),
    left: t('coh_progress_left'),
  }

  return (
    <div className="coh-progress">
      <h3 className="coh-progress-h">{t('coh_progress_h')}</h3>
      <p className="small muted">{t('coh_progress_lede')}</p>
      <div
        className="coh-stack"
        role="img"
        aria-label={t('coh_progress_aria', {
          verified: c.feedback_verified,
          sent: c.feedback_sent,
          progress: c.progress,
          not_joined: c.not_joined,
          left: c.left,
          behind,
          total: open,
        })}
      >
        {BUCKET_ORDER.map((key) => {
          const n = c[key]
          if (n === 0) return null
          return (
            <span
              key={key}
              className={`coh-stack-seg coh-stack--${key}`}
              style={{ flexGrow: n, flexBasis: 0 }}
              title={`${labels[key]}: ${n}`}
            >
              <span className="sr-only">{labels[key]}: {n}</span>
            </span>
          )
        })}
      </div>
      <ul className="coh-progress-legend num">
        {BUCKET_ORDER.map((key) => {
          const n = c[key]
          if (n === 0) return null
          return (
            <li key={key}>
              <i className={`coh-swatch coh-stack--${key}`} aria-hidden="true" />
              <span>{labels[key]}</span>
              <b>{n}</b>
            </li>
          )
        })}
      </ul>
      {behind > 0 && (
        <p className="coh-progress-behind">
          <Chip tone="cabai" glyph="!">{t('coh_progress_behind', { n: behind })}</Chip>
        </p>
      )}
      <p className="small muted num coh-progress-foot">
        {t('coh_progress_optin', {
          n: c.progress + c.feedback_sent + c.feedback_verified,
          total: open - c.left,
        })}
      </p>
    </div>
  )
}
