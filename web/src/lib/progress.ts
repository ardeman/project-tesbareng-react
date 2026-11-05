import type { AppDoc, AppStatus, BuildDoc, TesterDoc, TesterStatus } from './types'

/** Google Play's requirement; also the default and maximum tester slots (ADR-012). */
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
  /** the app's tester slots (ADR-012): the progress target */
  target: number
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
    target: app.testerSlots,
    ready: eligible >= app.testerSlots,
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

// Dates are shown in WIB (CLAUDE.md), whatever the viewer's device time zone. Every string goes through Intl.
const TZ = 'Asia/Jakarta'
const DAY_MS = DAY
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ })
const shortFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: TZ })
const dayHeadFmt = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
/** YYYY-MM-DD in WIB (en-CA formats as ISO order). */
const isoFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ })
const rtf = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' })

export const fmtDate = (t?: number | null) => (t != null ? dateFmt.format(t) : '—')
export const fmtShort = (t?: number | null) => (t != null ? shortFmt.format(t) : '—')
/** Exact time for tooltips and long-press: "2 Nov 2026, 19.00 WIB". */
export const fmtDateTime = (t?: number | null) => (t != null ? `${dateTimeFmt.format(t)} WIB` : '—')
/** Day heading for grouped timelines: "Senin, 2 November 2026". */
export const fmtDayHeading = (t: number) => dayHeadFmt.format(t)
/** WIB calendar date (YYYY-MM-DD), for date inputs and day grouping. */
export const isoDate = (t?: number | null) => (t == null ? '' : isoFmt.format(t))
/** Today in WIB (YYYY-MM-DD). */
export const todayIso = () => isoDate(Date.now())
/** A WIB calendar date (YYYY-MM-DD) as the instant it starts (00:00 WIB). */
export const wibDayStart = (iso: string) => new Date(`${iso}T00:00:00+07:00`).getTime()

/** Whole WIB calendar days between two instants (today = 0, yesterday = 1). */
function calendarDays(t: number, now: number) {
  return Math.round((wibDayStart(isoDate(now)) - wibDayStart(isoDate(t))) / DAY_MS)
}

/** Relative time in Bahasa Indonesia via Intl: "2 jam lalu", "kemarin", "3 hari lalu", "bulan lalu". */
export function relTime(t?: number | null, now = Date.now()) {
  if (t == null) return '—'
  const diff = Math.max(0, now - t)
  const min = Math.floor(diff / 60_000)
  // Same-day events read in minutes or hours; older ones by WIB calendar day.
  if (min < 1) return rtf.format(0, 'second')
  if (min < 60) return rtf.format(-min, 'minute')
  const days = calendarDays(t, now)
  if (days === 0) return rtf.format(-Math.floor(min / 60), 'hour')
  if (days < 7) return rtf.format(-days, 'day')
  if (days < 30) return rtf.format(-Math.floor(days / 7), 'week')
  if (days < 365) return rtf.format(-Math.floor(days / 30), 'month')
  return rtf.format(-Math.floor(days / 365), 'year')
}
/** Day-level relative date ("hari ini", "kemarin", "3 hari lalu") for date-only values. */
export function relDay(t?: number | null, now = Date.now()) {
  if (t == null) return '—'
  const days = calendarDays(t, now)
  if (days < 7) return rtf.format(-days, 'day')
  return relTime(t, now)
}

/** A stable hue per person, kept out of the violet band. */
export function hueFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const hue = h % 300
  return hue >= 230 ? hue + 60 : hue
}
export const initial = (name: string) => (name.trim()[0] ?? '?').toUpperCase()

/** A future day count in words via Intl: 1 → "besok", 3 → "dalam 3 hari". */
export const inDays = (n: number) => new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' }).format(n, 'day')

/** ADR-012 §3: open seats = slots − Active testers; 0 or less means "Kursi penuh" (still joinable). */
export function openSeats(app: Pick<AppDoc, 'testerSlots' | 'activeTesterCount'>) {
  return app.testerSlots - app.activeTesterCount
}
