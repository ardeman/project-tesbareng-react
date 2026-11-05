import { lazy, StrictMode, Suspense, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import './tokens.css'
import './styles.css'
import { NotFound, ToastProvider } from './components/bits'
import { Shell } from './components/Shell'
import { AuthProvider } from './lib/auth'
import { usePageMeta } from './lib/pageMeta'
// Each screen loads on demand (the landing never pays for work screens) to keep the main chunk under 150 KB gzip (ADR-001 budget).
const AppList = lazy(() => import('./pages/AppList').then((m) => ({ default: m.AppList })))
const AppDetail = lazy(() => import('./pages/AppDetail').then((m) => ({ default: m.AppDetail })))
const AppForm = lazy(() => import('./pages/AppForm').then((m) => ({ default: m.AppForm })))
const Cohorts = lazy(() => import('./pages/Cohorts'))
const Me = lazy(() => import('./pages/Me').then((m) => ({ default: m.Me })))
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })))
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })))
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
// Story surface (ADR-001, ADR-008 option A): its own chunk, so work screens never load its motion code.
const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<Suspense fallback={null}><Landing /></Suspense>} />
            <Route path="/about" element={<Suspense fallback={null}><About /></Suspense>} />
            <Route path="*" element={
              <Shell>
                <Suspense fallback={null}>
                <Routes>
                  <Route path="/apps" element={<AppList />} />
                  <Route path="/apps/new" element={<AppForm />} />
                  <Route path="/apps/:id" element={<AppDetail />} />
                  <Route path="/apps/:id/edit" element={<AppForm />} />
                  <Route path="/cohorts/:id?" element={<Cohorts />} />
                  <Route path="/me" element={<Me />} />
                  <Route path="/u/:uid" element={<Profile />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
                </Suspense>
              </Shell>
            } />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// BrowserRouter keeps the old scroll position on a link click; start each new page at the top,
// or at the #hash target (pages load lazily, so wait up to ~2 s for it to render).
// Back/forward (POP) keeps the browser's own behaviour.
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  const navType = useNavigationType()
  useLayoutEffect(() => {
    if (navType === 'POP') return
    if (!hash) { window.scrollTo(0, 0); return }
    const id = decodeURIComponent(hash.slice(1))
    let frame = 0
    let tries = 0
    const find = () => {
      const el = document.getElementById(id)
      if (el) el.scrollIntoView()
      else if (++tries < 120) frame = requestAnimationFrame(find)
    }
    find()
    return () => cancelAnimationFrame(frame)
  }, [pathname, hash, navType])
  return null
}

function NotFoundPage() {
  usePageMeta('Halaman tidak ditemukan')
  return <NotFound what="Halaman" />
}
