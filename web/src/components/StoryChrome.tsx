import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { COMMUNITY_GROUP_URL, WHATSAPP_URL } from '../lib/community'
import { useReducedMotion, useTheme } from '../lib/theme'
import './story-chrome.css'

export { useReducedMotion }

/* Header and footer shared by the story surface (landing and /about). The homepage keeps its in-page anchors and scroll-spy;
   on /about the section links go to `/#id`. Keep the homepage markup in step with the static copy in web/index.html. */

/** Google sign-in with a visible failure state. */
export function useSignIn() {
  const { user, signIn } = useAuth()
  const [signInError, setSignInError] = useState(false)
  const startSignIn = () => { setSignInError(false); signIn().catch(() => setSignInError(true)) }
  return { user, signInError, startSignIn }
}

export function WaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.555 4.122 1.524 5.855L0 24l6.335-1.505A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.804 9.804 0 01-5.032-1.385l-.36-.214-3.762.894.953-3.667-.235-.376A9.798 9.798 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" /></svg>
  )
}

function MoonSun() {
  return (
    <>
      <svg className="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg>
      <svg className="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
    </>
  )
}

export const SECTIONS = [
  { id: 'cara-kerja', label: 'Cara kerja' },
  { id: 'transparansi', label: 'Transparansi' },
  { id: 'badge', label: 'Badge' },
  { id: 'faq', label: 'FAQ' },
]
const FOOT_SECTIONS = SECTIONS.filter((s) => s.id !== 'transparansi')

type HeaderProps = {
  page: 'home' | 'about'
  signIn: ReturnType<typeof useSignIn>
  /** Home only: the section currently in view (scroll-spy). */
  active?: string
  /** Home only: refs for the scroll chrome the landing drives itself. */
  headerRef?: RefObject<HTMLElement | null>
  fillRef?: RefObject<HTMLElement | null>
  brandRef?: RefObject<HTMLAnchorElement | null>
  /** Home only: scroll to a section in the page; return true when handled. */
  onAnchor?: (id: string) => boolean
}

