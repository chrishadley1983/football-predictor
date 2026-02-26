import { createAdminClient } from '@/lib/supabase/admin'
import type { BadgeType } from '@/lib/types'

interface BadgeToInsert {
  tournament_id: string
  entry_id: string
  badge_type: BadgeType
  description: string
}

/**
 * Calculate all achievements for a tournament and upsert into player_achievements.
 * Idempotent — safe to call multiple times.
 */
export async function calculateAchievements(tournamentId: string): Promise<void> {
  const admin = createAdminClient()

  // Get tournament status
  const { data: tournament } = await admin
    .from('tournaments')
    .select('status, group_stage_deadline')
    .eq('id', tournamentId)
    .single()

  if (!tournament) return

  // Get all entries
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, tiebreaker_goals')
    .eq('tournament_id', tournamentId)

  if (!entries || entries.length === 0) return
  const entryIds = entries.map((e) => e.id)

  // Get all groups
  const { data: groups } = await admin
    .from('groups')
    .select('id, name')
    .eq('tournament_id', tournamentId)
    .order('sort_order')

  if (!groups || groups.length === 0) return
  const groupIds = groups.map((g) => g.id)
  const groupNameMap = new Map(groups.map((g) => [g.id, g.name]))

  // Get all group predictions
  const { data: allGroupPredictions } = await admin
    .from('group_predictions')
    .select('*')
    .in('entry_id', entryIds)

  const groupPredictions = allGroupPredictions ?? []

  // Get all group results
  const { data: allGroupResults } = await admin
    .from('group_results')
    .select('*')
    .in('group_id', groupIds)

  const groupResults = allGroupResults ?? []

  // Build result lookup: group_id -> { team_id -> { final_position, qualified } }
  const resultsByGroup: Record<
    string,
    Record<string, { final_position: number; qualified: boolean }>
  > = {}
  for (const r of groupResults) {
    if (!resultsByGroup[r.group_id]) resultsByGroup[r.group_id] = {}
    resultsByGroup[r.group_id][r.team_id] = {
      final_position: r.final_position,
      qualified: r.qualified,
    }
  }

  const badges: BadgeToInsert[] = []

  // =============================================
  // GROUP STAGE BADGES
  // =============================================

  // Early Bird & Last Minute — depend only on submission times
  if (groupPredictions.length > 0) {
    // Get earliest submitted_at per entry (their first prediction submission)
    const earliestByEntry = new Map<string, string>()
    const latestByEntry = new Map<string, string>()
    for (const gp of groupPredictions) {
      const current = earliestByEntry.get(gp.entry_id)
      if (!current || gp.submitted_at < current) {
        earliestByEntry.set(gp.entry_id, gp.submitted_at)
      }
      const currentLatest = latestByEntry.get(gp.entry_id)
      if (!currentLatest || gp.submitted_at > currentLatest) {
        latestByEntry.set(gp.entry_id, gp.submitted_at)
      }
    }

    // Early Bird: player with earliest submission
    let earliestEntryId = ''
    let earliestTime = ''
    for (const [entryId, time] of earliestByEntry) {
      if (!earliestTime || time < earliestTime) {
        earliestTime = time
        earliestEntryId = entryId
      }
    }
    if (earliestEntryId) {
      badges.push({
        tournament_id: tournamentId,
        entry_id: earliestEntryId,
        badge_type: 'early_bird',
        description: 'First player to submit predictions',
      })
    }

    // Last Minute: player with latest submission (before deadline if available)
    let latestEntryId = ''
    let latestTime = ''
    for (const [entryId, time] of latestByEntry) {
      if (!latestTime || time > latestTime) {
        latestTime = time
        latestEntryId = entryId
      }
    }
    if (latestEntryId && latestEntryId !== earliestEntryId) {
      badges.push({
        tournament_id: tournamentId,
        entry_id: latestEntryId,
        badge_type: 'last_minute',
        description: 'Last player to submit predictions',
      })
    }
  }

  // The remaining group badges require results
  if (groupResults.length > 0) {
    // Perfect Group: max possible points in at least one group
    for (const entryId of entryIds) {
      const entryPreds = groupPredictions.filter((gp) => gp.entry_id === entryId)
      const perfectGroups: string[] = []

      for (const pred of entryPreds) {
        const groupResult = resultsByGroup[pred.group_id]
        if (!groupResult) continue

        // Check each predicted position
        let allCorrect = true
        const positions: { teamId: string | null; position: number }[] = [
          { teamId: pred.predicted_1st, position: 1 },
          { teamId: pred.predicted_2nd, position: 2 },
          { teamId: pred.predicted_3rd, position: 3 },
        ]

        let hasAnyPrediction = false
        for (const { teamId, position } of positions) {
          if (!teamId) continue // null 3rd place is ok, skip
          hasAnyPrediction = true
          const actual = groupResult[teamId]
          if (!actual || actual.final_position !== position) {
            allCorrect = false
            break
          }
        }

        if (hasAnyPrediction && allCorrect) {
          perfectGroups.push(groupNameMap.get(pred.group_id) ?? pred.group_id)
        }
      }

      if (perfectGroups.length > 0) {
        badges.push({
          tournament_id: tournamentId,
          entry_id: entryId,
          badge_type: 'perfect_group',
          description: `Perfect Group: ${perfectGroups.join(', ')}`,
        })
      }
    }

    // Lone Wolf: unique correct group position prediction that no other player also made correctly
    // Build map of correct predictions: "group_id:position:team_id" -> set of entry_ids
    const correctPickMap = new Map<string, Set<string>>()
    for (const pred of groupPredictions) {
      const groupResult = resultsByGroup[pred.group_id]
      if (!groupResult) continue

      const positions: { teamId: string | null; position: number }[] = [
        { teamId: pred.predicted_1st, position: 1 },
        { teamId: pred.predicted_2nd, position: 2 },
        { teamId: pred.predicted_3rd, position: 3 },
      ]

      for (const { teamId, position } of positions) {
        if (!teamId) continue
        const actual = groupResult[teamId]
        if (actual && actual.final_position === position) {
          const key = `${pred.group_id}:${position}:${teamId}`
          if (!correctPickMap.has(key)) correctPickMap.set(key, new Set())
          correctPickMap.get(key)!.add(pred.entry_id)
        }
      }
    }

    // Find unique correct picks (only one player got it right)
    for (const [key, entrySet] of correctPickMap) {
      if (entrySet.size === 1) {
        const entryId = [...entrySet][0]
        const [groupId, posStr] = key.split(':')
        const posLabel = posStr === '1' ? '1st' : posStr === '2' ? '2nd' : '3rd'
        const groupName = groupNameMap.get(groupId) ?? groupId
        // Only award once per player (first unique pick found)
        if (!badges.some((b) => b.entry_id === entryId && b.badge_type === 'lone_wolf')) {
          badges.push({
            tournament_id: tournamentId,
            entry_id: entryId,
            badge_type: 'lone_wolf',
            description: `Unique correct pick: ${groupName} ${posLabel}`,
          })
        }
      }
    }

    // Hive Mind: player whose predictions most frequently match the most popular pick
    // For each group+position, find the mode (most common prediction)
    const predictionsBySlot = new Map<string, Map<string, number>>() // "group:pos" -> team_id -> count
    for (const pred of groupPredictions) {
      const slots: { teamId: string | null; position: number }[] = [
        { teamId: pred.predicted_1st, position: 1 },
        { teamId: pred.predicted_2nd, position: 2 },
        { teamId: pred.predicted_3rd, position: 3 },
      ]
      for (const { teamId, position } of slots) {
        if (!teamId) continue
        const slotKey = `${pred.group_id}:${position}`
        if (!predictionsBySlot.has(slotKey)) predictionsBySlot.set(slotKey, new Map())
        const counts = predictionsBySlot.get(slotKey)!
        counts.set(teamId, (counts.get(teamId) ?? 0) + 1)
      }
    }

    // Find mode for each slot
    const modeBySlot = new Map<string, string>()
    for (const [slotKey, counts] of predictionsBySlot) {
      let maxCount = 0
      let modeTeam = ''
      for (const [teamId, count] of counts) {
        if (count > maxCount) {
          maxCount = count
          modeTeam = teamId
        }
      }
      modeBySlot.set(slotKey, modeTeam)
    }

    // Count consensus matches per entry
    let maxConsensus = 0
    let hiveMindEntryId = ''
    for (const entryId of entryIds) {
      const entryPreds = groupPredictions.filter((gp) => gp.entry_id === entryId)
      let consensusCount = 0
      for (const pred of entryPreds) {
        const slots: { teamId: string | null; position: number }[] = [
          { teamId: pred.predicted_1st, position: 1 },
          { teamId: pred.predicted_2nd, position: 2 },
          { teamId: pred.predicted_3rd, position: 3 },
        ]
        for (const { teamId, position } of slots) {
          if (!teamId) continue
          const slotKey = `${pred.group_id}:${position}`
          if (modeBySlot.get(slotKey) === teamId) {
            consensusCount++
          }
        }
      }
      if (consensusCount > maxConsensus) {
        maxConsensus = consensusCount
        hiveMindEntryId = entryId
      }
    }
    if (hiveMindEntryId) {
      badges.push({
        tournament_id: tournamentId,
        entry_id: hiveMindEntryId,
        badge_type: 'hive_mind',
        description: `Most consensus predictions (${maxConsensus} matched the popular pick)`,
      })
    }
  }

  // =============================================
  // KNOCKOUT BADGES
  // =============================================

  // Get knockout data
  const { data: knockoutMatches } = await admin
    .from('knockout_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('sort_order')

  const matches = knockoutMatches ?? []
  const decidedMatches = matches.filter((m) => m.winner_team_id)

  if (decidedMatches.length > 0) {
    const { data: allKnockoutPredictions } = await admin
      .from('knockout_predictions')
      .select('*')
      .in('entry_id', entryIds)

    const koPredictions = allKnockoutPredictions ?? []

    // Crystal Ball: correctly predicted the tournament winner (final match)
    const finalMatch = decidedMatches.find((m) => m.round === 'final')
    if (finalMatch && finalMatch.winner_team_id) {
      for (const pred of koPredictions) {
        if (
          pred.match_id === finalMatch.id &&
          pred.predicted_winner_id === finalMatch.winner_team_id
        ) {
          badges.push({
            tournament_id: tournamentId,
            entry_id: pred.entry_id,
            badge_type: 'crystal_ball',
            description: 'Correctly predicted the tournament winner',
          })
        }
      }
    }

    // Giant Killer: sole correct predictor for a knockout match
    const correctByMatch = new Map<string, Set<string>>()
    for (const pred of koPredictions) {
      const match = decidedMatches.find((m) => m.id === pred.match_id)
      if (!match || !match.winner_team_id) continue
      if (pred.predicted_winner_id === match.winner_team_id) {
        if (!correctByMatch.has(match.id)) correctByMatch.set(match.id, new Set())
        correctByMatch.get(match.id)!.add(pred.entry_id)
      }
    }

    for (const [matchId, entrySet] of correctByMatch) {
      if (entrySet.size === 1) {
        const entryId = [...entrySet][0]
        const match = decidedMatches.find((m) => m.id === matchId)!
        // Only award once per player
        if (!badges.some((b) => b.entry_id === entryId && b.badge_type === 'giant_killer')) {
          badges.push({
            tournament_id: tournamentId,
            entry_id: entryId,
            badge_type: 'giant_killer',
            description: `Sole predictor of ${match.round.replace(/_/g, ' ')} match #${match.match_number}`,
          })
        }
      }
    }

    // Hot Streak: 5+ consecutive correct knockout predictions (ordered by match sort_order)
    for (const entryId of entryIds) {
      const entryKoPreds = koPredictions
        .filter((kp) => kp.entry_id === entryId)
        .map((kp) => {
          const match = decidedMatches.find((m) => m.id === kp.match_id)
          return { ...kp, sort_order: match?.sort_order ?? 999 }
        })
        .sort((a, b) => a.sort_order - b.sort_order)

      let streak = 0
      let maxStreak = 0
      for (const pred of entryKoPreds) {
        const match = decidedMatches.find((m) => m.id === pred.match_id)
        if (!match || !match.winner_team_id) continue
        if (pred.predicted_winner_id === match.winner_team_id) {
          streak++
          maxStreak = Math.max(maxStreak, streak)
        } else {
          streak = 0
        }
      }

      if (maxStreak >= 5) {
        badges.push({
          tournament_id: tournamentId,
          entry_id: entryId,
          badge_type: 'hot_streak',
          description: `${maxStreak} consecutive correct knockout predictions`,
        })
      }
    }

    // Golden Touch: golden ticket new team won their match
    const { data: goldenTickets } = await admin
      .from('golden_tickets')
      .select('*')
      .eq('tournament_id', tournamentId)

    for (const ticket of goldenTickets ?? []) {
      const match = decidedMatches.find((m) => m.id === ticket.original_match_id)
      if (match && match.winner_team_id === ticket.new_team_id) {
        badges.push({
          tournament_id: tournamentId,
          entry_id: ticket.entry_id,
          badge_type: 'golden_touch',
          description: 'Golden ticket pick won their match',
        })
      }
    }
  }

  // =============================================
  // END-OF-TOURNAMENT BADGES
  // =============================================

  if (tournament.status === 'completed' || tournament.status === 'knockout_closed') {
    // Dead Heat: tiebreaker within 5 goals of actual
    const { data: stats } = await admin
      .from('tournament_stats')
      .select('total_group_stage_goals')
      .eq('tournament_id', tournamentId)
      .single()

    if (stats?.total_group_stage_goals !== null && stats?.total_group_stage_goals !== undefined) {
      const actualGoals = stats.total_group_stage_goals
      for (const entry of entries) {
        if (entry.tiebreaker_goals !== null) {
          const diff = Math.abs(entry.tiebreaker_goals - actualGoals)
          if (diff <= 5) {
            badges.push({
              tournament_id: tournamentId,
              entry_id: entry.id,
              badge_type: 'dead_heat',
              description: `Tiebreaker within ${diff} goal${diff !== 1 ? 's' : ''} (predicted ${entry.tiebreaker_goals}, actual ${actualGoals})`,
            })
          }
        }
      }
    }

    // Contrarian: player with fewest overlaps with other players
    if (groupPredictions.length > 0 && entryIds.length > 1) {
      const overlapScores = new Map<string, number>()

      for (const entryId of entryIds) {
        const myPreds = groupPredictions.filter((gp) => gp.entry_id === entryId)
        let overlapCount = 0

        for (const otherEntryId of entryIds) {
          if (otherEntryId === entryId) continue
          const otherPreds = groupPredictions.filter((gp) => gp.entry_id === otherEntryId)

          for (const myPred of myPreds) {
            const otherPred = otherPreds.find((op) => op.group_id === myPred.group_id)
            if (!otherPred) continue

            if (myPred.predicted_1st && myPred.predicted_1st === otherPred.predicted_1st) overlapCount++
            if (myPred.predicted_2nd && myPred.predicted_2nd === otherPred.predicted_2nd) overlapCount++
            if (myPred.predicted_3rd && myPred.predicted_3rd === otherPred.predicted_3rd) overlapCount++
          }
        }

        overlapScores.set(entryId, overlapCount)
      }

      let minOverlap = Infinity
      let contrarianEntryId = ''
      for (const [entryId, overlap] of overlapScores) {
        if (overlap < minOverlap) {
          minOverlap = overlap
          contrarianEntryId = entryId
        }
      }

      if (contrarianEntryId) {
        badges.push({
          tournament_id: tournamentId,
          entry_id: contrarianEntryId,
          badge_type: 'contrarian',
          description: `Most unique predictions (fewest overlaps with other players)`,
        })
      }
    }
  }

  // =============================================
  // UPSERT ALL BADGES
  // =============================================

  if (badges.length === 0) return

  // Delete existing achievements for this tournament first, then insert fresh
  // This handles the case where results change and badges should be recalculated
  await admin.from('player_achievements').delete().eq('tournament_id', tournamentId)

  // Insert in batches
  for (let i = 0; i < badges.length; i += 50) {
    const batch = badges.slice(i, i + 50)
    const { error } = await admin.from('player_achievements').insert(batch)
    if (error) {
      throw new Error(`Failed to insert achievements batch: ${error.message}`)
    }
  }
}
