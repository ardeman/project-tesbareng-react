// Milestone check-ins (PRD §6.10, FR-39–41; contract: "Cohort milestones" and RPC `check_in`).
// The server enforces every rule; this file mirrors the window and due times so the panel can say
// "dibuka hari ke-5" instead of offering a button that would fail.
import { useRef } from 'react'
import { rows, rpc, useFetch } from './data'
import { supabase } from './supabase'

export type CheckInKind = 'used_app' | 'updated_build' | 'still_opted_in'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Window opens at base + N days (contract milestone table). `updated_build` opens when the build is logged. */
export const OPENS_DAY: Record<Exclude<CheckInKind, 'updated_build'>, number> = { used_app: 5, still_opted_in: 12 }
/** Cohort due times: base + N days; a build is due 72 h after it was logged. */
export const DUE_DAY: Record<Exclude<CheckInKind, 'updated_build'>, number> = { used_app: 7, still_opted_in: 13 }
const BUILD_DUE_MS = 72 * HOUR

export const CHECKIN_LABEL: Record<CheckInKind, string> = {
  used_app: 'Sudah buka app',
  updated_build: 'Sudah update',
  still_opted_in: 'Masih opt-in',
}

export interface CheckIn { id: string; kind: CheckInKind; buildId: string | null; createdAt: number }
export interface LoggedBuild { id: string; versionName: string; createdAt: number }

export interface CheckInState {
  checkIns: CheckIn[]
  /** `assigned_at` of my open assignment on this app in a non-closed cohort, else null (open pool). */
  assignedAt: number | null
  /** Builds of the app with their logged time (`created_at`), newest first. */
  builds: LoggedBuild[]
}

const EMPTY: CheckInState = { checkIns: [], assignedAt: null, builds: [] }
const ms = (v: string) => Date.parse(v)

/**
 * My check-ins, my cohort base and the app's build log times. No Realtime: I am the only writer,
 * so the caller refetches after a check-in (and `useFetch` refetches on focus). `buildsKey` changes
 * when the page's Realtime build list changes, so a newly logged build shows up here too.
 */
export function useCheckIns(appId: string | undefined, testerId: string | undefined, uid: string | null | undefined, buildsKey: string) {
  const live = useFetch<CheckInState>(
    appId && testerId && uid
      ? async () => {
          const [mine, assignments, builds] = await Promise.all([
            rows<Record<string, any>[]>(supabase.from('check_ins').select('id, kind, build_id, created_at').eq('tester_id', testerId)),
            rows<Record<string, any>[]>(
              supabase.from('assignments').select('assigned_at, cohorts!inner(status)')
                .eq('app_id', appId).eq('tester_user_id', uid).eq('state', 'open').neq('cohorts.status', 'closed')
                .order('assigned_at', { ascending: false }).limit(1),
            ),
            rows<Record<string, any>[]>(supabase.from('builds').select('id, version_name, created_at').eq('app_id', appId).order('created_at', { ascending: false })),
          ])
          return {
            checkIns: mine.map((r) => ({ id: r.id, kind: r.kind, buildId: r.build_id, createdAt: ms(r.created_at) })),
            assignedAt: assignments[0] ? ms(assignments[0].assigned_at) : null,
            builds: builds.map((r) => ({ id: r.id, versionName: r.version_name, createdAt: ms(r.created_at) })),
          }
        }
      : null,
    EMPTY, [appId, testerId, uid, buildsKey],
  )
  // `retry()` and a new `buildsKey` reload from scratch (loading + empty data). Keep showing the last
  // result for the same entry meanwhile, so rows never flip to skeletons and a focused row stays mounted.
  const entryKey = `${appId}|${testerId}|${uid}`
  const last = useRef<{ key: string; data: CheckInState } | null>(null)
  if (!live.loading && !live.error) last.current = { key: entryKey, data: live.data }
  const kept = live.loading && last.current?.key === entryKey ? last.current.data : null
  return kept ? { ...live, data: kept, loading: false } : live
}

export const checkIn = (appId: string, kind: CheckInKind, buildId?: string) =>
  rpc<string>('check_in', { p_app_id: appId, p_kind: kind, p_build_id: buildId ?? null })

// ---------- the milestone list the panel renders ----------

export interface Milestone {
  key: string
  kind: CheckInKind
  buildId?: string
  label: string
  /** Day number (from base) the window opens; null for builds. */
  opensDay: number | null
  opensAt: number
  /** Cohort due time; null in the open pool. */
  dueAt: number | null
  dueDay: number | null
  done: CheckIn | null
  open: boolean
  overdue: boolean
}

/**
 * Same base as the server: the open cohort assignment's `assigned_at`, else the entry's `opted_in_at` (FR-40).
 * Builds listed for "Sudah update" are the ones logged after the base (the ones a cohort counts as due),
 * plus any older build I already checked in on.
 */
export function milestones(s: CheckInState, optedInAt: number, now = Date.now()): { base: number; inCohort: boolean; items: Milestone[] } {
  const inCohort = s.assignedAt != null
  const base = s.assignedAt ?? optedInAt
  const doneOf = (kind: CheckInKind, buildId: string | null = null) =>
    s.checkIns.find((c) => c.kind === kind && c.buildId === buildId) ?? null

  const fixed = (kind: 'used_app' | 'still_opted_in'): Milestone => {
    const opensAt = base + OPENS_DAY[kind] * DAY
    const dueAt = inCohort ? base + DUE_DAY[kind] * DAY : null
    const done = doneOf(kind)
    return {
      key: kind, kind, label: CHECKIN_LABEL[kind], opensDay: OPENS_DAY[kind], opensAt,
      dueAt, dueDay: inCohort ? DUE_DAY[kind] : null, done,
      open: now >= opensAt, overdue: !done && dueAt != null && now > dueAt,
    }
  }

  const builds: Milestone[] = s.builds
    .filter((b) => b.createdAt > base || doneOf('updated_build', b.id))
    .map((b) => {
      const dueAt = inCohort ? b.createdAt + BUILD_DUE_MS : null
      const done = doneOf('updated_build', b.id)
      return {
        key: `build:${b.id}`, kind: 'updated_build', buildId: b.id, label: `${CHECKIN_LABEL.updated_build} ke ${b.versionName}`,
        opensDay: null, opensAt: b.createdAt, dueAt, dueDay: null, done, open: true, overdue: !done && dueAt != null && now > dueAt,
      }
    })

  return { base, inCohort, items: [fixed('used_app'), ...builds, fixed('still_opted_in')] }
}
