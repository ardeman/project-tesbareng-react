/** Soft local progress for the beginner join path (Group → Play Store → Catat).
 *  Survives tab switches to Google Group / Play; not a server source of truth. */

export const RESUME_JOIN_KEY = 'tb:resume-join'

export type GroupJoinProgress = {
  group?: boolean
  /** Play Store opened / installed (covers opt-in + install for google_group apps). */
  installed?: boolean
}

export type EmailJoinProgress = {
  optedIn?: boolean
  installed?: boolean
}

function progressKey(appId: string) {
  return `tb:join-progress:${appId}`
}

function readRaw(appId: string): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(progressKey(appId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function writeRaw(appId: string, next: Record<string, boolean>) {
  try {
    sessionStorage.setItem(progressKey(appId), JSON.stringify(next))
  } catch { /* storage blocked */ }
}

export function readGroupJoinProgress(appId: string): GroupJoinProgress {
  const o = readRaw(appId)
  // Legacy soft-progress used optedIn; treat it as installed so mid-flow users are not reset.
  return { group: !!o.group, installed: !!(o.installed || o.optedIn) }
}

/**
 * Soft session progress, plus the durable profile flag when signed in
 * (`profiles.joined_community_group`). Signed-out callers pass false/undefined.
 */
export function effectiveGroupJoinProgress(
  appId: string,
  joinedCommunityGroup?: boolean,
): GroupJoinProgress {
  const p = readGroupJoinProgress(appId)
  return joinedCommunityGroup ? { ...p, group: true } : p
}

export function writeGroupJoinProgress(appId: string, patch: GroupJoinProgress) {
  writeRaw(appId, { ...readRaw(appId), ...patch })
}

export function readEmailJoinProgress(appId: string): EmailJoinProgress {
  const o = readRaw(appId)
  return { optedIn: !!o.optedIn, installed: !!o.installed }
}

export function writeEmailJoinProgress(appId: string, patch: EmailJoinProgress) {
  writeRaw(appId, { ...readRaw(appId), ...patch })
}

export function clearJoinProgress(appId: string) {
  try { sessionStorage.removeItem(progressKey(appId)) } catch { /* ignore */ }
}

/** Remember to reopen the join wizard after Google OAuth returns to this app. */
export function markResumeJoin(appId: string) {
  try { sessionStorage.setItem(RESUME_JOIN_KEY, appId) } catch { /* storage blocked */ }
}

/** Read and clear the resume key. Returns the app id, or null. */
export function takeResumeJoin(): string | null {
  try {
    const id = sessionStorage.getItem(RESUME_JOIN_KEY)
    sessionStorage.removeItem(RESUME_JOIN_KEY)
    return id
  } catch {
    return null
  }
}

export function groupPlayStepsDone(p: GroupJoinProgress) {
  return !!(p.group && p.installed)
}

export function emailPlayStepsDone(p: EmailJoinProgress) {
  return !!(p.optedIn && p.installed)
}

/** Prefer the Play Store listing; fall back to opt-in for older apps that never set storeUrl. */
export function playInstallUrl(app: { storeUrl?: string | null; optInUrl?: string | null }) {
  const store = app.storeUrl?.trim()
  const optIn = app.optInUrl?.trim()
  return store || optIn || ''
}

export function isLiveApp(app: { status?: string }) {
  return app.status === 'live'
}

export function hasStoreUrl(app: { storeUrl?: string | null }) {
  return !!(app.storeUrl && app.storeUrl.trim())
}

/** Coarse mobile check — open Play Store in a new tab after the group step. */
export function isLikelyMobile() {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia('(pointer: coarse)').matches) return true
  } catch { /* ignore */ }
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** Open Play Store (or opt-in fallback). Returns false if the popup was blocked. */
export function openPlayInstall(app: { storeUrl?: string | null; optInUrl?: string | null }) {
  const url = playInstallUrl(app)
  if (!url) return false
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  return !!w
}
