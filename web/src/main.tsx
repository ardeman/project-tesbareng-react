import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles.css'
import { NotFound, ToastProvider } from './components/bits'
import { Shell } from './components/Shell'
import { AuthProvider } from './lib/auth'
import { AppList } from './pages/AppList'
import { AppDetail } from './pages/AppDetail'
import { AppForm } from './pages/AppForm'
import { Me } from './pages/Me'
import { Profile } from './pages/Profile'
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/about" element={<Suspense fallback={null}><About /></Suspense>} />
            <Route path="*" element={
              <Shell>
                <Routes>
                  <Route path="/" element={<AppList />} />
                  <Route path="/apps/new" element={<AppForm />} />
                  <Route path="/apps/:id" element={<AppDetail />} />
                  <Route path="/apps/:id/edit" element={<AppForm />} />
                  <Route path="/me" element={<Me />} />
                  <Route path="/u/:uid" element={<Profile />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Shell>
            } />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

function NotFoundPage() { return <NotFound what="Halaman" /> }
