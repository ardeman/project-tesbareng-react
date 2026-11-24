/** Soft, per-device flag: this member could not open the app on Play (wrong account or dead track).
 *  Not a server source of truth — creators do not see it until a later sync exists. */

function key(appId: string) {
  return `tb:play-unreachable:${appId}`
}

export function isPlayUnreachable(appId: string): boolean {
  try {
    return localStorage.getItem(key(appId)) === '1'
  } catch {
    return false
  }
}

export function markPlayUnreachable(appId: string) {
  try {
    localStorage.setItem(key(appId), '1')
  } catch { /* private mode */ }
}

export function clearPlayUnreachable(appId: string) {
  try {
    localStorage.removeItem(key(appId))
  } catch { /* ignore */ }
}
