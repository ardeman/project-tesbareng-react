import { Link } from 'react-router-dom'
import { TARGET_DAYS, TARGET_TESTERS } from '../lib/progress'
import type { TesterDoc } from '../lib/types'

interface Seat { tester: TesterDoc; days: number; eligible: boolean }

/** Colour key for the board; each swatch is named in text (status never by colour alone). */
export function BoardLegend() {
  return (
    <div className="legend" aria-hidden="true">
      <span><i className="pandan" />14 hari tercapai</span>
      <span><i className="langit" />Hari berjalan</span>
      <span><i className="soft" />Kursi kosong</span>
    </div>
  )
}

/** The 12 × 14 board: twelve seats down, fourteen days across, ruled like a sheet.
 *  A full pandan row is a tester Google counts; the tail repeats it as "✓ 14 hari". */
export function Board({ seats, loading }: { seats: Seat[]; loading: boolean }) {
  const top = seats.slice(0, TARGET_TESTERS)
  const empty = Math.max(0, TARGET_TESTERS - top.length)
  const days = Array.from({ length: TARGET_DAYS }, (_, i) => i)
  return (
    <figure>
      <div className="board" role="list" aria-label="Papan 12 kursi tester dan 14 hari">
        {top.map((s, i) => (
          <div key={s.tester.id} role="listitem" className={`board-row ${s.eligible ? 'eligible' : ''}`}
            aria-label={`${s.tester.displayName}: ${s.days} hari${s.eligible ? ', lulus 14 hari' : ''}`}>
            <span className="board-name">
              <span className="seat-no num">{i + 1}</span>
              {s.tester.uid ? <Link to={`/u/${s.tester.uid}`}>{s.tester.displayName}</Link> : <span>{s.tester.displayName}</span>}
            </span>
            <span className="board-days" aria-hidden="true">
              {days.map((d) => <i key={d} className={d < s.days ? 'on' : ''} />)}
            </span>
            <span className="board-tail num">{s.eligible && <span aria-hidden="true">✓ </span>}{Math.min(s.days, 999)}<span className="unit"> hari</span></span>
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} role="listitem" className="board-row vacant" aria-label="Kursi kosong">
            <span className="board-name"><span className="seat-no num">{top.length + i + 1}</span><span>{loading ? '' : 'Kursi kosong'}</span></span>
            <span className="board-days" aria-hidden="true">{days.map((d) => <i key={d} />)}</span>
            <span className="board-tail" />
          </div>
        ))}
      </div>
      <div className="board-axis num" aria-hidden="true">
        <span />
        <div><span>hari 1</span><span>7</span><span>14</span></div>
        <span />
      </div>
      {seats.length > TARGET_TESTERS && (
        <figcaption className="board-more num">{seats.length - TARGET_TESTERS} tester aktif lain ada di tabel di bawah.</figcaption>
      )}
    </figure>
  )
}
