/* Icons: Solar icon set, "linear" style, by 480 Design (https://www.figma.com/community/file/1166831539721848736),
   licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Paths copied unchanged from the Iconify
   `solar:*-linear` set (ADR-001 §2.6, DESIGN.md: one family only, drawn in ink at 20 / 24 px).
   The TesBareng Mark below is our own logo, not a Solar icon. */
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (p: P) => ({
  viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round' as const, 'aria-hidden': true, ...p,
})
const J = { strokeLinejoin: 'round' as const }

/** solar:widget-linear */
export const IconApps = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 6.5C2.5 4.61438 2.5 3.67157 3.08579 3.08579C3.67157 2.5 4.61438 2.5 6.5 2.5C8.38562 2.5 9.32843 2.5 9.91421 3.08579C10.5 3.67157 10.5 4.61438 10.5 6.5C10.5 8.38562 10.5 9.32843 9.91421 9.91421C9.32843 10.5 8.38562 10.5 6.5 10.5C4.61438 10.5 3.67157 10.5 3.08579 9.91421C2.5 9.32843 2.5 8.38562 2.5 6.5Z" />
    <path d="M13.5 17.5C13.5 15.6144 13.5 14.6716 14.0858 14.0858C14.6716 13.5 15.6144 13.5 17.5 13.5C19.3856 13.5 20.3284 13.5 20.9142 14.0858C21.5 14.6716 21.5 15.6144 21.5 17.5C21.5 19.3856 21.5 20.3284 20.9142 20.9142C20.3284 21.5 19.3856 21.5 17.5 21.5C15.6144 21.5 14.6716 21.5 14.0858 20.9142C13.5 20.3284 13.5 19.3856 13.5 17.5Z" />
    <path d="M2.5 17.5C2.5 15.6144 2.5 14.6716 3.08579 14.0858C3.67157 13.5 4.61438 13.5 6.5 13.5C8.38562 13.5 9.32843 13.5 9.91421 14.0858C10.5 14.6716 10.5 15.6144 10.5 17.5C10.5 19.3856 10.5 20.3284 9.91421 20.9142C9.32843 21.5 8.38562 21.5 6.5 21.5C4.61438 21.5 3.67157 21.5 3.08579 20.9142C2.5 20.3284 2.5 19.3856 2.5 17.5Z" />
    <path d="M13.5 6.5C13.5 4.61438 13.5 3.67157 14.0858 3.08579C14.6716 2.5 15.6144 2.5 17.5 2.5C19.3856 2.5 20.3284 2.5 20.9142 3.08579C21.5 3.67157 21.5 4.61438 21.5 6.5C21.5 8.38562 21.5 9.32843 20.9142 9.91421C20.3284 10.5 19.3856 10.5 17.5 10.5C15.6144 10.5 14.6716 10.5 14.0858 9.91421C13.5 9.32843 13.5 8.38562 13.5 6.5Z" />
  </svg>
)

/** solar:checklist-minimalistic-linear */
export const IconTodo = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z" />
    <path {...J} d="M6 15.8L7.14286 17L10 14" />
    <path {...J} d="M6 8.8L7.14286 10L10 7" />
    <path d="M13 9L18 9" />
    <path d="M13 16L18 16" />
  </svg>
)

/** solar:user-linear */
export const IconUser = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="6" r="4" />
    <path d="M20 17.5C20 19.9853 20 22 12 22C4 22 4 19.9853 4 17.5C4 15.0147 7.58172 13 12 13C16.4183 13 20 15.0147 20 17.5Z" />
  </svg>
)

/** solar:book-2-linear */
export const IconBook = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8C4 5.17157 4 3.75736 4.87868 2.87868C5.75736 2 7.17157 2 10 2H14C16.8284 2 18.2426 2 19.1213 2.87868C20 3.75736 20 5.17157 20 8V16C20 18.8284 20 20.2426 19.1213 21.1213C18.2426 22 16.8284 22 14 22H10C7.17157 22 5.75736 22 4.87868 21.1213C4 20.2426 4 18.8284 4 16V8Z" />
    <path d="M19.9997 16H7.89749C6.96751 16 6.50253 16 6.12103 16.1022C5.08575 16.3796 4.29986 17.1212 4.02246 18.1564" />
    <path d="M8 7H16" />
    <path d="M8 10.5H13" />
    <path d="M19.9239 19H8" />
  </svg>
)

/** solar:add-linear */
export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12L20 12" />
    <path d="M12.0204 4L12.0205 20.0003" />
  </svg>
)

/** solar:magnifier-linear */
export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11.5" cy="11.5" r="9.5" />
    <path d="M18.2173 18.2178L21.9999 22.0004" />
  </svg>
)

/** solar:hamburger-menu-linear */
export const IconMenu = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 7L4 7" />
    <path d="M20 12L4 12" />
    <path d="M20 17L4 17" />
  </svg>
)

/** solar:close-linear */
export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="M19.0068 5L5.00684 19" />
    <path d="M19 19L5 5" />
  </svg>
)

/** solar:square-arrow-right-up-linear */
export const IconExternal = (p: P) => (
  <svg {...base(p)}>
    <path {...J} d="M9 15L15 9M15 13.5V9H10.5" />
    <path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z" />
  </svg>
)

/** solar:arrow-left-linear */
export const IconBack = (p: P) => (
  <svg {...base(p)}>
    <path {...J} d="M20 12H4M10 18L4 12L10 6" />
  </svg>
)

/** solar:alt-arrow-up-linear / solar:alt-arrow-down-linear */
export const IconSort = ({ dir, ...p }: P & { dir: 'asc' | 'desc' }) => (
  <svg {...base(p)} width={16} height={16}>
    <path {...J} d={dir === 'asc' ? 'M19 15L12 9L5 15' : 'M19 9L12 15L5 9'} />
  </svg>
)

/** The TesBareng mark: twelve seats, eight of them taken. Ink only, so the logo spends no status colour. */
export function Mark({ size = 24 }: { size?: number }) {
  const cells = Array.from({ length: 12 }, (_, i) => i)
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {cells.map((i) => {
        const x = 1.5 + (i % 3) * 7.25
        const y = 1 + Math.floor(i / 3) * 5.75
        return <rect key={i} x={x} y={y} width="6" height="4.5" fill={i < 8 ? 'var(--ink)' : 'var(--putih)'} stroke="var(--ink)" strokeWidth="1.25" />
      })}
    </svg>
  )
}
