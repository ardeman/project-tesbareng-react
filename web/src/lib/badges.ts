import type { BadgeTier } from './types'

// Badge tiers are computed by the profile_stats view (PRD FR-27g–l); the client only labels them.
// PRD §17 Q11 is open (Indonesian or English names). This is the single constant to change.
export const BADGE_LABELS: Record<Exclude<BadgeTier, 'none'>, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
}

/** Thresholds of FR-27h, for copy only; the view is the authority. */
export const BADGE_MIN: Record<Exclude<BadgeTier, 'none'>, number> = { bronze: 3, silver: 7, gold: 14, platinum: 25 }

const ORDER: BadgeTier[] = ['none', 'bronze', 'silver', 'gold', 'platinum']

export function nextTier(tier: BadgeTier): Exclude<BadgeTier, 'none'> | null {
  const next = ORDER[ORDER.indexOf(tier) + 1]
  return next && next !== 'none' ? next : null
}
