import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isLocalSupabase, supabase } from './supabase'
import type { AppUser, UserDoc } from './types'

interface AuthState {
  user: AppUser | null
  profile: UserDoc | null
  isAdmin: boolean
  ready: boolean
  /** Redirects to Google; the page reloads signed in at `returnTo` (default: the current URL). */
  signIn: (returnTo?: string) => Promise<never>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Password of the seeded local members (scripts/local.ts). Useless elsewhere: production has no email sign-in. */
const DEV_PASSWORD = 'tesbareng-local-only'

/**
 * Local only: `?devLogin=<seeded email>` signs in as that member so screens can be checked
 * without Google. Refuses to run unless the Supabase URL is 127.0.0.1/localhost.
 */
async function devLogin(current: Session | null) {
  if (!isLocalSupabase) return
  const email = new URLSearchParams(location.search).get('devLogin')?.trim().toLowerCase()
  if (!email || current?.user.email === email) return
  const { error } = await supabase.auth.signInWithPassword({ email, password: DEV_PASSWORD })
  if (error) console.warn(`devLogin ${email}: ${error.message}`)
}

function toUser(s: Session | null): AppUser | null {
  if (!s) return null
  const meta = s.user.user_metadata ?? {}
  return {
    uid: s.user.id,
    email: s.user.email ?? null,
    displayName: meta.full_name ?? meta.name ?? null,
    photoURL: meta.avatar_url ?? meta.picture ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserDoc | null>(null)
  const [ready, setReady] = useState(false)
  const uid = session?.user.id ?? null
  const email = session?.user.email ?? null

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      await devLogin(data.session).catch(() => {})
      if (!alive) return
      const { data: fresh } = await supabase.auth.getSession()
      setSession(fresh.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  // Refresh the public profile from the Google identity, then read role + name.
  useEffect(() => {
    if (!uid) { setProfile(null); return }
    let alive = true
    ;(async () => {
      await supabase.rpc('ensure_profile')
      const { data } = await supabase.from('profiles').select('display_name, photo_url, role').eq('id', uid).maybeSingle()
      if (alive) setProfile(data ? { email, displayName: data.display_name, photoURL: data.photo_url, role: data.role } : null)
    })().catch(() => { if (alive) setProfile(null) })
    return () => { alive = false }
  }, [uid, email])

  const signIn = useCallback(async (returnTo?: string): Promise<never> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // ADR-008: back to where the member came from; from the landing page, to the app list.
      options: { redirectTo: new URL(returnTo ?? (location.pathname === '/' ? '/apps' : location.href), location.origin).href },
    })
    if (error) throw error
    // The browser is leaving for Google; nothing after this should run.
    return new Promise<never>(() => {})
  }, [])
  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  const user = useMemo(() => toUser(session), [session])
  const value = useMemo(
    () => ({ user, profile, isAdmin: profile?.role === 'admin', ready, signIn, signOut }),
    [user, profile, ready, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
