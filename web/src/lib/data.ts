import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { AdminTesterRow, AppDoc, BadgeTier, BuildDoc, EmailListing, EmailListingRow, PublicProfile, TesterDoc, TesterMethod, TesterStatus } from './types'

export interface Live<T> {
  data: T; loading: boolean; error: string | null
  /** Reload from scratch (skeletons show again). */
  retry: () => void
  /** Reload in the background, keeping the current rows (after a write, so focus and scroll survive). */
  refresh: () => void
}

// ---------- row mapping (the only place snake_case meets the UI) ----------

export type Row = Record<string, any>

const ms = (v: string | null | undefined) => (v ? Date.parse(v) : null)
/** A date column (YYYY-MM-DD) as 00:00 WIB, matching how the forms enter it. */
const dayMs = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00+07:00`).getTime() : null)

const APP_COLUMNS = '*, creator:profiles!apps_creator_id_fkey(display_name, photo_url)'

function toApp(r: Row, s: Row | undefined): AppDoc {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    optInUrl: r.opt_in_url,
    storeUrl: r.store_url,
    packageName: r.package_name,
    creatorUid: r.creator_id,
    creatorName: r.creator?.display_name ?? '',
    creatorPhotoURL: r.creator?.photo_url ?? null,
    status: r.status,
    testStartDate: dayMs(r.test_start_date),
    feedbackGuide: r.feedback_guide,
    testerMethod: r.tester_method ?? 'google_group',
    activeTesterCount: s?.active_tester_count ?? 0,
    eligibleCount: s?.eligible_count ?? 0,
    feedbackSentCount: s?.feedback_sent_count ?? 0,
    feedbackVerifiedCount: s?.feedback_verified_count ?? 0,
    repliedCount: s?.replied_count ?? 0,
    buildCount: s?.build_count ?? 0,
    lastBuildAt: ms(s?.last_build_at),
    creatorTestingCount: s?.creator_testing_count ?? 0,
    creatorFeedbackSentCount: s?.creator_feedback_sent_count ?? 0,
    creatorFeedbackVerifiedCount: s?.creator_feedback_verified_count ?? 0,
    creatorBadgeTier: s?.creator_badge_tier ?? 'none',
    createdAt: ms(r.created_at)!,
    updatedAt: ms(r.updated_at) ?? undefined,
    deleted: r.deleted,
    deletedAt: ms(r.deleted_at),
  }
}

const toTester = (r: Row): TesterDoc => ({
  id: r.id,
  appId: r.app_id,
  uid: r.user_id,
  displayName: r.display_name,
  photoURL: r.photo_url,
  maskedEmail: r.masked_email,
  optedInAt: ms(r.opted_in_at)!,
  leftAt: ms(r.left_at),
  status: r.status,
  addedBy: r.added_by,
  note: r.note,
  feedbackSent: r.feedback_sent,
  feedbackSentAt: ms(r.feedback_sent_at),
  feedbackSummary: r.feedback_summary,
  feedbackVerified: r.feedback_verified,
  replied: r.replied,
})

const toBuild = (r: Row): BuildDoc => ({
  id: r.id,
  versionName: r.version_name,
  uploadedAt: ms(r.uploaded_at)!,
  changelog: r.changelog,
})

// ---------- errors ----------

const CONTRACT_CODES = new Set([
  'unauthenticated', 'invalid-argument', 'not-found', 'permission-denied',
  'already-exists', 'failed-precondition', 'resource-exhausted',
])

/** Contract error code of a backend error (see docs/contract.md), or null for transport errors. */
export function errorCode(e: unknown): string | null {
  const err = e as { code?: string; hint?: string | null } | null
  if (err?.hint && CONTRACT_CODES.has(err.hint)) return err.hint
  switch (err?.code) {
    case '42501': return 'permission-denied'
    case '22P02': case '22007': case '22008': case '23502': case '23514': return 'invalid-argument'
    case '23505': return 'already-exists'
    case 'PGRST301': case 'PGRST302': return 'unauthenticated'
    default: return null
  }
}

/** The backend raises Indonesian messages; everything else gets a fixed sentence (raw Postgres text never reaches the UI). */
export function errorText(e: unknown) {
  const code = errorCode(e)
  const message = (e as { message?: string } | null)?.message
  if (code && (e as { hint?: string }).hint === code && message) return message
  switch (code) {
    case 'permission-denied': return 'Anda tidak punya izin untuk perubahan ini.'
    case 'invalid-argument': return 'Data yang dikirim tidak valid.'
    case 'already-exists': return 'Data ini sudah ada.'
    case 'unauthenticated': return 'Silakan masuk dengan akun Google dulu.'
  }
  if (e instanceof TypeError || /fetch|network/i.test(message ?? '')) return 'Server tidak bisa dihubungi. Coba lagi sebentar lagi.'
  if ((e as { name?: string } | null)?.name?.startsWith('Auth')) return 'Gagal masuk. Coba lagi.'
  return 'Terjadi kesalahan di server. Coba lagi sebentar lagi.'
}

export async function rows<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

// ---------- realtime (app detail only; one channel per app, shared by its hooks) ----------

type Table = 'apps' | 'testers' | 'builds'
const channels = new Map<string, { channel: RealtimeChannel; listeners: Set<(t: Table) => void> }>()

function onAppChange(appId: string, listener: (t: Table) => void) {
  let entry = channels.get(appId)
  if (!entry) {
    const listeners = new Set<(t: Table) => void>()
    const emit = (t: Table) => () => listeners.forEach((l) => l(t))
    const channel = supabase
      .channel(`app:${appId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apps', filter: `id=eq.${appId}` }, emit('apps'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'testers', filter: `app_id=eq.${appId}` }, emit('testers'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'builds', filter: `app_id=eq.${appId}` }, emit('builds'))
      .subscribe()
    entry = { channel, listeners }
    channels.set(appId, entry)
  }
  entry.listeners.add(listener)
  return () => {
    const e = channels.get(appId)
    if (!e) return
    e.listeners.delete(listener)
    if (e.listeners.size === 0) {
      channels.delete(appId)
      supabase.removeChannel(e.channel)
    }
  }
}

