import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Group stage scoring (spec section 7.1):
 * For each group prediction, for each predicted position (1st, 2nd, 3rd):
 *   - If predicted_team qualified: +1 point
 *   - If predicted_team has exact position match: +1 bonus point
 */
export async function calculateGroupStageScores(tournamentId: string): Promise<void> {
  const admin = createAdminClient()

  // Get all entries for this tournament
  const { data: entries, error: entriesErr } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('tournament_id', tournamentId)

  if (entriesErr) throw new Error(`Failed to fetch entries: ${entriesErr.message}`)
  if (!entries || entries.length === 0) return

  // Get all groups for this tournament
  const { data: groups, error: groupsErr } = await admin
    .from('groups')
    .select('id')
    .eq('tournament_id', tournamentId)

  if (groupsErr) throw new Error(`Failed to fetch groups: ${groupsErr.message}`)
  if (!groups || groups.length === 0) return

  const groupIds = groups.map((g) => g.id)

  // Get all actual group results for these groups
  const { data: results, error: resultsErr } = await admin
    .from('group_results')
    .select('*')
    .in('group_id', groupIds)

  if (resultsErr) throw new Error(`Failed to fetch group results: ${resultsErr.message}`)
  if (!results || results.length === 0) return

  // Build lookup: group_id -> { team_id -> { final_position, qualified } }
  const resultsByGroup: Record<string, Record<string, { final_position: number; qualified: boolean }>> = {}
  for (const r of results) {
    if (!resultsByGroup[r.group_id]) resultsByGroup[r.group_id] = {}
    resultsByGroup[r.group_id][r.team_id] = {
      final_position: r.final_position,
      qualified: r.qualified,
    }
  }

  // Get all group predictions for all entries
  const entryIds = entries.map((e) => e.id)
  const { data: predictions, error: predsErr } = await admin
    .from('group_predictions')
    .select('*')
    .in('entry_id', entryIds)

  if (predsErr) throw new Error(`Failed to fetch group predictions: ${predsErr.message}`)
  if (!predictions || predictions.length === 0) return

  // Score each prediction and batch update
  const predictionUpdates: PromiseLike<unknown>[] = []
  const pointsByEntry: Record<string, number> = {}

  for (const pred of predictions) {
    const groupResults = resultsByGroup[pred.group_id]
    if (!groupResults) continue

    let points = 0

    // Check each predicted position
    const positions: { teamId: string | null; position: number }[] = [
      { teamId: pred.predicted_1st, position: 1 },
      { teamId: pred.predicted_2nd, position: 2 },
      { teamId: pred.predicted_3rd, position: 3 },
    ]

    for (const { teamId, position } of positions) {
      if (!teamId) continue
      const actual = groupResults[teamId]
      if (!actual) continue

      // Team qualified: +1 point
      if (actual.qualified) {
        points += 1
        // Exact position match: +1 bonus point
        if (actual.final_position === position) {
          points += 1
        }
      }
    }

    // Batch the update
    predictionUpdates.push(
      admin
        .from('group_predictions')
        .update({ points_earned: points })
        .eq('id', pred.id)
    )

    // Accumulate points per entry
    pointsByEntry[pred.entry_id] = (pointsByEntry[pred.entry_id] || 0) + points
  }

  // Execute all prediction updates in parallel
  const predResults = await Promise.all(predictionUpdates)
  const predFailures = predResults.filter((r) => (r as { error?: unknown }).error)
  if (predFailures.length > 0) {
    throw new Error(`${predFailures.length} group prediction updates failed`)
  }

  // Batch update entry totals in parallel
  const entryResults = await Promise.all(
    entries.map((entry) =>
      admin
        .from('tournament_entries')
        .update({ group_stage_points: pointsByEntry[entry.id] || 0 })
        .eq('id', entry.id)
    )
  )
  const entryFailures = entryResults.filter((r) => (r as { error?: unknown }).error)
  if (entryFailures.length > 0) {
    throw new Error(`${entryFailures.length} group stage entry updates failed`)
  }
}

/**
 * Knockout scoring (spec section 7.2):
 * For each knockout prediction:
 *   If predicted_winner === actual_winner: points_earned = match.points_value
 */
