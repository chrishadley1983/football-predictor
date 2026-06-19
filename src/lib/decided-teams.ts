import type { GroupResult } from '@/lib/types'

/**
 * Returns the ids of teams whose group-stage fate is mathematically settled, so
 * the UI only colour-codes decided outcomes.
 *
 * Certainty now lives on `group_results` itself (computed by the certainty
 * solver in sync-results): a team is "decided" once it has clinched
 * qualification (`qualified`) or is mathematically out (`eliminated`). Anything
 * still in the balance stays neutral.
 */
export function computeDecidedTeamIds(groupResults: GroupResult[]): string[] {
  return groupResults.filter((r) => r.qualified || r.eliminated).map((r) => r.team_id)
}
