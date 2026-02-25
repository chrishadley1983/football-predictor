/**
 * Badge emoji and name lookup for display purposes.
 * Kept separate from achievements.ts to avoid importing server-only code in client components.
 */
export const BADGE_INFO: Record<
  string,
  { emoji: string; name: string }
> = {
  perfect_group: { emoji: '\u2728', name: 'Perfect Group' },
  early_bird: { emoji: '\u23F0', name: 'Early Bird' },
  last_minute: { emoji: '\uD83C\uDFC3', name: 'Last Minute' },
  lone_wolf: { emoji: '\uD83D\uDC3A', name: 'Lone Wolf' },
  hive_mind: { emoji: '\uD83D\uDC1D', name: 'Hive Mind' },
  crystal_ball: { emoji: '\uD83D\uDD2E', name: 'Crystal Ball' },
  giant_killer: { emoji: '\u2694\uFE0F', name: 'Giant Killer' },
  hot_streak: { emoji: '\uD83D\uDD25', name: 'Hot Streak' },
  dead_heat: { emoji: '\uD83C\uDFAF', name: 'Dead Heat' },
  contrarian: { emoji: '\uD83E\uDD84', name: 'Contrarian' },
}
