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

// ---------- dialogs (Catat build, Tambah tester manual): the server stays the authority (ADR-004) ----------
export const BUILD_LIMITS = { versionName: 40, changelog: 140 }
export const MANUAL_LIMITS = { displayName: 60 }

export interface BuildInput { versionName: string; uploadedAt: string; changelog: string }
export function validateBuild(v: BuildInput, today: string): Partial<Record<keyof BuildInput, string>> {
  const e: Partial<Record<keyof BuildInput, string>> = {}
  if (!v.versionName.trim()) e.versionName = 'Nama versi wajib diisi, misalnya 1.2.0 (14).'
  else if (v.versionName.trim().length > BUILD_LIMITS.versionName) e.versionName = `Maksimal ${BUILD_LIMITS.versionName} karakter.`
  if (!v.uploadedAt) e.uploadedAt = 'Pilih tanggal build diunggah ke Play Console.'
  else if (v.uploadedAt > today) e.uploadedAt = 'Tanggal unggah tidak boleh di masa depan.'
  if (!v.changelog.trim()) e.changelog = 'Tulis satu kalimat tentang apa yang berubah.'
  else if (v.changelog.trim().length > BUILD_LIMITS.changelog) e.changelog = `Maksimal ${BUILD_LIMITS.changelog} karakter.`
  return e
}

export interface ManualInput { displayName: string; email: string; optedInAt: string }
export function validateManual(v: ManualInput, today: string): Partial<Record<keyof ManualInput, string>> {
  const e: Partial<Record<keyof ManualInput, string>> = {}
  if (!v.displayName.trim()) e.displayName = 'Nama tester wajib diisi.'
  else if (v.displayName.trim().length > MANUAL_LIMITS.displayName) e.displayName = `Maksimal ${MANUAL_LIMITS.displayName} karakter.`
  if (!v.email.trim()) e.email = 'Email Google tester wajib diisi.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Format email belum benar, contoh: nama@gmail.com.'
  if (!v.optedInAt) e.optedInAt = 'Pilih tanggal tester opt-in.'
  else if (v.optedInAt > today) e.optedInAt = 'Tanggal opt-in tidak boleh di masa depan.'
  return e
}
