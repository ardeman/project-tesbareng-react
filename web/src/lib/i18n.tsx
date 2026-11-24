import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { id as idDict } from '../locales/id'
import { en as enDict } from '../locales/en'
import type { Keys } from '../locales/id'
import { setRelLocale } from './progress'

export type Locale = 'id' | 'en'

const STORAGE_KEY = 'tb-locale'

function getInitial(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'id' || stored === 'en') return stored
  } catch { /* private window */ }
  // Auto-detect: id-* → Indonesian, everything else → English
  return (navigator.language ?? '').startsWith('id') ? 'id' : 'en'
}

interface I18nCtx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: Keys, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx>(null!)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitial)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* private window */ }
  }, [])

  const t = useCallback<I18nCtx['t']>((key, vars) => {
    const dict = locale === 'en' ? enDict : idDict
    // Fall back to id if key missing in en (should not happen in practice)
    let str: string = dict[key] ?? idDict[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return str
  }, [locale])

  setRelLocale(locale)
  return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)
export const useT = () => useContext(Ctx).t
