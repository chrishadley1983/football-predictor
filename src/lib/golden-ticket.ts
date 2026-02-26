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
  /** The completed-round match where the player predicted wrong */
  match_id: string
  match: KnockoutMatch
  /** The team the player predicted (the loser) */
  wrong_team_id: string
  wrong_team: Team
  /** The actual winner of this match (the automatic swap target) */
  winner_team_id: string
  winner_team: Team
}

/**
 * Find matches in the completed round where the player's prediction was wrong.
 * The golden ticket lets the player retroactively fix a wrong prediction by
 * swapping to the actual winner. No points for that match; the winner then
 * cascades through all downstream predictions.
 */
export async function getEligibleSwaps(
  admin: AdminClient,
  tournamentId: string,
  entryId: string,
  completedRound: KnockoutRound
): Promise<EligibleSwap[]> {
  // Get all decided matches in the completed round with team details
  const { data: completedMatches } = await admin
    .from('knockout_matches')
    .select(`
      *,
      home_team:teams!knockout_matches_home_team_id_fkey (*),
      away_team:teams!knockout_matches_away_team_id_fkey (*)
    `)
    .eq('tournament_id', tournamentId)
    .eq('round', completedRound)
    .not('winner_team_id', 'is', null)
    .order('sort_order')

  if (!completedMatches || completedMatches.length === 0) return []

  // Get player's predictions for these matches
  const matchIds = completedMatches.map((m) => m.id)
  const { data: predictions } = await admin
    .from('knockout_predictions')
    .select('match_id, predicted_winner_id')
    .eq('entry_id', entryId)
    .in('match_id', matchIds)

  if (!predictions) return []

  const predByMatch = new Map(predictions.map((p) => [p.match_id, p.predicted_winner_id]))

  const swaps: EligibleSwap[] = []

  for (const match of completedMatches) {
    const predictedWinnerId = predByMatch.get(match.id)
    if (!predictedWinnerId) continue

    // Only eligible if the player predicted wrong
    if (predictedWinnerId === match.winner_team_id) continue

    // Identify the wrong team and the actual winner
    const homeTeam = match.home_team as Team | null
    const awayTeam = match.away_team as Team | null
    const wrongTeam = predictedWinnerId === homeTeam?.id ? homeTeam
      : predictedWinnerId === awayTeam?.id ? awayTeam
      : null
    const winnerTeam = match.winner_team_id === homeTeam?.id ? homeTeam
      : match.winner_team_id === awayTeam?.id ? awayTeam
      : null

    if (!wrongTeam || !winnerTeam) continue

    swaps.push({
      match_id: match.id,
      match: match as unknown as KnockoutMatch,
      wrong_team_id: predictedWinnerId,
      wrong_team: wrongTeam,
      winner_team_id: match.winner_team_id!,
      winner_team: winnerTeam,
    })
  }

  return swaps
}

// ============================================================================
// Apply Golden Ticket
// ============================================================================

/**
 * Apply a golden ticket: retroactively fix a wrong prediction in the completed
 * round by swapping to the actual winner. The winner then cascades through all
 * downstream matches. The golden ticket match itself scores 0 points.
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

  // 2. Cascade downstream: force new team as prediction for all future matches in this bracket branch
  await cascadeDownstream(admin, tournamentId, entryId, targetMatch.match_number, newTeamId)

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
 * Forces newTeamId as the prediction for ALL downstream matches in this
 * bracket branch — the golden ticket pick is carried forward as the
 * player's selection for every subsequent round.
 */
async function cascadeDownstream(
  admin: AdminClient,
  tournamentId: string,
  entryId: string,
  matchNumber: number,
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

    // Always set newTeamId — the golden ticket pick carries forward
    if (pred.predicted_winner_id !== newTeamId) {
      await admin
        .from('knockout_predictions')
        .update({ predicted_winner_id: newTeamId })
        .eq('id', pred.id)
    }

    // Continue cascading from this match
    await cascadeDownstream(admin, tournamentId, entryId, downstream.match_number, newTeamId)
  }
}
