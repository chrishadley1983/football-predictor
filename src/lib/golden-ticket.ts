import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { KNOCKOUT_ROUNDS_ORDER, getExistingKnockoutRounds } from '@/lib/testing/seed-helpers'
import type { KnockoutRound, KnockoutMatch, Team } from '@/lib/types'

type AdminClient = ReturnType<typeof createAdminClient>

// ============================================================================
// Golden Ticket Window Detection
// ============================================================================

/**
 * Determine whether the golden ticket window is currently open.
 * The window is open when ALL matches in a round are decided AND
 * NO matches in the NEXT round have a result yet.
 */
export async function getGoldenTicketWindow(
  admin: AdminClient,
  tournamentId: string
): Promise<{
  isOpen: boolean
  completedRound: KnockoutRound | null
  nextRound: KnockoutRound | null
}> {
  const existingRounds = await getExistingKnockoutRounds(admin, tournamentId)
  if (existingRounds.length === 0) {
    return { isOpen: false, completedRound: null, nextRound: null }
  }

  // Get all knockout matches grouped by round
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('id, round, winner_team_id')
    .eq('tournament_id', tournamentId)

  if (!matches || matches.length === 0) {
    return { isOpen: false, completedRound: null, nextRound: null }
  }

  const matchesByRound = new Map<string, typeof matches>()
  for (const m of matches) {
    const existing = matchesByRound.get(m.round) ?? []
    existing.push(m)
    matchesByRound.set(m.round, existing)
  }

  // Walk rounds in order. Find the latest completed round where the next round is untouched.
  for (let i = existingRounds.length - 2; i >= 0; i--) {
    const round = existingRounds[i]
    const nextRound = existingRounds[i + 1]

    const roundMatches = matchesByRound.get(round) ?? []
    const nextRoundMatches = matchesByRound.get(nextRound) ?? []

    const allDecided = roundMatches.length > 0 && roundMatches.every((m) => m.winner_team_id !== null)
    const noneDecided = nextRoundMatches.length > 0 && nextRoundMatches.every((m) => m.winner_team_id === null)

    if (allDecided && noneDecided) {
      return { isOpen: true, completedRound: round, nextRound }
    }
  }

  return { isOpen: false, completedRound: null, nextRound: null }
}

// ============================================================================
// Eligible Swaps
// ============================================================================

export interface EligibleSwap {
  match_id: string
  match: KnockoutMatch
  eliminated_team_id: string
  eliminated_team: Team
  available_teams: Team[]
}

/**
 * Find matches in the next round where the player's predicted team was eliminated.
 * Returns the eligible swaps with the available replacement teams.
 */
export async function getEligibleSwaps(
  admin: AdminClient,
  tournamentId: string,
  entryId: string,
  nextRound: KnockoutRound,
  completedRound: KnockoutRound
): Promise<EligibleSwap[]> {
  // Get all matches in the completed round to find eliminated teams
  const { data: completedMatches } = await admin
    .from('knockout_matches')
    .select('id, home_team_id, away_team_id, winner_team_id')
    .eq('tournament_id', tournamentId)
    .eq('round', completedRound)

  if (!completedMatches) return []

  // Build set of eliminated team IDs (teams that lost in the completed round)
  const eliminatedTeams = new Set<string>()
  for (const m of completedMatches) {
    if (!m.winner_team_id) continue
    const loserId = m.home_team_id === m.winner_team_id ? m.away_team_id : m.home_team_id
    if (loserId) eliminatedTeams.add(loserId)
  }

  // Get matches in the next round with team details
  const { data: nextMatches } = await admin
    .from('knockout_matches')
    .select(`
      *,
      home_team:teams!knockout_matches_home_team_id_fkey (*),
      away_team:teams!knockout_matches_away_team_id_fkey (*)
    `)
    .eq('tournament_id', tournamentId)
    .eq('round', nextRound)
    .order('sort_order')

  if (!nextMatches) return []

  // Get player's predictions for the next round matches
  const nextMatchIds = nextMatches.map((m) => m.id)
  const { data: predictions } = await admin
    .from('knockout_predictions')
    .select('match_id, predicted_winner_id')
    .eq('entry_id', entryId)
    .in('match_id', nextMatchIds)

  if (!predictions) return []

  const predByMatch = new Map(predictions.map((p) => [p.match_id, p.predicted_winner_id]))

  // Collect all eliminated team IDs we need to look up
  const eliminatedTeamIdsNeeded = new Set<string>()
  for (const match of nextMatches) {
    const predictedWinnerId = predByMatch.get(match.id)
    if (predictedWinnerId && eliminatedTeams.has(predictedWinnerId)) {
      eliminatedTeamIdsNeeded.add(predictedWinnerId)
    }
  }

  // Fetch eliminated team details (they won't be in the next-round matches since they lost)
  let eliminatedTeamMap = new Map<string, Team>()
  if (eliminatedTeamIdsNeeded.size > 0) {
    const { data: elimTeams } = await admin
      .from('teams')
      .select('*')
      .in('id', [...eliminatedTeamIdsNeeded])

    eliminatedTeamMap = new Map((elimTeams ?? []).map((t) => [t.id, t as Team]))
  }

  const swaps: EligibleSwap[] = []

  for (const match of nextMatches) {
    const predictedWinnerId = predByMatch.get(match.id)
    if (!predictedWinnerId) continue

    // Check if the player's predicted winner was eliminated in the completed round
    if (!eliminatedTeams.has(predictedWinnerId)) continue

    const eliminatedTeam = eliminatedTeamMap.get(predictedWinnerId)
    if (!eliminatedTeam) continue

    // The available teams are whoever IS in the next-round match (the actual survivors)
    const homeTeam = match.home_team as Team | null
    const awayTeam = match.away_team as Team | null
    const actualTeams: Team[] = []
    if (homeTeam) actualTeams.push(homeTeam)
    if (awayTeam) actualTeams.push(awayTeam)

    if (actualTeams.length === 0) continue

    swaps.push({
      match_id: match.id,
      match: match as unknown as KnockoutMatch,
      eliminated_team_id: predictedWinnerId,
      eliminated_team: eliminatedTeam,
      available_teams: actualTeams,
    })
  }

  return swaps
}

