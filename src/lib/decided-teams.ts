import type { GroupResult } from '@/lib/types'

interface MinimalGroupMatch {
  group_id: string
  home_score: number | null
  away_score: number | null
}

/**
 * Returns the ids of teams whose group-stage fate is actually settled, so the
 * UI only colour-codes decided outcomes.
 *
 * `group_results` holds LIVE running standings mid-group: a row is written for
 * every team as soon as their group plays a match, with `qualified=false` until
 * the group finishes (see sync-results). Treating those rows as final makes
 * every team that has merely played look like it "did not qualify" (red).
 *
 * A team is "decided" when:
 *  - it has genuinely qualified (`qualified=true` — sync only sets this once
 *    qualification is real, including the best-3rd race), OR
 *  - it is genuinely eliminated: its group has played all its matches AND, for a
 *    3rd-placed team whose fate hinges on the best-3rd race, every group is
 *    complete.
 *
 * Anything else is mid-group and should render neutral.
 */
export function computeDecidedTeamIds(
  groupResults: GroupResult[],
  groupMatches: MinimalGroupMatch[],
  groupIds: string[]
): string[] {
  const matchesByGroup = new Map<string, MinimalGroupMatch[]>()
  for (const m of groupMatches) {
    const arr = matchesByGroup.get(m.group_id) ?? []
    arr.push(m)
    matchesByGroup.set(m.group_id, arr)
  }

  const isGroupComplete = (gid: string) => {
    const ms = matchesByGroup.get(gid) ?? []
    return ms.length > 0 && ms.every((m) => m.home_score != null && m.away_score != null)
  }

  const allGroupsComplete = groupIds.length > 0 && groupIds.every(isGroupComplete)

  return groupResults
    .filter((r) => {
      if (r.qualified) return true
      if (!isGroupComplete(r.group_id)) return false
      if (r.final_position === 3 && !allGroupsComplete) return false
      return true
    })
    .map((r) => r.team_id)
}
