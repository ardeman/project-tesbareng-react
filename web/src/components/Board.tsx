import { TARGET_DAYS, TARGET_TESTERS } from '../lib/progress'
import { useT } from '../lib/i18n'
import type { TesterDoc } from '../lib/types'

interface Seat { tester: TesterDoc; days: number; eligible: boolean }

/** Colour key for the board; each swatch is named in text (status never by colour alone). */
export function BoardLegend() {
  const t = useT()
  return (
    <div className="legend" aria-hidden="true">
      <span><i className="pandan" />{t('board_legend_counted')}</span>
      <span><i className="langit" />{t('board_legend_running')}</span>
      <span><i className="soft" />{t('board_legend_vacant')}</span>
    </div>
  )
}

/** The slots × 14 board (12 by default, ADR-012): one seat per slot down, fourteen days across, ruled like a sheet.
 *  Google counts a day only when every seat is active at once, so pandan fills the first `counted` columns of
 *  every row (the days of the last seat, 0 while seats are open); langit is a tester's own days beyond that.
 *  The tail still shows each tester's own days, "✓" once they pass 14. */
export function Board({ seats, loading, total = TARGET_TESTERS, counted = 0 }: { seats: Seat[]; loading: boolean; total?: number; counted?: number }) {
  const t = useT()
  const top = seats.slice(0, total)
  const empty = Math.max(0, total - top.length)
  const days = Array.from({ length: TARGET_DAYS }, (_, i) => i)
  return (
    <figure>
      <div className="board" role="list" aria-label={t('board_aria_figure', { total })}>
        {top.map((s, i) => {
          const eligibleSuffix = s.eligible
            ? (counted >= TARGET_DAYS ? t('board_aria_passed_14') : t('board_aria_eligible_stay'))
            : ''
          return (
          <div key={s.tester.id} role="listitem" className={`board-row ${s.eligible ? 'eligible' : ''}`}
            aria-label={t('board_aria_row', {
              name: s.tester.displayName,
              days: `${s.days}${t('board_aria_days_unit')}`,
              eligible: eligibleSuffix,
            })}>
            <span className="board-name">
              <span className="seat-no num">{i + 1}</span>
              {/* Plain text: rows are 24 px, too small to tap; the tester table below links each profile. */}
              <span>{s.tester.displayName}</span>
            </span>
            <span className="board-days" aria-hidden="true">
              {days.map((d) => <i key={d} className={d < counted ? 'count' : d < s.days ? 'on' : ''} />)}
            </span>
            <span className="board-tail num">{s.eligible && <span aria-hidden="true">✓ </span>}{Math.min(s.days, 999)}<span className="unit">{t('board_days_unit')}</span></span>
          </div>
          )
        })}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} role="listitem" className="board-row vacant" aria-label={t('board_vacant_label')}>
            <span className="board-name"><span className="seat-no num">{top.length + i + 1}</span><span>{loading ? '' : t('board_vacant_label')}</span></span>
            <span className="board-days" aria-hidden="true">{days.map((d) => <i key={d} />)}</span>
            <span className="board-tail" />
          </div>
        ))}
      </div>
      <div className="board-axis num" aria-hidden="true">
        <span />
        <div><span>{t('board_axis_day1')}</span><span>7</span><span>14</span></div>
        <span />
      </div>
      {seats.length > total && (
        <figcaption className="board-more num">{t('board_more_caption', { n: seats.length - total })}</figcaption>
      )}
    </figure>
  )
}