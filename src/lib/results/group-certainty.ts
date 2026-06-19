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
// combination. Teams level on points are separated by HEAD-TO-HEAD points first
// (the official 2026 tiebreaker, ahead of goal difference). Head-to-head between
// teams that have already played is fixed, so it resolves ties deterministically
// (this is why a team that has beaten its only rival for top spot can clinch
// first place even though goal difference is still in flux). Ties that come down
// to goal difference / goals scored depend on the unknown remaining scorelines,
// so they're treated as able to fall either way — conservative, never wrong.
//
// Third place (best-N across all groups) genuinely depends on every group's
// final table, so a 3rd-placed team's qualification is only resolved once ALL
// groups are complete.
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

type Outcome = { a: string; b: string; res: 'A' | 'B' | 'D' } // A = home win, B = away win, D = draw

function isComplete(matches: MatchScore[]): boolean {
  return matches.length > 0 && matches.every((m) => m.home_score != null && m.away_score != null)
}

/**
 * For one set of match outcomes, each team's best (ties for them) and worst
 * (ties against them) possible finishing rank, separating teams level on points
 * by head-to-head points. Teams still level after head-to-head points are
 * ambiguous (their order depends on goal difference, i.e. unknown scorelines).
 */
function ranksByPointsThenH2H(teamIds: string[], outcomes: Outcome[]): Map<string, { best: number; worst: number }> {
  const points = new Map<string, number>(teamIds.map((id) => [id, 0]))
  const award = (map: Map<string, number>, o: Outcome) => {
    if (o.res === 'A') map.set(o.a, map.get(o.a)! + 3)
    else if (o.res === 'B') map.set(o.b, map.get(o.b)! + 3)
    else {
      map.set(o.a, map.get(o.a)! + 1)
      map.set(o.b, map.get(o.b)! + 1)
    }
  }
  for (const o of outcomes) award(points, o)

  // Head-to-head points among teams sharing the same points total.
  const byPoints = new Map<number, string[]>()
  for (const id of teamIds) {
    const p = points.get(id)!
    const arr = byPoints.get(p) ?? []
    arr.push(id)
    byPoints.set(p, arr)
  }
  const h2h = new Map<string, number>(teamIds.map((id) => [id, 0]))
  for (const grp of byPoints.values()) {
    if (grp.length < 2) continue
    const set = new Set(grp)
    for (const o of outcomes) {
      if (set.has(o.a) && set.has(o.b)) award(h2h, o)
    }
  }

  const ranks = new Map<string, { best: number; worst: number }>()
  for (const x of teamIds) {
    const px = points.get(x)!
    const hx = h2h.get(x)!
    let above = 0
    let ambiguous = 0
    for (const y of teamIds) {
      if (y === x) continue
      const py = points.get(y)!
      if (py > px) above++
      else if (py === px) {
        const hy = h2h.get(y)!
        if (hy > hx) above++
        else if (hy === hx) ambiguous++ // level on points AND head-to-head -> order undecided
      }
    }
    ranks.set(x, { best: above + 1, worst: above + ambiguous + 1 })
  }
  return ranks
}

/**
 * Per-group base certainty from enumerating remaining results. Does NOT resolve
 * the cross-group best-N third place (callers layer that on once all groups are
 * complete).
 */
function computeGroupCertainty(
  input: GroupInput,
  teamCodeById: Map<string, string>,
  thirdPlaceCount: number
): TeamCertainty[] {
  const { team_ids: teamIds, matches } = input

  // Running table (played matches only), ordered by the 2026 tiebreakers.
  const standings = computeGroupStandings(teamIds, teamCodeById, matches)
  const currentPosition = new Map(standings.map((s) => [s.team_id, s.final_position]))

  const remaining = matches.filter((m) => m.home_score == null || m.away_score == null)

  // A finished group has its final table locked, so every position is certain.
  if (remaining.length === 0) {
    return standings.map((s) => ({
      team_id: s.team_id,
      current_position: s.final_position,
      qualified: s.final_position <= 2,
      position_certain: true,
      eliminated: thirdPlaceCount > 0 ? s.final_position > 3 : s.final_position > 2,
    }))
  }

  // Match outcomes: played ones are fixed; remaining ones get enumerated.
  const playedOutcomes: Outcome[] = []
  for (const m of matches) {
    if (m.home_score == null || m.away_score == null) continue
    playedOutcomes.push({
      a: m.home_team_id,
      b: m.away_team_id,
      res: m.home_score > m.away_score ? 'A' : m.home_score < m.away_score ? 'B' : 'D',
    })
  }
  const remainingPairs = remaining.map((m) => ({ a: m.home_team_id, b: m.away_team_id }))

  const worstRankMax = new Map<string, number>()
  const bestRankMin = new Map<string, number>()
  const lockedRank = new Map<string, number | null>()
  const posUncertain = new Set<string>()
  for (const id of teamIds) {
    worstRankMax.set(id, 0)
    bestRankMin.set(id, Infinity)
    lockedRank.set(id, null)
  }

  const tooMany = remainingPairs.length > MAX_REMAINING
  const combos = tooMany ? 0 : Math.pow(3, remainingPairs.length)

  for (let mask = 0; mask < combos; mask++) {
    const outcomes: Outcome[] = [...playedOutcomes]
    let m = mask
    for (const rp of remainingPairs) {
      const o = m % 3
      m = Math.floor(m / 3)
      outcomes.push({ a: rp.a, b: rp.b, res: o === 0 ? 'A' : o === 1 ? 'D' : 'B' })
    }
    const ranks = ranksByPointsThenH2H(teamIds, outcomes)
    for (const x of teamIds) {
      const r = ranks.get(x)!
      worstRankMax.set(x, Math.max(worstRankMax.get(x)!, r.worst))
      bestRankMin.set(x, Math.min(bestRankMin.get(x)!, r.best))
      if (r.best !== r.worst) posUncertain.add(x)
      else {
        const prev = lockedRank.get(x)!
        if (prev === null) lockedRank.set(x, r.best)
        else if (prev !== r.best) posUncertain.add(x)
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
