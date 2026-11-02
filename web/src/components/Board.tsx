import { Link } from 'react-router-dom'
import { TARGET_DAYS, TARGET_TESTERS } from '../lib/progress'
import type { TesterDoc } from '../lib/types'

interface Seat { tester: TesterDoc; days: number; eligible: boolean }

/** The 12 × 14 board: twelve seats down, fourteen days across. A full row is a tester Google counts. */
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
              <span className="seat-no">{i + 1}</span>
              {s.tester.uid ? <Link to={`/u/${s.tester.uid}`}><span>{s.tester.displayName}</span></Link> : <span>{s.tester.displayName}</span>}
            </span>
            <span className="board-days" aria-hidden="true">
              {days.map((d) => <i key={d} className={d < s.days ? 'on' : ''} />)}
            </span>
            <span className="board-tail">{s.days} hari</span>
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} role="listitem" className="board-row vacant" aria-label="Kursi kosong">
            <span className="board-name"><span className="seat-no">{top.length + i + 1}</span><span>{loading ? '' : 'Kursi kosong'}</span></span>
            <span className="board-days" aria-hidden="true">{days.map((d) => <i key={d} />)}</span>
            <span className="board-tail" />
          </div>
        ))}
      </div>
      <div className="board-axis" aria-hidden="true">
        <span />
        <div><span>hari 1</span><span>7</span><span>14</span></div>
        <span />
      </div>
      {seats.length > TARGET_TESTERS && (
        <figcaption className="board-more">{seats.length - TARGET_TESTERS} tester aktif lain ada di tabel di bawah.</figcaption>
      )}
    </figure>
  )
}