// ---------- read hooks ----------

interface FetchOptions {
  /** Refetch when this app's rows change (Realtime). */
  liveApp?: string
  liveTables?: Table[]
}

/**
 * Loads once, then refetches on window focus (and on Realtime changes for the detail page).
 * `loading` is true only until the first result, so refetches never flash skeletons.
 */
export function useFetch<T>(load: (() => Promise<T>) | null, initial: T, deps: unknown[], opts: FetchOptions = {}): Live<T> {
  const [state, setState] = useState<{ data: T; loading: boolean; error: string | null }>({ data: initial, loading: true, error: null })
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  const quietRef = useRef<() => void>(() => {})
  loadRef.current = load

  useEffect(() => {
    if (!loadRef.current) { setState({ data: initial, loading: false, error: null }); return }
    let alive = true
    let seq = 0
    const run = (initialLoad: boolean) => {
      const mine = ++seq
      if (initialLoad) setState((s) => ({ ...s, data: initial, loading: true, error: null }))
      loadRef.current!().then(
        (data) => { if (alive && mine === seq) setState({ data, loading: false, error: null }) },
        (err) => { if (alive && mine === seq) setState((s) => ({ ...s, loading: false, error: initialLoad || s.error ? errorText(err) : s.error })) },
      )
    }
    run(true)
    const refetch = () => run(false)
    quietRef.current = refetch
    const onFocus = () => { if (document.visibilityState === 'visible') refetch() }
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', onFocus)
    const off = opts.liveApp
      ? onAppChange(opts.liveApp, (t) => { if (!opts.liveTables || opts.liveTables.includes(t)) refetch() })
      : null
    return () => {
      alive = false
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', onFocus)
      off?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const retry = useCallback(() => setNonce((n) => n + 1), [])
  const refresh = useCallback(() => quietRef.current(), [])
  return { ...state, retry, refresh }
}

async function loadApps(filter: (q: any) => any): Promise<AppDoc[]> {
  const [apps, stats] = await Promise.all([
    rows<Row[]>(filter(supabase.from('apps').select(APP_COLUMNS).eq('deleted', false))),
    rows<Row[]>(supabase.from('app_stats').select('*')),
  ])
  const byId = new Map(stats.map((s) => [s.app_id, s]))
  return apps.map((a) => toApp(a, byId.get(a.id)))
}

export const useApps = () => useFetch(() => loadApps((q) => q), [] as AppDoc[], [])

export const useAppsBy = (uid?: string | null) =>
  useFetch(uid ? () => loadApps((q) => q.eq('creator_id', uid)) : null, [] as AppDoc[], [uid])

/** `data`: undefined while loading, null when missing (or soft-deleted for non-admins). */
export const useApp = (id?: string) =>
  useFetch<AppDoc | null | undefined>(
    id
      ? async () => {
          const [app, stats] = await Promise.all([
            rows<Row | null>(supabase.from('apps').select(APP_COLUMNS).eq('id', id).maybeSingle()),
            rows<Row | null>(supabase.from('app_stats').select('*').eq('app_id', id).maybeSingle()),
          ])
          return app ? toApp(app, stats ?? undefined) : null
        }
      : null,
    undefined, [id], { liveApp: id },
  )

export const useTesters = (appId?: string) =>
  useFetch(
    appId ? async () => (await rows<Row[]>(supabase.from('testers').select('*').eq('app_id', appId).order('opted_in_at'))).map(toTester) : null,
    [] as TesterDoc[], [appId], { liveApp: appId, liveTables: ['testers'] },
  )

export const useBuilds = (appId?: string) =>
  useFetch(
    appId ? async () => (await rows<Row[]>(supabase.from('builds').select('*').eq('app_id', appId).order('uploaded_at', { ascending: false }))).map(toBuild) : null,
    [] as BuildDoc[], [appId], { liveApp: appId, liveTables: ['builds'] },
  )

/** Every entry of one member across apps (Tugas saya, profile, nav badges). */
export const useEntriesOf = (uid?: string | null) =>
  useFetch(
    uid ? async () => (await rows<Row[]>(supabase.from('testers').select('*').eq('user_id', uid))).map(toTester) : null,
    [] as TesterDoc[], [uid],
  )

export const usePublicProfile = (uid?: string) =>
  useFetch<PublicProfile | null | undefined>(
    uid
      ? async () => {
          const [p, s] = await Promise.all([
            rows<Row | null>(supabase.from('profiles').select('*').eq('id', uid).maybeSingle()),
            rows<Row | null>(supabase.from('profile_stats').select('*').eq('profile_id', uid).maybeSingle()),
          ])
          if (!p) return null
          return {
            id: p.id,
            displayName: p.display_name,
            photoURL: p.photo_url,
            maskedEmail: p.masked_email,
            appsCreatedCount: s?.apps_created_count ?? 0,
            testingCount: s?.testing_count ?? 0,
            feedbackSentCount: s?.feedback_sent_count ?? 0,
            feedbackVerifiedCount: s?.feedback_verified_count ?? 0,
            appsTestedCount: s?.apps_tested_count ?? 0,
            badgeTier: s?.badge_tier ?? 'none',
            nextTierAt: s ? s.next_tier_at : 3,
            emailReminders: p.email_reminders ?? true,
            createdAt: ms(p.created_at) ?? undefined,
          }
        }
      : null,
    undefined, [uid],
  )

/** Badge tier per member, for tester tables (FR-27j). Manual entries (no user id) have none. */
export const useBadgesOf = (userIds: string[]) => {
  const key = [...new Set(userIds)].sort().join(',')
  return useFetch<Map<string, BadgeTier>>(
    key
      ? async () => {
          const r = await rows<Row[]>(supabase.from('profile_stats').select('profile_id, badge_tier').in('profile_id', key.split(',')))
          return new Map(r.map((x) => [x.profile_id as string, x.badge_tier as BadgeTier]))
        }
      : null,
    new Map(), [key],
  )
}

// ---------- admin reads (RLS lets the admin see soft-deleted apps; others get an empty list) ----------

/** Soft-deleted apps, newest deletion first (admin moderation: restore). */
export const useDeletedApps = (enabled: boolean) =>
  useFetch(
    enabled
      ? async () => {
          const [apps, stats] = await Promise.all([
            rows<Row[]>(supabase.from('apps').select(APP_COLUMNS).eq('deleted', true).order('deleted_at', { ascending: false })),
            rows<Row[]>(supabase.from('app_stats').select('*')),
          ])
          const byId = new Map(stats.map((s) => [s.app_id, s]))
          return apps.map((a) => toApp(a, byId.get(a.id)))
        }
      : null,
    [] as AppDoc[], [enabled],
  )

const TESTER_WITH_APP = '*, app:apps!testers_app_id_fkey(name, deleted)'
const toAdminTester = (r: Row): AdminTesterRow => ({ ...toTester(r), appName: r.app?.name ?? '', appDeleted: !!r.app?.deleted })

/** PostgREST `or` filters break on these characters; a search term never needs them. */
const cleanTerm = (q: string) => q.replace(/[,()*%\\:."']/g, ' ').trim().slice(0, 50)

/**
 * Admin moderation list. Empty query: the latest feedback summaries (the usual thing to moderate).
 * Otherwise: entries whose tester name or masked email matches, newest first. Capped at 50 rows.
 */
export const useTesterSearch = (query: string, enabled: boolean) => {
  const term = cleanTerm(query)
  return useFetch(
    enabled
      ? async () => {
          let q = supabase.from('testers').select(TESTER_WITH_APP)
          q = term
            ? q.or(`display_name.ilike.*${term}*,masked_email.ilike.*${term}*`).order('opted_in_at', { ascending: false })
            : q.not('feedback_summary', 'is', null).order('feedback_sent_at', { ascending: false, nullsFirst: false })
          return (await rows<Row[]>(q.limit(50))).map(toAdminTester)
        }
      : null,
    [] as AdminTesterRow[], [term, enabled],
  )
}

// ---------- writes (all through RPC) ----------

export async function rpc<T = null>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}

export interface AppInput {
  name: string
  description: string
  optInUrl: string
  storeUrl?: string
  packageName?: string
  testStartDate?: string
  feedbackGuide?: string
}

const appArgs = (input: AppInput & { testerMethod?: TesterMethod }) => ({
  p_name: input.name,
  p_description: input.description,
  p_opt_in_url: input.optInUrl,
  p_store_url: input.storeUrl || null,
  p_package_name: input.packageName || null,
  p_test_start_date: input.testStartDate || null,
  p_feedback_guide: input.feedbackGuide || null,
  p_tester_method: input.testerMethod ?? null,
})

/** A date picked in the form (YYYY-MM-DD) as the start of that day in WIB, whatever the device time zone. */
const localDay = (iso: string) => new Date(`${iso}T00:00:00+07:00`).toISOString()
/** Today's date means "now" (so the log can say "2 jam lalu"); an earlier date means 00:00 WIB that day. */
const instantFor = (iso: string) => {
  const now = new Date()
  const today = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jakarta' }).format(now)
  return iso === today ? now.toISOString() : localDay(iso)
}

export const api = {
  createApp: async (input: AppInput & { groupConfirmed: boolean; testerMethod: TesterMethod }) =>
    ({ appId: await rpc<string>('create_app', { ...appArgs(input), p_group_confirmed: input.groupConfirmed }) }),
  joinAsTester: async (input: { appId: string; checklist: { joinedGroup?: true; optedIn: true; installed: true } }) => {
    await rpc('join_as_tester', { p_app_id: input.appId, p_checklist: input.checklist })
    return { ok: true as const }
  },
  leaveTesting: async (input: { appId: string }) => {
    await rpc('leave_testing', { p_app_id: input.appId })
    return { ok: true as const }
  },
  markFeedbackSent: async (input: { appId: string; sent: boolean; summary?: string }) => {
    await rpc('mark_feedback_sent', { p_app_id: input.appId, p_sent: input.sent, p_summary: input.summary ?? null })
    return { ok: true as const }
  },
  addManualTester: async (input: { appId: string; displayName: string; email: string; optedInAt?: string }) =>
    ({
      testerId: await rpc<string>('add_manual_tester', {
        p_app_id: input.appId,
        p_display_name: input.displayName,
        p_email: input.email,
        p_opted_in_at: input.optedInAt ? localDay(input.optedInAt) : null,
      }),
    }),
  addBuild: async (input: { appId: string; versionName: string; uploadedAt: string; changelog: string }) =>
    ({
      buildId: await rpc<string>('add_build', {
        p_app_id: input.appId,
        p_version_name: input.versionName,
        p_uploaded_at: instantFor(input.uploadedAt),
        p_changelog: input.changelog,
      }),
    }),
}

// ---------- email-list testing (ADR-011) ----------

const toListing = (r: Row): EmailListing => ({ appId: r.app_id, uid: r.user_id, requestedAt: ms(r.requested_at)!, listedAt: ms(r.listed_at) })

/** The signed-in member's own request on an email-list app (null when none). */
export const useMyEmailListing = (appId?: string, uid?: string | null) =>
  useFetch(
    appId && uid
      ? async () => {
          const r = await rows<Row[]>(supabase.from('email_listings').select('*').eq('app_id', appId).eq('user_id', uid))
          return r[0] ? toListing(r[0]) : null
        }
      : null,
    null as EmailListing | null, [appId, uid],
  )

/** Creator only: requests with full addresses, to paste into Play Console. */
export const useEmailListings = (appId?: string, enabled = true) =>
  useFetch(
    appId && enabled
      ? async () => (await rpc<Row[]>('app_email_listings', { p_app_id: appId })).map((r): EmailListingRow => ({
          ...toListing({ ...r, app_id: appId }), displayName: r.display_name, photoURL: r.photo_url, email: r.email,
        }))
      : null,
    [] as EmailListingRow[], [appId, enabled], { liveApp: appId, liveTables: ['testers'] },
  )

export const requestEmailListing = (appId: string) => rpc('request_email_listing', { p_app_id: appId, p_consent: true })
export const cancelEmailListing = (appId: string) => rpc('cancel_email_listing', { p_app_id: appId })
export const markEmailListed = (appId: string, uid: string, listed: boolean) =>
  rpc('mark_email_listed', { p_app_id: appId, p_user_id: uid, p_listed: listed })

export const setEmailReminders = (enabled: boolean) => rpc('set_email_reminders', { p_enabled: enabled })

export const updateApp = (appId: string, input: AppInput & { status?: AppDoc['status']; testerMethod?: TesterMethod }) =>
  rpc('update_app', { p_app_id: appId, ...appArgs(input), p_status: input.status ?? null })

export const softDeleteApp = (appId: string) => rpc('delete_app', { p_app_id: appId })

export const restoreApp = (appId: string) => rpc('restore_app', { p_app_id: appId })

export interface TesterPatch {
  status?: TesterStatus
  optedInAt?: string
  note?: string
  feedbackVerified?: boolean
  replied?: boolean
}

/** Creator/admin edit. The server sets or clears left_at when the status changes. */
export function updateTesterAsCreator(_appId: string, t: TesterDoc, p: TesterPatch) {
  const patch: Record<string, unknown> = {}
  if (p.status && p.status !== t.status) patch.status = p.status
  if (p.optedInAt !== undefined) patch.opted_in_at = localDay(p.optedInAt)
  if (p.note !== undefined) patch.note = p.note.trim() || null
  if (p.feedbackVerified !== undefined) patch.feedback_verified = p.feedbackVerified
  if (p.replied !== undefined) patch.replied = p.replied
  return rpc('update_tester', { p_tester_id: t.id, p_patch: patch })
}

export interface ModerationPatch extends TesterPatch {
  feedbackSent?: boolean
  /** empty string clears the summary */
  feedbackSummary?: string
}

/**
 * Admin only (update_tester's admin keys). Turning feedback off also clears its time and summary,
 * the same as a tester un-marking it (mark_feedback_sent false); turning it on stamps the time once.
 */
export function updateTesterAsAdmin(t: TesterDoc, p: ModerationPatch) {
  const patch: Record<string, unknown> = {}
  if (p.status && p.status !== t.status) patch.status = p.status
  if (p.optedInAt !== undefined) patch.opted_in_at = localDay(p.optedInAt)
  if (p.note !== undefined) patch.note = p.note.trim() || null
  if (p.feedbackVerified !== undefined) patch.feedback_verified = p.feedbackVerified
  if (p.replied !== undefined) patch.replied = p.replied
  if (p.feedbackSummary !== undefined) patch.feedback_summary = p.feedbackSummary.trim() || null
  if (p.feedbackSent !== undefined && p.feedbackSent !== t.feedbackSent) {
    patch.feedback_sent = p.feedbackSent
    if (p.feedbackSent) patch.feedback_sent_at = new Date().toISOString()
    else { patch.feedback_sent_at = null; patch.feedback_summary = null; patch.feedback_verified = false }
  }
  return rpc('update_tester', { p_tester_id: t.id, p_patch: patch })
}

/** ADR-009 §2: does this member have an open to-do (the same rules as Tugas saya)? Used once, right after sign-in. */
export async function hasOpenTodos(uid: string, now = Date.now()): Promise<boolean> {
  const entries = (await rows<Row[]>(supabase.from('testers').select('*').eq('user_id', uid).eq('status', 'active'))).map(toTester)
  if (entries.length === 0) return false
  const ids = entries.map((e) => e.appId)
  const [apps, stats] = await Promise.all([
    rows<Row[]>(supabase.from('apps').select('id').in('id', ids).eq('deleted', false)),
    rows<Row[]>(supabase.from('app_stats').select('app_id, last_build_at').in('app_id', ids)),
  ])
  const live = new Set(apps.map((a) => a.id as string))
  const lastBuild = new Map(stats.map((s) => [s.app_id as string, ms(s.last_build_at)]))
  return entries.some((e) => {
    if (!live.has(e.appId)) return false
    if (!e.feedbackSent) return true
    const b = lastBuild.get(e.appId)
    return b != null && now - b < 3 * 86_400_000 && b > (e.feedbackSentAt ?? e.optedInAt)
  })
}