export function StoryHeader({ page, signIn, active, headerRef, fillRef, brandRef, onAnchor }: HeaderProps) {
  const home = page === 'home'
  const reduced = useReducedMotion()
  const { dark, toggle } = useTheme(reduced)
  const { user, signInError, startSignIn } = signIn
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const ownRef = useRef<HTMLElement>(null)
  const barRef = headerRef ?? ownRef

  // Without the landing's own chrome: keep --hh (scroll offset) and the `scrolled` rule.
  useEffect(() => {
    if (home) return
    const bar = barRef.current
    if (!bar) return
    const root = document.documentElement
    const row = bar.firstElementChild as HTMLElement | null
    const setHH = () => root.style.setProperty('--hh', `${(row?.offsetHeight ?? bar.offsetHeight) + (parseFloat(getComputedStyle(bar).borderBottomWidth) || 0)}px`)
    setHH()
    const ro = 'ResizeObserver' in window ? new ResizeObserver(setHH) : null
    if (row) ro?.observe(row)
    const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { ro?.disconnect(); window.removeEventListener('scroll', onScroll); root.style.removeProperty('--hh') }
  }, [home, barRef])

  // Mobile menu: Esc closes it and returns focus to the button; closes when the layout gets wide.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); menuBtnRef.current?.focus() } }
    const wide = matchMedia('(min-width: 1101px)')
    const onWide = () => { if (wide.matches) setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWide)
    return () => { document.removeEventListener('keydown', onKey); wide.removeEventListener('change', onWide) }
  }, [menuOpen])

  const onSheetClick = (e: React.MouseEvent<HTMLElement>) => {
    const a = (e.target as Element).closest('a')
    if (!a) return
    setMenuOpen(false)
    const href = a.getAttribute('href') ?? ''
    if (home && href.startsWith('#') && onAnchor?.(href.slice(1))) {
      e.preventDefault()
      history.replaceState(null, '', href)
    }
  }

  const aboutProps = page === 'about' ? { 'aria-current': 'page' as const } : {}
  const signInBtn = user ? (
    <Link className="lp-btn lp-btn--nav" to="/me">Tugas saya</Link>
  ) : (
    <button type="button" className="lp-btn lp-btn--nav" onClick={startSignIn}><span>Masuk<span className="hide-xs"> dengan Google</span></span></button>
  )

  return (
    <div className="lp surface-story dark-ready story-chrome">
      <header className="lp-top" ref={barRef}>
        <div className="lp-wrap lp-top-row">
          <Link to="/" className="lp-brand" aria-label="TesBareng, beranda" ref={brandRef}><span className="lp-brand-box" aria-hidden="true" />TesBareng</Link>
          <nav className="lp-nav" aria-label="Utama">
            {SECTIONS.map((s) => home ? (
              <a key={s.id} className={`nl sec-link${active === s.id ? ' active' : ''}`} href={`#${s.id}`} aria-current={active === s.id ? 'location' : undefined}>{s.label}</a>
            ) : (
              <Link key={s.id} className="nl sec-link" to={`/#${s.id}`}>{s.label}</Link>
            ))}
            <Link className={`nl${page === 'about' ? ' active' : ''}`} to="/about" {...aboutProps}>Aturan main</Link>
            <Link className="nl" to="/apps">Daftar app</Link>
            <div className="nav-tools">
              {!user && <button type="button" className="lp-sq theme-btn" aria-pressed={dark} aria-label="Mode gelap" onClick={toggle}><MoonSun /></button>}
              {signInBtn}
              <button type="button" className="lp-sq menu-btn" ref={menuBtnRef} aria-expanded={menuOpen} aria-controls="lp-menu" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}><span /><span /><span /></button>
            </div>
          </nav>
        </div>
        <nav className="nav-sheet" id="lp-menu" aria-label="Menu" hidden={!menuOpen} onClick={onSheetClick}>
          {SECTIONS.map((s) => home ? (
            <a key={s.id} className={active === s.id ? 'active' : undefined} href={`#${s.id}`}>{s.label}</a>
          ) : (
            <Link key={s.id} to={`/#${s.id}`}>{s.label}</Link>
          ))}
          <Link className={page === 'about' ? 'active' : undefined} to="/about" {...aboutProps}>Aturan main</Link>
          <Link to="/apps">Daftar app</Link>
          {!user && <button type="button" className="sheet-theme" aria-pressed={dark} onClick={toggle}>
            <span>Mode gelap <small className="mono">{dark ? 'Nyala' : 'Mati'}</small></span><MoonSun />
          </button>}
        </nav>
        {home && <div className="lp-scrollbar" aria-hidden="true"><i ref={fillRef} /></div>}
        {signInError && (
          <p className="lp-wrap lp-alert" role="alert">Halaman masuk Google tidak bisa dibuka. Periksa koneksi, lalu coba lagi.</p>
        )}
      </header>
    </div>
  )
}

export function StoryFooter({ page }: { page: 'home' | 'about' }) {
  const home = page === 'home'
  return (
    <div className="lp surface-story dark-ready story-chrome">
      <footer className="lp-wrap lp-foot">
        <p className="foot-word" aria-hidden="true">TesBareng</p>
        <div className="foot-row">
          <span className="dim">Komunitas creator Android Indonesia. Bukan layanan resmi Google.</span>
          <nav aria-label="Kaki halaman">
            {FOOT_SECTIONS.map((s) => home ? <a key={s.id} href={`#${s.id}`}>{s.label}</a> : <Link key={s.id} to={`/#${s.id}`}>{s.label}</Link>)}
            <Link to="/about" aria-current={page === 'about' ? 'page' : undefined}>Aturan main</Link>
            <Link to="/apps">Daftar app</Link>
            <a href={COMMUNITY_GROUP_URL} target="_blank" rel="noopener noreferrer">Google Group<span className="sr-only"> (tab baru)</span></a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp<span className="sr-only"> (tab baru)</span></a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
