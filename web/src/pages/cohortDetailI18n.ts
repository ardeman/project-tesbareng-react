import type { Keys } from '../locales/id'
import { CLOSE_DAY, LAST_JOIN_DAY, type CellState } from '../lib/cohorts'

type T = (key: Keys, vars?: Record<string, string | number>) => string

const CELL_KEYS: Record<CellState, Keys> = {
  not_joined: 'coh_cell_not_joined',
  left: 'coh_cell_left',
  opted_in: 'coh_cell_opted_in',
  used: 'coh_cell_used',
  feedback_sent: 'coh_cell_feedback_sent',
  feedback_verified: 'coh_cell_feedback_verified',
  reassigned: 'coh_cell_reassigned',
}

export const cellLabel = (t: T, cell: CellState) => t(CELL_KEYS[cell])

const SCHED_TITLE: Record<number, Keys> = {
  0: 'coh_sched_d0_title',
  2: 'coh_sched_d2_title',
  5: 'coh_sched_d5_title',
  7: 'coh_sched_d7_title',
  12: 'coh_sched_d12_title',
  13: 'coh_sched_d13_title',
  [CLOSE_DAY]: 'coh_sched_d21_title',
}

const SCHED_DETAIL: Record<number, Keys> = {
  0: 'coh_sched_d0_detail',
  2: 'coh_sched_d2_detail',
  5: 'coh_sched_d5_detail',
  7: 'coh_sched_d7_detail',
  12: 'coh_sched_d12_detail',
  13: 'coh_sched_d13_detail',
  [CLOSE_DAY]: 'coh_sched_d21_detail',
}

export function localizeScheduleStep(
  t: T,
  step: { day: number; title: string; detail: string },
  opts: { late: boolean; isCloseOverride?: boolean },
) {
  if (opts.isCloseOverride) {
    return { title: t('coh_sched_closed_title'), detail: t('coh_sched_closed_detail') }
  }
  const titleKey = SCHED_TITLE[step.day]
  const detailKey =
    opts.late && step.day === 7 ? 'coh_sched_late_d7_detail' : SCHED_DETAIL[step.day]
  return {
    title: titleKey ? t(titleKey) : step.title,
    detail: detailKey ? t(detailKey) : step.detail,
  }
}

export { LAST_JOIN_DAY }