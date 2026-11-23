import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { COMMUNITY_GROUP_URL, WHATSAPP_URL } from '../lib/community'
import { useI18n, useT } from '../lib/i18n'
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

export const SECTION_IDS = ['cara-kerja', 'transparansi', 'badge', 'faq'] as const
export type SectionId = typeof SECTION_IDS[number]
const FOOT_SECTION_IDS = SECTION_IDS.filter((id) => id !== 'transparansi')

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
  const { locale, setLocale } = useI18n()
  const t = useT()
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

  const sectionLabel = (id: string) => {
    if (id === 'cara-kerja') return t('nav_how')
    if (id === 'transparansi') return t('nav_transparency')
    if (id === 'badge') return t('nav_badge')
    if (id === 'faq') return t('nav_faq')
    return id
  }
  const aboutProps = page === 'about' ? { 'aria-current': 'page' as const } : {}
  const signInBtn = user ? (
    <Link className="lp-btn lp-btn--nav" to="/me">{t('nav_tasks')}</Link>
  ) : (
    <button type="button" className="lp-btn lp-btn--nav" onClick={startSignIn}><span>{t('sign_in_short')}<span className="hide-xs"> {t('sign_in_suffix')}</span></span></button>
  )

  return (
    <div className="lp surface-story dark-ready story-chrome">
      <header className="lp-top" ref={barRef}>
        <div className="lp-wrap lp-top-row">
          <Link to="/" className="lp-brand" aria-label={t('brand_home_label')} ref={brandRef}><span className="lp-brand-box" aria-hidden="true" />TesBareng</Link>
          <nav className="lp-nav" aria-label="Utama">
            {SECTION_IDS.map((id) => home ? (
              <a key={id} className={`nl sec-link${active === id ? ' active' : ''}`} href={`#${id}`} aria-current={active === id ? 'location' : undefined}>{sectionLabel(id)}</a>
            ) : (
              <Link key={id} className="nl sec-link" to={`/#${id}`}>{sectionLabel(id)}</Link>
            ))}
            <Link className={`nl${page === 'about' ? ' active' : ''}`} to="/about" {...aboutProps}>{t('nav_about')}</Link>
            <Link className="nl" to="/apps">{t('nav_apps')}</Link>
            <div className="nav-tools">
              {!user && <button type="button" className="lp-sq theme-btn" aria-pressed={dark} aria-label={dark ? t('dark_mode_on') : t('dark_mode_off')} onClick={toggle}><MoonSun /></button>}
              <button type="button" className="lp-sq theme-btn" onClick={() => setLocale(locale === 'id' ? 'en' : 'id')}
                title={locale === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
                aria-label={locale === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}>
                <span style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.08em' }} aria-hidden="true">{locale === 'id' ? 'ID' : 'EN'}</span>
              </button>
              {signInBtn}
              <button type="button" className="lp-sq menu-btn" ref={menuBtnRef} aria-expanded={menuOpen} aria-controls="lp-menu" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}><span /><span /><span /></button>
            </div>
          </nav>
        </div>
        <nav className="nav-sheet" id="lp-menu" aria-label="Menu" hidden={!menuOpen} onClick={onSheetClick}>
          {SECTION_IDS.map((id) => home ? (
            <a key={id} className={active === id ? 'active' : undefined} href={`#${id}`}>{sectionLabel(id)}</a>
          ) : (
            <Link key={id} to={`/#${id}`}>{sectionLabel(id)}</Link>
          ))}
          <Link className={page === 'about' ? 'active' : undefined} to="/about" {...aboutProps}>{t('nav_about')}</Link>
          <Link to="/apps">{t('nav_apps')}</Link>
          {!user && <button type="button" className="sheet-theme" aria-pressed={dark} onClick={toggle}>
            <span>{t('dark_mode_label')} <small className="mono">{dark ? t('dark_mode_on_short') : t('dark_mode_off_short')}</small></span><MoonSun />
          </button>}
          <button type="button" className="sheet-theme" onClick={() => setLocale(locale === 'id' ? 'en' : 'id')}>
            <span>{locale === 'id' ? 'Switch to English' : 'Ganti ke Indonesia'}</span>
            <span style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.08em' }} aria-hidden="true">{locale === 'id' ? 'ID' : 'EN'}</span>
          </button>
        </nav>
        {home && <div className="lp-scrollbar" aria-hidden="true"><i ref={fillRef} /></div>}
        {signInError && (
          <p className="lp-wrap lp-alert" role="alert">{t('sign_in_error')}</p>
        )}
      </header>
    </div>
  )
}

export function StoryFooter({ page }: { page: 'home' | 'about' }) {
  const home = page === 'home'
  const t = useT()
  const sectionLabel = (id: string) => {
    if (id === 'cara-kerja') return t('nav_how')
    if (id === 'badge') return t('nav_badge')
    if (id === 'faq') return t('nav_faq')
    return id
  }
  return (
    <div className="lp surface-story dark-ready story-chrome">
      <footer className="lp-wrap lp-foot">
        <p className="foot-word" aria-hidden="true">TesBareng</p>
        <div className="foot-row">
          <span className="dim">{t('footer_tagline')}</span>
          <nav aria-label={t('footer_nav_label')}>
            {FOOT_SECTION_IDS.map((id) => home ? <a key={id} href={`#${id}`}>{sectionLabel(id)}</a> : <Link key={id} to={`/#${id}`}>{sectionLabel(id)}</Link>)}
            <Link to="/about" aria-current={page === 'about' ? 'page' : undefined}>{t('nav_about')}</Link>
            <Link to="/apps">{t('nav_apps')}</Link>
            <a href={COMMUNITY_GROUP_URL} target="_blank" rel="noopener noreferrer">Google Group<span className="sr-only">{t('coh_new_tab')}</span></a>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp<span className="sr-only">{t('coh_new_tab')}</span></a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
