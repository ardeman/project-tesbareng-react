import type { AppDoc, AppStatus, BuildDoc, TesterDoc, TesterStatus } from './types'

export const TARGET_TESTERS = 12
export const TARGET_DAYS = 14
export const TARGET_BUILDS = 3
export const NEW_BUILD_DAYS = 3
const DAY = 86_400_000

/** Whole days between two instants (floor), never negative. */
export function daysBetween(from: number, to: number) {
  return Math.max(0, Math.floor((to - from) / DAY))
}

/** FR-10: days from optedInAt to today, or to leftAt when the tester has left. */
export function daysActive(t: Pick<TesterDoc, 'optedInAt' | 'leftAt' | 'status'>, now = Date.now()) {
  const end = t.status !== 'active' && t.leftAt ? t.leftAt : now
  return daysBetween(t.optedInAt, end)
}

/** FR-11 */
export function isEligible(t: TesterDoc, now = Date.now()) {
  return t.status === 'active' && daysActive(t, now) >= TARGET_DAYS
}

export interface Progress {
  active: number
  eligible: number
  testDay: number | null
  feedbackSent: number
  feedbackVerified: number
  replied: number
  builds: number
  ready: boolean
  lowEngagement: boolean
  /** active testers sorted by days, most first */
  seats: { tester: TesterDoc; days: number; eligible: boolean }[]
}

export function computeProgress(app: AppDoc, testers: TesterDoc[], builds?: BuildDoc[], now = Date.now()): Progress {
  const active = testers.filter((t) => t.status === 'active')
  const seats = active
    .map((tester) => ({ tester, days: daysActive(tester, now), eligible: false }))
    .map((s) => ({ ...s, eligible: s.days >= TARGET_DAYS }))
    .sort((a, b) => b.days - a.days || a.tester.displayName.localeCompare(b.tester.displayName))
  const eligibleSeats = seats.filter((s) => s.eligible)
  const start = app.testStartDate ?? null
  const builds_ = builds
    ? builds.filter((b) => start == null || b.uploadedAt >= start - DAY).length
    : app.buildCount ?? 0
  const eligibleWithFeedback = eligibleSeats.filter((s) => s.tester.feedbackSent).length
  const eligible = eligibleSeats.length
  return {
    active: active.length,
    eligible,
    testDay: start == null ? null : daysBetween(start, now),
    feedbackSent: active.filter((t) => t.feedbackSent).length,
    feedbackVerified: active.filter((t) => t.feedbackVerified).length,
    replied: active.filter((t) => t.replied).length,
    builds: builds_,
    ready: eligible >= TARGET_TESTERS,
    lowEngagement: (eligible > 0 && eligibleWithFeedback < eligible / 2) || (active.length > 0 && builds_ === 0),
    seats,
  }
}

export function isNewBuild(app: Pick<AppDoc, 'lastBuildAt'>, now = Date.now()) {
  const t = app.lastBuildAt ?? null
  return t != null && now - t < NEW_BUILD_DAYS * DAY
}

export const appStatusLabel: Record<AppStatus, string> = {
  recruiting: 'Mencari tester',
  testing: 'Sedang diuji',
  applied: 'Ajukan produksi',
  live: 'Rilis produksi',
}
export const testerStatusLabel: Record<TesterStatus, string> = {
  active: 'Aktif',
  left: 'Berhenti',
  removed: 'Dikeluarkan',
}

// Dates are shown in WIB (CLAUDE.md), whatever the viewer's device time zone.
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
const shortFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
export const fmtDate = (t?: number | null) => (t != null ? dateFmt.format(t) : '—')
export const fmtShort = (t?: number | null) => (t != null ? shortFmt.format(t) : '—')
/** Local calendar date (YYYY-MM-DD) for date inputs. */
export const isoDate = (t?: number | null) => {
  if (t == null) return ''
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function relDays(t?: number | null, now = Date.now()) {
  if (t == null) return '—'
  const d = daysBetween(t, now)
  if (d === 0) return 'hari ini'
  if (d === 1) return 'kemarin'
  return `${d} hari lalu`
}

/** A stable hue per person, kept out of the violet band. */
export function hueFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const hue = h % 300
  return hue >= 230 ? hue + 60 : hue
}
export const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()
