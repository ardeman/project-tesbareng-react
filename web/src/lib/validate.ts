import type { AppInput } from './data'

export const LIMITS = { name: 50, description: 280, feedbackGuide: 500 }
export const OPT_IN_PREFIX = 'https://play.google.com/apps/testing/'
export const STORE_PREFIX = 'https://play.google.com/store/apps/'

export type Errors = Partial<Record<keyof AppInput | 'groupConfirmed', string>>

export function validateApp(v: AppInput, opts: { creating: boolean; groupConfirmed: boolean }): Errors {
  const e: Errors = {}
  if (!v.name.trim()) e.name = 'Nama aplikasi wajib diisi.'
  else if (v.name.trim().length > LIMITS.name) e.name = `Maksimal ${LIMITS.name} karakter.`
  if (!v.description.trim()) e.description = 'Deskripsi singkat wajib diisi.'
  else if (v.description.trim().length > LIMITS.description) e.description = `Maksimal ${LIMITS.description} karakter.`
  if (!v.optInUrl.trim().startsWith(OPT_IN_PREFIX) || v.optInUrl.trim().length <= OPT_IN_PREFIX.length)
    e.optInUrl = `Harus link opt-in uji tertutup, diawali ${OPT_IN_PREFIX}`
  if (v.storeUrl?.trim() && !v.storeUrl.trim().startsWith(STORE_PREFIX)) e.storeUrl = `Harus diawali ${STORE_PREFIX}`
  if (v.packageName?.trim() && !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(v.packageName.trim())) e.packageName = 'Format nama paket seperti id.namadev.aplikasi'
  if ((v.feedbackGuide?.trim().length ?? 0) > LIMITS.feedbackGuide) e.feedbackGuide = `Maksimal ${LIMITS.feedbackGuide} karakter.`
  if (opts.creating && !opts.groupConfirmed) e.groupConfirmed = 'Centang dulu setelah grup ditambahkan di Play Console.'
  return e
}
