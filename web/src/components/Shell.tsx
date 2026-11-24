import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAppsBy, errorText } from '../lib/data'
import { useMyTodos } from '../lib/todos'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { Avatar, useToast } from './bits'
import { useReducedMotion, useTheme } from '../lib/theme'
import { useI18n, useT } from '../lib/i18n'
import { IconAdmin, IconApps, IconBook, IconClose, IconCohort, IconGoogle, IconMenu, IconSun, IconMoon, IconSignOut, IconTodo, IconUser, Mark } from './icons'

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { user, isAdmin, ready, signIn, signOut } = useAuth()
  const toast = useToast()
  const mine = useAppsBy(user?.uid)
  const owed = useMyTodos(user?.uid, isAdmin).total
  const menuBtn = useRef<HTMLButtonElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)
  const { dark, toggle: toggleTheme } = useTheme(useReducedMotion())
  const { locale, setLocale } = useI18n()
  const t = useT()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) closeBtn.current?.focus()
    else if (wasOpen.current) menuBtn.current?.focus()
    wasOpen.current = open
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const login = async () => {
    try { await signIn() } catch (e) { toast(errorText(e, t)) }
  }

  const toggles = (
    <div className="bottom-toggles">
      <button type="button" className="lp-sq" onClick={toggleTheme} aria-pressed={dark}
        title={dark ? t('dark_mode_on') : t('dark_mode_off')} aria-label={dark ? t('dark_mode_on') : t('dark_mode_off')}>
        {dark ? <IconMoon /> : <IconSun />}
        <span className="bottom-icon-label">{dark ? t('theme_dark') : t('theme_light')}</span>
      </button>
      {/* Face = current locale; title/aria = switch-to target (readable in that language). */}
      <button type="button" className="lp-sq" onClick={() => setLocale(locale === 'id' ? 'en' : 'id')}
        title={locale === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
        aria-label={locale === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}>
        <span style={{ fontWeight: 800, fontSize: 'var(--fs-caption)', letterSpacing: '0.08em' }} aria-hidden="true">
          {locale === 'id' ? 'ID' : 'EN'}
        </span>
      </button>
    </div>
  )

  return (
    <div className="app dark-ready">
      <a className="btn skip-link" href="#main" inert={open}>{t('skip_to_content')}</a>
      <header className="topbar" inert={open}>
        <Link to="/" className="brand"><Mark />TesBareng</Link>
        <span className="spacer" />
        <button ref={menuBtn} className="menu-toggle" aria-label={t('open_menu')} aria-expanded={open} aria-controls="nav" onClick={() => setOpen(true)}>
          <IconMenu />
        </button>
      </header>

      <aside id="nav" className={`sidebar ${open ? 'open' : ''}`} aria-label={t('nav_main_label')}>
        <div className="sidebar-head">
          <Link to="/" className="brand"><Mark />TesBareng</Link>
          <span className="spacer" />
          <button ref={closeBtn} className="menu-toggle close" aria-label={t('close_menu')} onClick={() => setOpen(false)}><IconClose /></button>
        </div>
        <p className="scope">{t('nav_community')} <a href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer">{COMMUNITY_GROUP.replace('@googlegroups.com', '')}</a></p>

        <nav className="nav-list primary" aria-label={t('nav_main_label')}>
          <NavLink to="/apps" end className="nav-item"><IconApps /><span className="label">{t('nav_apps')}</span></NavLink>
          <NavLink to="/cohorts" className="nav-item"><IconCohort /><span className="label">{t('nav_cohort')}</span></NavLink>
          <NavLink to="/me" className="nav-item"><IconTodo /><span className="label">{t('nav_tasks')}</span>{owed > 0 && <span className="count num">{owed > 99 ? '99+' : owed}<span className="sr-only"> {t('nav_tasks_pending', { n: owed })}</span></span>}</NavLink>
          {user && <NavLink to={`/u/${user.uid}`} className="nav-item"><IconUser /><span className="label">{t('nav_profile')}</span></NavLink>}
          <NavLink to="/about" className="nav-item"><IconBook /><span className="label">{t('nav_about')}</span></NavLink>
          {isAdmin && <NavLink to="/admin" className="nav-item"><IconAdmin /><span className="label">{t('nav_admin')}</span></NavLink>}
        </nav>

        {mine.data.length > 0 && (
          <>
            <p className="group-label">{t('my_apps_group')}</p>
            <nav className="nav-list" aria-label={t('my_apps_nav_label')}>
              {mine.data.map((a) => (
                <NavLink key={a.id} to={`/apps/${a.id}`} className="nav-item">
                  <span className="label">{a.name}</span>
                </NavLink>
              ))}
            </nav>
          </>
        )}

        <div className="bottom">
          {/* Two dense lines: [theme][lang], then account or Sign in with Google. */}
          {!ready ? toggles : (
            <div className="bottom-bar">
              {toggles}
              {user ? (
                <div className="user-row">
                  <Link to={`/u/${user.uid}`} className="user-info" title={t('view_profile')}>
                    <Avatar name={user.displayName ?? '?'} photo={user.photoURL} />
                    <span className="who"><b>{user.displayName ?? t('member_fallback')}</b></span>
                  </Link>
                  <button type="button" className="btn icon bottom-signout" onClick={() => { void signOut() }}
                    aria-label={t('sign_out')} title={t('sign_out')}>
                    <IconSignOut />
                    <span className="bottom-icon-label">{t('sign_out')}</span>
                  </button>
                </div>
              ) : (
                <button type="button" className="btn google-signin bottom-signin" onClick={login}>
                  <IconGoogle />
                  <span className="bottom-signin-label">{t('sign_in_google')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <main className="canvas" id="main" inert={open}>{children}</main>
    </div>
  )
}
