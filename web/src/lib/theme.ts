import { useCallback, useEffect, useState } from 'react'

const RM_QUERY = '(prefers-reduced-motion: reduce)'

/** Live `prefers-reduced-motion`: follows the OS setting if it changes while the page is open. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(RM_QUERY).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia(RM_QUERY)
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/* Theme: saved choice in localStorage `tb-theme`, otherwise the device setting.
   web/index.html applies the saved choice before first paint. */
const THEME_KEY = 'tb-theme'
const darkQuery = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null)
function readDark() {
  const t = document.documentElement.getAttribute('data-theme')
  return t ? t === 'dark' : !!darkQuery()?.matches
}
export function useTheme(reduced: boolean) {
  const [dark, setDark] = useState(readDark)
  useEffect(() => {
    const mq = darkQuery()
    if (!mq) return
    const on = () => setDark(readDark())
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const toggle = useCallback(() => {
    const next = readDark() ? 'light' : 'dark'
    const root = document.documentElement
    if (!reduced) {
      root.classList.add('theme-anim')
      window.setTimeout(() => root.classList.remove('theme-anim'), 320)
    }
    root.setAttribute('data-theme', next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* private mode: the choice lasts for this page only */ }
    setDark(next === 'dark')
  }, [reduced])
  return { dark, toggle }
}