// ============================================================================
// Apply Golden Ticket
// ============================================================================

/**
 * Apply a golden ticket: update the prediction for the target match and cascade
 * the change through all downstream matches in the player's bracket.
 */
export async function applyGoldenTicket(
  admin: AdminClient,
  tournamentId: string,
  entryId: string,
  matchId: string,
  newTeamId: string,
  completedRound: KnockoutRound
): Promise<void> {
  // Get the target match details
  const { data: targetMatch } = await admin
    .from('knockout_matches')
    .select('id, match_number')
    .eq('id', matchId)
    .single()

  if (!targetMatch) throw new Error('Target match not found')

  // Get the player's current prediction for this match (to find the old team)
  const { data: currentPred } = await admin
    .from('knockout_predictions')
    .select('id, predicted_winner_id')
    .eq('entry_id', entryId)
    .eq('match_id', matchId)
    .single()

  if (!currentPred) throw new Error('No existing prediction found for this match')

  const oldTeamId = currentPred.predicted_winner_id
  if (!oldTeamId) throw new Error('Current prediction has no team')

  // 1. Update the target match prediction
  await admin
    .from('knockout_predictions')
    .update({ predicted_winner_id: newTeamId })
    .eq('id', currentPred.id)

  // 2. Cascade downstream: replace old team with new team in all future predictions
  await cascadeDownstream(admin, tournamentId, entryId, targetMatch.match_number, oldTeamId, newTeamId)

  // 3. Insert the golden ticket audit record
  await admin.from('golden_tickets').insert({
    entry_id: entryId,
    tournament_id: tournamentId,
    original_match_id: matchId,
    original_team_id: oldTeamId,
    new_team_id: newTeamId,
    played_after_round: completedRound,
  })
}

/**
 * Recursively cascade a team swap through downstream matches.
 * Follows the W{matchNumber} references in home_source/away_source.
 */
async function cascadeDownstream(
  admin: AdminClient,
  tournamentId: string,
  entryId: string,
  matchNumber: number,
  oldTeamId: string,
  newTeamId: string
): Promise<void> {
  const winnerSource = `W${matchNumber}`

  // Find matches that reference this match's winner
  const { data: downstreamMatches } = await admin
    .from('knockout_matches')
    .select('id, match_number, home_source, away_source')
    .eq('tournament_id', tournamentId)
    .or(`home_source.eq.${winnerSource},away_source.eq.${winnerSource}`)

  if (!downstreamMatches || downstreamMatches.length === 0) return

  for (const downstream of downstreamMatches) {
    // Get the player's prediction for this downstream match
    const { data: pred } = await admin
      .from('knockout_predictions')
      .select('id, predicted_winner_id')
      .eq('entry_id', entryId)
      .eq('match_id', downstream.id)
      .single()

    if (!pred) continue

    // Only update if the player predicted the old (eliminated) team
    if (pred.predicted_winner_id === oldTeamId) {
      await admin
        .from('knockout_predictions')
        .update({ predicted_winner_id: newTeamId })
        .eq('id', pred.id)

      // Continue cascading from this match
      await cascadeDownstream(admin, tournamentId, entryId, downstream.match_number, oldTeamId, newTeamId)
    }
  }
}
