/**
 * Badge emoji, name, and short description for display purposes.
 * Kept separate from achievements.ts to avoid importing server-only code in client components.
 */
export const BADGE_INFO: Record<
  string,
  { emoji: string; name: string; hint: string }
> = {
  perfect_group: { emoji: '\u2728', name: 'Perfect Group', hint: 'Nailed all positions in a group' },
  early_bird: { emoji: '\u23F0', name: 'Early Bird', hint: 'First to submit predictions' },
  last_minute: { emoji: '\uD83C\uDFC3', name: 'Last Minute', hint: 'Last to submit predictions' },
  lone_wolf: { emoji: '\uD83D\uDC3A', name: 'Lone Wolf', hint: 'Only player to get a pick right' },
  hive_mind: { emoji: '\uD83D\uDC1D', name: 'Hive Mind', hint: 'Most consensus predictions' },
  crystal_ball: { emoji: '\uD83D\uDD2E', name: 'Crystal Ball', hint: 'Predicted the tournament winner' },
  giant_killer: { emoji: '\u2694\uFE0F', name: 'Giant Killer', hint: 'Sole predictor of a knockout result' },
  hot_streak: { emoji: '\uD83D\uDD25', name: 'Hot Streak', hint: '5+ correct knockout picks in a row' },
  dead_heat: { emoji: '\uD83C\uDFAF', name: 'Dead Heat', hint: 'Tiebreaker within 5 goals' },
  contrarian: { emoji: '\uD83E\uDD84', name: 'Contrarian', hint: 'Most unique predictions overall' },
}

/** Ordered list for rendering legends */
export const BADGE_ORDER = [
  'perfect_group',
  'early_bird',
  'last_minute',
  'lone_wolf',
  'hive_mind',
  'crystal_ball',
  'giant_killer',
  'hot_streak',
  'dead_heat',
  'contrarian',
] as const
