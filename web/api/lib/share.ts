/** Shared helpers for bot share HTML and OG image APIs (per-app social previews). */

export const SITE = 'https://tesbareng.vercel.app'
export const LANDING_TITLE = 'TesBareng: 12 tester, 14 hari, dikerjakan bareng'
export const LANDING_DESC =
  'Komunitas creator Android Indonesia yang saling ngetes app untuk closed test Google Play. Tugas dibagi rata lewat cohort, semua bisa melihat siapa sudah ngetes siapa.'
export const LANDING_IMAGE = `${SITE}/og/landing.png`

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const STATUS_LABEL: Record<string, string> = {
  recruiting: 'Mencari tester',
  testing: 'Sedang diuji',
  applied: 'Ajukan produksi',
  live: 'Rilis produksi',
}

export type ShareApp = {
  id: string
  name: string
  description: string
  status: string
  store_url: string | null
  package_name: string | null
  creator_name: string
}

export function isAppId(id: string | null | undefined): id is string {
  return !!id && UUID_RE.test(id)
}

export function originFrom(req: Request): string {
  const env = (typeof process !== 'undefined' && process.env.VITE_SITE_URL) || ''
  if (env) return env.replace(/\/$/, '')
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  if (host && !host.includes('localhost') && !host.startsWith('127.')) return `${proto}://${host}`
  return SITE
}

function supabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
  return { url, key }
}

export async function loadShareApp(id: string): Promise<ShareApp | null> {
  if (!isAppId(id)) return null
  const { url, key } = supabaseEnv()
  if (!url || !key) return null
  const endpoint =
    `${url}/rest/v1/apps` +
    `?select=id,name,description,status,store_url,package_name,creator:profiles!apps_creator_id_fkey(display_name)` +
    `&id=eq.${encodeURIComponent(id)}` +
    `&deleted=eq.false` +
    `&limit=1`
  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{
    id: string
    name: string
    description: string | null
    status: string
    store_url: string | null
    package_name: string | null
    creator: { display_name?: string } | { display_name?: string }[] | null
  }>
  const data = rows[0]
  if (!data) return null
  const creator = data.creator
  const creatorName = Array.isArray(creator)
    ? (creator[0]?.display_name ?? '')
    : (creator?.display_name ?? '')
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? '',
    status: data.status,
    store_url: data.store_url,
    package_name: data.package_name,
    creator_name: creatorName,
  }
}

export function storeListingUrl(app: Pick<ShareApp, 'store_url' | 'package_name'>): string | null {
  if (app.store_url && /^https:\/\/play\.google\.com\/store\/apps\//.test(app.store_url)) return app.store_url
  if (app.package_name) return `https://play.google.com/store/apps/details?id=${encodeURIComponent(app.package_name)}`
  return null
}

/** Play Store’s own og:image (app icon / feature graphic). Returns null if unreachable. */
export async function fetchPlayOgImage(listingUrl: string): Promise<string | null> {
  try {
    const res = await fetch(listingUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TesBarengBot/1.0; +https://tesbareng.vercel.app)',
        'Accept-Language': 'id,en;q=0.8',
      },
      redirect: 'follow',
    })
    if (!res.ok) return null
    const html = await res.text()
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    const src = m?.[1]?.trim()
    if (!src || !/^https?:\/\//i.test(src)) return null
    return src
  } catch {
    return null
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, ' ')
  if (t.length <= n) return t
  return t.slice(0, n - 1).trimEnd() + '…'
}

export function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'TB'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}