export async function calculateKnockoutScores(tournamentId: string): Promise<void> {
  const admin = createAdminClient()

  // Get all entries for this tournament
  const { data: entries, error: entriesErr } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('tournament_id', tournamentId)

  if (entriesErr) throw new Error(`Failed to fetch entries: ${entriesErr.message}`)
  if (!entries || entries.length === 0) return

  // Get all knockout matches with results for this tournament
  const { data: matches, error: matchesErr } = await admin
    .from('knockout_matches')
    .select('*')
    .eq('tournament_id', tournamentId)

  if (matchesErr) throw new Error(`Failed to fetch knockout matches: ${matchesErr.message}`)
  if (!matches || matches.length === 0) return

  // Build lookup: match_id -> match
  const matchById: Record<string, { winner_team_id: string | null; points_value: number }> = {}
  for (const m of matches) {
    matchById[m.id] = { winner_team_id: m.winner_team_id, points_value: m.points_value }
  }

  // Get all knockout predictions for all entries
  const entryIds = entries.map((e) => e.id)
  const { data: predictions, error: predsErr } = await admin
    .from('knockout_predictions')
    .select('*')
    .in('entry_id', entryIds)

  if (predsErr) throw new Error(`Failed to fetch knockout predictions: ${predsErr.message}`)
  if (!predictions || predictions.length === 0) return

  // Score each prediction and batch update
  const knockoutUpdates: PromiseLike<unknown>[] = []
  const knockoutPointsByEntry: Record<string, number> = {}

  for (const pred of predictions) {
    const match = matchById[pred.match_id]
    if (!match || !match.winner_team_id) {
      // Match not yet decided, skip
      continue
    }

    const isCorrect = pred.predicted_winner_id === match.winner_team_id
    const pointsEarned = isCorrect ? match.points_value : 0

    knockoutUpdates.push(
      admin
        .from('knockout_predictions')
        .update({ is_correct: isCorrect, points_earned: pointsEarned })
        .eq('id', pred.id)
    )

    // Accumulate points per entry
    knockoutPointsByEntry[pred.entry_id] = (knockoutPointsByEntry[pred.entry_id] || 0) + pointsEarned
  }

  // Execute all prediction updates in parallel
  const koResults = await Promise.all(knockoutUpdates)
  const koFailures = koResults.filter((r) => (r as { error?: unknown }).error)
  if (koFailures.length > 0) {
    throw new Error(`${koFailures.length} knockout prediction updates failed`)
  }

  // Batch update entry totals in parallel
  const koEntryResults = await Promise.all(
    entries.map((entry) =>
      admin
        .from('tournament_entries')
        .update({ knockout_points: knockoutPointsByEntry[entry.id] || 0 })
        .eq('id', entry.id)
    )
  )
  const koEntryFailures = koEntryResults.filter((r) => (r as { error?: unknown }).error)
  if (koEntryFailures.length > 0) {
    throw new Error(`${koEntryFailures.length} knockout entry updates failed`)
  }
}

/**
 * Tiebreaker calculation:
 * tiebreaker_diff = abs(predicted_goals - actual_goals)
 */
export async function calculateTiebreakers(tournamentId: string): Promise<void> {
  const admin = createAdminClient()

  // Get actual total group stage goals
  const { data: stats, error: statsErr } = await admin
    .from('tournament_stats')
    .select('total_group_stage_goals')
    .eq('tournament_id', tournamentId)
    .single()

  if (statsErr && statsErr.code !== 'PGRST116') {
    throw new Error(`Failed to fetch tournament stats: ${statsErr.message}`)
  }
  if (!stats || stats.total_group_stage_goals === null) return

  const actualGoals = stats.total_group_stage_goals

  // Get all entries with tiebreaker predictions
  const { data: entries, error: entriesErr } = await admin
    .from('tournament_entries')
    .select('id, tiebreaker_goals')
    .eq('tournament_id', tournamentId)

  if (entriesErr) throw new Error(`Failed to fetch entries: ${entriesErr.message}`)
  if (!entries) return

  const tbResults = await Promise.all(
    entries.map((entry) => {
      const diff =
        entry.tiebreaker_goals !== null ? Math.abs(entry.tiebreaker_goals - actualGoals) : null

      return admin
        .from('tournament_entries')
        .update({ tiebreaker_diff: diff })
        .eq('id', entry.id)
    })
  )
  const tbFailures = tbResults.filter((r) => (r as { error?: unknown }).error)
  if (tbFailures.length > 0) {
    throw new Error(`${tbFailures.length} tiebreaker updates failed`)
  }
}

/**
 * Ranking (spec section 7.3):
 * ORDER BY total_points DESC, tiebreaker_diff ASC NULLS LAST, knockout_points DESC
 */
