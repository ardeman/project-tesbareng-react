import { useEffect } from 'react'

const SUFFIX = 'TesBareng'
const SITE = 'https://tesbareng.vercel.app'

export type PageMetaOptions = {
  /** Absolute or site-relative image URL for og:image / twitter:image. */
  image?: string
  /** Canonical page URL (defaults to current location when in the browser). */
  url?: string
}

function absUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) return href
  const origin = typeof window !== 'undefined' ? window.location.origin : SITE
  return `${origin}${href.startsWith('/') ? '' : '/'}${href}`
}

function setMeta(attr: 'name' | 'property', key: string, content: string): () => void {
  const selector = `meta[${attr}="${key}"]`
  let el = document.querySelector<HTMLMetaElement>(selector)
  const created = !el
  const prev = el?.getAttribute('content') ?? null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
  return () => {
    if (!el) return
    if (created) el.remove()
    else if (prev !== null) el.setAttribute('content', prev)
  }
}

/** Per-page <title>, meta description, and Open Graph / Twitter tags (PRD DR-19).
 *  Restores previous values on unmount. Crawlers that do not run JS still need the
 *  Vercel bot rewrite + /api/share/app for WhatsApp and similar. */
export function usePageMeta(title: string, description?: string, opts?: PageMetaOptions) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = !title ? SUFFIX : title.includes(SUFFIX) ? title : `${title} · ${SUFFIX}`

    const restores: Array<() => void> = []

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const createdDesc = !meta
    const prevDesc = meta?.getAttribute('content') ?? null
    if (description) {
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', description)
      restores.push(() => {
        if (!meta) return
        if (createdDesc) meta.remove()
        else if (prevDesc !== null) meta.setAttribute('content', prevDesc)
      })
    }

    const pageTitle = document.title
    const pageUrl = opts?.url ? absUrl(opts.url) : window.location.href.split('?')[0]!.split('#')[0]!
    const pageImage = opts?.image ? absUrl(opts.image) : undefined
    const pageDesc = description

    restores.push(setMeta('property', 'og:title', pageTitle))
    restores.push(setMeta('property', 'og:url', pageUrl))
    if (pageDesc) restores.push(setMeta('property', 'og:description', pageDesc))
    if (pageImage) {
      restores.push(setMeta('property', 'og:image', pageImage))
      restores.push(setMeta('name', 'twitter:image', pageImage))
    }
    restores.push(setMeta('name', 'twitter:title', pageTitle))
    if (pageDesc) restores.push(setMeta('name', 'twitter:description', pageDesc))

    return () => {
      document.title = prevTitle
      for (const r of restores) r()
    }
  }, [title, description, opts?.image, opts?.url])
}
