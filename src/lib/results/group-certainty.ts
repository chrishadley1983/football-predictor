import {
  computeGroupStandings,
  selectBestThirdPlaced,
  type MatchScore,
  type TeamRow,
} from '@/lib/results/standings'

// ============================================================================
// Group-stage certainty solver
// ----------------------------------------------------------------------------
// Works out, from the results SO FAR, what is mathematically GUARANTEED for each
// team — has it definitely qualified, is it definitely out, is its exact final
// position locked — so that points and colour-coding are only awarded once an
// outcome is certain (never on a still-changeable running standing).
//
// Method (per group): enumerate every win/draw/loss combination of the group's
// remaining matches; a fact only counts as certain if it holds in EVERY
// combination. Goal-difference tiebreaks among teams level on points are treated
// as able to fall either way (the remaining scorelines are unknown), so a result
// is only "certain" when it does not depend on a tiebreak — conservative, i.e.
// it may declare certainty a little late, but never wrongly.
//
// Third place (best-N across all groups) genuinely depends on every group's
// final table, so a 3rd-placed team's qualification is only resolved once ALL
// groups are complete — until then a would-be 3rd sits as "undecided".
// ============================================================================

export interface TeamCertainty {
  team_id: string
  /** Running standing within the group from results so far (1..n). */
  current_position: number
  /** Guaranteed to advance to the knockouts (clinched a top-2 spot, or a best-N 3rd once resolved). */
  qualified: boolean
  /** The team's exact final position is mathematically locked. */
  position_certain: boolean
  /** Guaranteed NOT to advance. */
  eliminated: boolean
}

export interface GroupInput {
  group_id: string
  team_ids: string[]
  /** All of this group's fixtures; unplayed ones have null scores. */
  matches: MatchScore[]
}

// Cap enumeration so a pathological early-stage group (lots of unplayed games)
// can't blow up — at that point nothing is clinched anyway.
const MAX_REMAINING = 12

function isComplete(matches: MatchScore[]): boolean {
  return matches.length > 0 && matches.every((m) => m.home_score != null && m.away_score != null)
}

/**
 * Per-group base certainty from enumerating remaining results. Does NOT resolve
 * the cross-group best-N third place (callers layer that on once all groups are
 * complete). A 3rd place from here is left qualified=false, eliminated=false.
 */
