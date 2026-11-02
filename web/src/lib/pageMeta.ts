import { useEffect } from 'react'

const SUFFIX = 'TesBareng'

/** Per-page <title> and meta description (PRD DR-19). Restores the previous values on unmount,
 *  so leaving a page never leaves its title behind. */
export function usePageMeta(title: string, description?: string) {
  useEffect(() => {
    const prevTitle = document.title
    document.title = !title ? SUFFIX : title.includes(SUFFIX) ? title : `${title} · ${SUFFIX}`

    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const created = !meta
    const prevDesc = meta?.getAttribute('content') ?? null
    if (description) {
      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', description)
    }

    return () => {
      document.title = prevTitle
      if (!description || !meta) return
      if (created) meta.remove()
      else if (prevDesc !== null) meta.setAttribute('content', prevDesc)
    }
  }, [title, description])
}
