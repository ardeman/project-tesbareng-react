// Cohort chips shared by /cohorts and /cohorts/:id. Imported only from lazy pages, never from Shell or main,
// so it stays out of the main chunk. Glyph + text on every chip: status never by colour alone (ADR-001 §2.5).
import { useEffect, useRef, type RefObject } from 'react'
import { Chip } from './bits'
import type { CohortStatus, Standing } from '../lib/cohorts'

/**
 * Focus `target` once a dialog has closed. Calling focus() while the modal is still open loses it: the native
 * close() then hands focus back to the trigger, which often unmounts right after. Call `arm()` in the success
 * handler; the effect runs after the Dialog's own close effect (child effects run first).
 */
export function useFocusAfterClose(open: boolean, target: RefObject<HTMLElement | null>) {
  const pending = useRef(false)
  useEffect(() => {
    if (!open && pending.current) { pending.current = false; target.current?.focus() }
  }, [open, target])
  return () => { pending.current = true }
}

/** Forming = still gathering (white, "+"), Active = in progress (langit, "→", like "Sedang diuji"),
 *  Closed = finished (soft, "■"); not pandan, because a closed cohort can still have members who owe. */
const STATUS: Record<CohortStatus, { tone: 'putih' | 'langit' | 'soft'; glyph: string; label: string }> = {
  forming: { tone: 'putih', glyph: '+', label: 'Dibentuk' },
  active: { tone: 'langit', glyph: '→', label: 'Aktif' },
  closed: { tone: 'soft', glyph: '■', label: 'Selesai' },
}
export const CohortChip = ({ status }: { status: CohortStatus }) => (
  <Chip tone={STATUS[status].tone} glyph={STATUS[status].glyph}>{STATUS[status].label}</Chip>
)

/** Standing after close (FR-37): Baik = pandan (Good standing), Berutang = cabai (Owing), Lunas = settled by the admin. */
const STANDING: Record<Standing, { tone: 'pandan' | 'cabai' | 'putih'; glyph: string; label: string }> = {
  good: { tone: 'pandan', glyph: '✓', label: 'Baik' },
  owing: { tone: 'cabai', glyph: '!', label: 'Berutang' },
  settled: { tone: 'putih', glyph: '✓', label: 'Lunas' },
}
export const StandingChip = ({ standing }: { standing: Standing }) => (
  <Chip tone={STANDING[standing].tone} glyph={STANDING[standing].glyph}>{STANDING[standing].label}</Chip>
)