function computeGroupCertainty(
  input: GroupInput,
  teamCodeById: Map<string, string>,
  thirdPlaceCount: number
): TeamCertainty[] {
  const { team_ids: teamIds, matches } = input

  // Current running table (played matches only).
  const standings = computeGroupStandings(teamIds, teamCodeById, matches)
  const currentPosition = new Map(standings.map((s) => [s.team_id, s.final_position]))
  const currentPoints = new Map<string, number>(standings.map((s) => [s.team_id, s.row.points]))

  const remaining = matches.filter((m) => m.home_score == null || m.away_score == null)

  // A finished group has its final table locked (tiebreaks resolved by the
  // standings), so every position is certain — no enumeration needed. (Best-N
  // third place is still layered on cross-group by the caller.)
  if (remaining.length === 0) {
    return standings.map((s) => ({
      team_id: s.team_id,
      current_position: s.final_position,
      qualified: s.final_position <= 2,
      position_certain: true,
      eliminated: thirdPlaceCount > 0 ? s.final_position > 3 : s.final_position > 2,
    }))
  }

  // Aggregates across all enumerated outcomes.
  const worstRankMax = new Map<string, number>() // worst (highest) finishing rank possible
  const bestRankMin = new Map<string, number>() // best (lowest) finishing rank possible
  const lockedRank = new Map<string, number | null>() // single unambiguous rank, if always the same
  const posUncertain = new Set<string>() // rank was ambiguous in some outcome, or varied
  for (const id of teamIds) {
    worstRankMax.set(id, 0)
    bestRankMin.set(id, Infinity)
    lockedRank.set(id, null)
  }

  const tooMany = remaining.length > MAX_REMAINING
  const combos = tooMany ? 0 : Math.pow(3, remaining.length)

  for (let mask = 0; mask < combos; mask++) {
    const pts = new Map(currentPoints)
    let m = mask
    for (const rm of remaining) {
      const outcome = m % 3
      m = Math.floor(m / 3)
      if (outcome === 0) pts.set(rm.home_team_id, (pts.get(rm.home_team_id) ?? 0) + 3)
      else if (outcome === 1) {
        pts.set(rm.home_team_id, (pts.get(rm.home_team_id) ?? 0) + 1)
        pts.set(rm.away_team_id, (pts.get(rm.away_team_id) ?? 0) + 1)
      } else pts.set(rm.away_team_id, (pts.get(rm.away_team_id) ?? 0) + 3)
    }

    for (const x of teamIds) {
      const xp = pts.get(x) ?? 0
      let above = 0
      let equal = 0
      for (const y of teamIds) {
        if (y === x) continue
        const yp = pts.get(y) ?? 0
        if (yp > xp) above++
        else if (yp === xp) equal++
      }
      const bestRank = above + 1
      const worstRank = above + equal + 1
      worstRankMax.set(x, Math.max(worstRankMax.get(x)!, worstRank))
      bestRankMin.set(x, Math.min(bestRankMin.get(x)!, bestRank))
      if (bestRank !== worstRank) {
        posUncertain.add(x) // a tiebreak decides it -> not certain
      } else {
        const prev = lockedRank.get(x)!
        if (prev === null) lockedRank.set(x, bestRank)
        else if (prev !== bestRank) posUncertain.add(x)
      }
    }
  }

  return teamIds.map((id) => {
    if (tooMany) {
      return {
        team_id: id,
        current_position: currentPosition.get(id) ?? 0,
        qualified: false,
        position_certain: false,
        eliminated: false,
      }
    }
    const clinchedTop2 = worstRankMax.get(id)! <= 2
    const bestRank = bestRankMin.get(id)!
    // Eliminated = can't reach ANY qualifying spot. With no best-thirds only the
    // top 2 advance, so a guaranteed 3rd-or-lower is out; with best-thirds a team
    // that could still finish 3rd might yet sneak in (resolved cross-group once
    // every group is complete), so only a guaranteed 4th-or-lower is out here.
    const eliminated = thirdPlaceCount > 0 ? bestRank > 3 : bestRank > 2
    const positionCertain = !posUncertain.has(id) && lockedRank.get(id) !== null
    return {
      team_id: id,
      current_position: currentPosition.get(id) ?? 0,
      qualified: clinchedTop2,
      position_certain: positionCertain,
      eliminated,
    }
  })
}

/**
 * Certainty for every team across all groups. Resolves the best-N third place
 * once all groups are complete.
 */
export function computeGroupStageCertainty(
  groups: GroupInput[],
  teamCodeById: Map<string, string>,
  thirdPlaceCount: number
): Map<string, TeamCertainty> {
  const result = new Map<string, TeamCertainty>()

  for (const g of groups) {
    for (const c of computeGroupCertainty(g, teamCodeById, thirdPlaceCount)) result.set(c.team_id, c)
  }

  // Third place is a cross-group race — only resolvable when every group is done.
  const allComplete = groups.length > 0 && groups.every((g) => isComplete(g.matches))
  if (allComplete && thirdPlaceCount > 0) {
    const thirdRows: TeamRow[] = []
    for (const g of groups) {
      const standings = computeGroupStandings(g.team_ids, teamCodeById, g.matches)
      const third = standings.find((s) => s.final_position === 3)
      if (third) thirdRows.push(third.row)
    }
    const qualifyingThirds = selectBestThirdPlaced(thirdRows, thirdPlaceCount)
    for (const row of thirdRows) {
      const c = result.get(row.team_id)
      if (!c) continue
      // The group is complete, so its exact positions are already locked.
      if (qualifyingThirds.has(row.team_id)) {
        c.qualified = true
        c.eliminated = false
      } else {
        c.qualified = false
        c.eliminated = true
      }
    }
  }

  return result
}