export async function calculateRankings(tournamentId: string): Promise<void> {
  const admin = createAdminClient()

  // Fetch all entries sorted by ranking criteria
  const { data: entries, error } = await admin
    .from('tournament_entries')
    .select('id, group_stage_points, knockout_points, total_points, tiebreaker_diff')
    .eq('tournament_id', tournamentId)

  if (error) throw new Error(`Failed to fetch entries: ${error.message}`)
  if (!entries || entries.length === 0) return

  // Sort for overall ranking: total_points DESC, tiebreaker_diff ASC NULLS LAST, knockout_points DESC
  const overallSorted = [...entries].sort((a, b) => {
    // total_points DESC
    if (b.total_points !== a.total_points) return b.total_points - a.total_points

    // tiebreaker_diff ASC NULLS LAST
    const aDiff = a.tiebreaker_diff
    const bDiff = b.tiebreaker_diff
    if (aDiff === null && bDiff === null) {
      // fall through
    } else if (aDiff === null) {
      return 1
    } else if (bDiff === null) {
      return -1
    } else if (aDiff !== bDiff) {
      return aDiff - bDiff
    }

    // knockout_points DESC
    return b.knockout_points - a.knockout_points
  })

  // Assign overall_rank with proper ties (same rank for same values)
  const overallRanks: { id: string; rank: number }[] = []
  let currentRank = 1
  for (let i = 0; i < overallSorted.length; i++) {
    if (i > 0) {
      const prev = overallSorted[i - 1]
      const curr = overallSorted[i]
      const sameTotal = prev.total_points === curr.total_points
      const sameDiff = prev.tiebreaker_diff === curr.tiebreaker_diff
      const sameKnockout = prev.knockout_points === curr.knockout_points
      if (!(sameTotal && sameDiff && sameKnockout)) {
        currentRank = i + 1
      }
    }
    overallRanks.push({ id: overallSorted[i].id, rank: currentRank })
  }

  // Sort for group stage ranking: group_stage_points DESC, tiebreaker_diff ASC NULLS LAST
  const groupSorted = [...entries].sort((a, b) => {
    if (b.group_stage_points !== a.group_stage_points)
      return b.group_stage_points - a.group_stage_points

    const aDiff = a.tiebreaker_diff
    const bDiff = b.tiebreaker_diff
    if (aDiff === null && bDiff === null) return 0
    if (aDiff === null) return 1
    if (bDiff === null) return -1
    return aDiff - bDiff
  })

  const groupRanks: { id: string; rank: number }[] = []
  currentRank = 1
  for (let i = 0; i < groupSorted.length; i++) {
    if (i > 0) {
      const prev = groupSorted[i - 1]
      const curr = groupSorted[i]
      const samePoints = prev.group_stage_points === curr.group_stage_points
      const sameDiff = prev.tiebreaker_diff === curr.tiebreaker_diff
      if (!(samePoints && sameDiff)) {
        currentRank = i + 1
      }
    }
    groupRanks.push({ id: groupSorted[i].id, rank: currentRank })
  }

  // Build combined update map: id -> { overall_rank, group_stage_rank }
  const rankMap = new Map<string, { overall_rank: number; group_stage_rank: number }>()
  for (const { id, rank } of overallRanks) {
    rankMap.set(id, { overall_rank: rank, group_stage_rank: 0 })
  }
  for (const { id, rank } of groupRanks) {
    const existing = rankMap.get(id)
    if (existing) {
      existing.group_stage_rank = rank
    }
  }

  // Batch all rank updates in parallel
  const rankResults = await Promise.all(
    Array.from(rankMap.entries()).map(([id, ranks]) =>
      admin
        .from('tournament_entries')
        .update({ overall_rank: ranks.overall_rank, group_stage_rank: ranks.group_stage_rank })
        .eq('id', id)
    )
  )
  const rankFailures = rankResults.filter((r) => (r as { error?: unknown }).error)
  if (rankFailures.length > 0) {
    throw new Error(`${rankFailures.length} rank updates failed`)
  }
}

/**
 * Master function that runs all scoring steps in order.
 */
export async function calculateAllScores(tournamentId: string): Promise<void> {
  await calculateGroupStageScores(tournamentId)
  await calculateKnockoutScores(tournamentId)
  await calculateTiebreakers(tournamentId)
  await calculateRankings(tournamentId)
}
