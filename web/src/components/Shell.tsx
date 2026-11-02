import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useAppsBy, useEntriesOf, errorText } from '../lib/data'
import { COMMUNITY_GROUP, COMMUNITY_GROUP_URL } from '../lib/community'
import { Avatar, useToast } from './bits'
import { IconApps, IconBook, IconClose, IconMenu, IconTodo, IconUser, Mark } from './icons'

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { user, ready, signIn, signOut } = useAuth()
  const toast = useToast()
  const entries = useEntriesOf(user?.uid)
  const mine = useAppsBy(user?.uid)
  const owed = entries.data.filter((e) => e.status === 'active' && !e.feedbackSent).length

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
  }, [open])

  const login = async () => {
    try { await signIn() } catch (e) { toast(errorText(e)) }
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand"><Mark />TesBareng</Link>
        <span className="spacer" />
        <button className="menu-toggle" aria-label="Buka menu" aria-expanded={open} aria-controls="nav" onClick={() => setOpen(true)}>
          <IconMenu width={20} height={20} />
        </button>
      </header>

      <aside id="nav" className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigasi">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/" className="brand"><Mark />TesBareng</Link>
          <span style={{ flex: 1 }} />
          <button className="menu-toggle close" aria-label="Tutup menu" onClick={() => setOpen(false)}><IconClose width={20} height={20} /></button>
        </div>
        <p className="scope">Komunitas <a href={COMMUNITY_GROUP_URL} target="_blank" rel="noreferrer">{COMMUNITY_GROUP.replace('@googlegroups.com', '')}</a></p>

        <nav style={{ display: 'grid', gap: 2, marginTop: 24 }}>
          <NavLink to="/" end className="nav-item"><IconApps />Aplikasi</NavLink>
          <NavLink to="/me" className="nav-item"><IconTodo />Tugas saya{owed > 0 && <span className="count" aria-label={`${owed} feedback belum dikirim`}>{owed}</span>}</NavLink>
          {user && <NavLink to={`/u/${user.uid}`} className="nav-item"><IconUser />Profil saya</NavLink>}
          <NavLink to="/about" className="nav-item"><IconBook />Cara kerja</NavLink>
        </nav>

        {mine.data.length > 0 && (
          <>
            <p className="group-label">Aplikasi saya</p>
            <nav style={{ display: 'grid', gap: 2 }} aria-label="Aplikasi saya">
              {mine.data.map((a) => (
                <NavLink key={a.id} to={`/apps/${a.id}`} className="nav-item">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                </NavLink>
              ))}
            </nav>
          </>
        )}

        <div className="bottom">
          {!ready ? null : user ? (
            <>
              <Link to={`/u/${user.uid}`} className="user-row">
                <Avatar name={user.displayName ?? user.email ?? '?'} photo={user.photoURL} id={user.uid} />
                <span className="who"><b>{user.displayName ?? 'Anggota'}</b><span>Lihat profil</span></span>
              </Link>
              <button className="btn ghost sm" style={{ justifyContent: 'flex-start' }} onClick={() => signOut()}>Keluar</button>
            </>
          ) : (
            <button className="btn block" onClick={login}>Masuk dengan Google</button>
          )}
        </div>
      </aside>

      <main className="canvas" id="main">{children}</main>
    </div>
  )
}
