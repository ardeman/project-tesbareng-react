import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (p: P) => ({
  viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
})

export const IconApps = (p: P) => <svg {...base(p)}><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg>
export const IconTodo = (p: P) => <svg {...base(p)}><path d="M3 4.5l1.5 1.5L7 3.5M3 10.5l1.5 1.5L7 9.5M9.5 5h4M9.5 11h4" /></svg>
export const IconUser = (p: P) => <svg {...base(p)}><circle cx="8" cy="5.5" r="2.75" /><path d="M2.75 14c.6-2.6 2.7-4 5.25-4s4.65 1.4 5.25 4" /></svg>
export const IconBook = (p: P) => <svg {...base(p)}><path d="M2.5 3.5c2-.8 3.8-.6 5.5.6 1.7-1.2 3.5-1.4 5.5-.6v9c-2-.8-3.8-.6-5.5.6-1.7-1.2-3.5-1.4-5.5-.6zM8 4.1v9" /></svg>
export const IconPlus = (p: P) => <svg {...base(p)}><path d="M8 3v10M3 8h10" /></svg>
export const IconSearch = (p: P) => <svg {...base(p)}><circle cx="7" cy="7" r="4.25" /><path d="M10.25 10.25L13.5 13.5" /></svg>
export const IconMenu = (p: P) => <svg {...base(p)}><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" /></svg>
export const IconClose = (p: P) => <svg {...base(p)}><path d="M4 4l8 8M12 4l-8 8" /></svg>
export const IconExternal = (p: P) => <svg {...base(p)}><path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" /></svg>
export const IconBack = (p: P) => <svg {...base(p)}><path d="M10 3L5 8l5 5" /></svg>
export const IconSort = ({ dir, ...p }: P & { dir: 'asc' | 'desc' }) => <svg {...base(p)} width={12} height={12}><path d={dir === 'asc' ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} /></svg>

/** The TesBareng mark: twelve seats, most of them taken. */
export function Mark({ size = 24 }: { size?: number }) {
  const cells = Array.from({ length: 12 }, (_, i) => i)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {cells.map((i) => {
        const x = 2 + (i % 3) * 7
        const y = 1 + Math.floor(i / 3) * 5.75
        return <rect key={i} x={x} y={y} width="6" height="4.75" rx="1.2" fill={i < 8 ? 'var(--accent)' : 'var(--accent-track)'} />
      })}
    </svg>
  )
}

export const IconCheck = ({ double, ...p }: P & { double?: boolean }) => (
  <svg {...base(p)} width={double ? 18 : 14} height={14} viewBox={double ? '0 0 20 16' : '0 0 16 16'}>
    {double ? <path d="M1.5 8.5l3 3 6-7M8.5 11.5l1 0 6.5-7.5" /> : <path d="M3 8.5l3 3 7-7.5" />}
  </svg>
)
