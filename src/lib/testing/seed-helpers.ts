import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KnockoutRound } from '@/lib/types'

// ============================================================================
// Types
// ============================================================================

export type Archetype = 'expert' | 'average' | 'wildcard'

export interface TestPlayer {
  display_name: string
  nickname: string
  email: string
  archetype: Archetype
}

type AdminClient = ReturnType<typeof createAdminClient>

// ============================================================================
// Test Player Definitions
// ============================================================================

export const TEST_PLAYERS: TestPlayer[] = [
  { display_name: 'Dave Thompson', nickname: 'Dave The Oracle', email: 'dave@test.predictor.local', archetype: 'expert' },
  { display_name: 'Brian Clarke', nickname: 'The Professor', email: 'brian@test.predictor.local', archetype: 'expert' },
  { display_name: 'Margaret Webb', nickname: 'Mystic Meg', email: 'margaret@test.predictor.local', archetype: 'expert' },
  { display_name: 'Eddie Brooks', nickname: 'Steady Eddie', email: 'eddie@test.predictor.local', archetype: 'average' },
  { display_name: 'Pete Jameson', nickname: 'Lucky Pete', email: 'pete@test.predictor.local', archetype: 'average' },
  { display_name: 'Tony Marsh', nickname: 'Tactical Tony', email: 'tony@test.predictor.local', archetype: 'average' },
  { display_name: 'Pauline Rogers', nickname: 'Punt Pauline', email: 'pauline@test.predictor.local', archetype: 'average' },
  { display_name: 'Wayne Stubbs', nickname: 'Wildcard Wayne', email: 'wayne@test.predictor.local', archetype: 'wildcard' },
  { display_name: 'Jimmy Nixon', nickname: 'Jimmy No-Stars', email: 'jimmy@test.predictor.local', archetype: 'wildcard' },
  { display_name: 'Derek Platt', nickname: 'Dodgy Derek', email: 'derek@test.predictor.local', archetype: 'wildcard' },
]

export const TEST_EMAIL_DOMAIN = '@test.predictor.local'

// ============================================================================
// Shuffle Utility
// ============================================================================

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ============================================================================
// Prediction Generators
// ============================================================================

/**
 * Generate a group prediction (1st, 2nd, 3rd) based on archetype.
 * teamIds should be ordered by seed position (index 0 = top seed).
 * - Expert: 70% chance of preserving seeded order for each position
 * - Average: 50% chance
 * - Wildcard: 30% chance (favours underdogs)
 */
export function generateGroupPrediction(
  teamIds: string[],
  archetype: Archetype
): { predicted_1st: string; predicted_2nd: string; predicted_3rd: string } {
  const accuracy = archetype === 'expert' ? 0.7 : archetype === 'average' ? 0.5 : 0.3

  // Start with seeded order
  const pool = [...teamIds]

  function pick(preferredIndex: number): string {
    if (pool.length === 0) return ''
    // If random < accuracy, pick the preferred (top) team; otherwise pick randomly
    const idx = Math.random() < accuracy
      ? Math.min(preferredIndex, pool.length - 1)
      : Math.floor(Math.random() * pool.length)
    return pool.splice(idx, 1)[0]
  }

  return {
    predicted_1st: pick(0),
    predicted_2nd: pick(0),
    predicted_3rd: pick(0),
  }
}

/**
 * Generate a knockout prediction.
 * - Expert: 70% chance of picking the higher-seeded (home) team
 * - Average: 50/50
 * - Wildcard: 30% home, 70% away (favours underdog)
 */
export function generateKnockoutPrediction(
  homeTeamId: string,
  awayTeamId: string,
  archetype: Archetype
): string {
  const homeChance = archetype === 'expert' ? 0.7 : archetype === 'average' ? 0.5 : 0.3
  return Math.random() < homeChance ? homeTeamId : awayTeamId
}

/**
 * Generate tiebreaker goals based on archetype.
 * - Expert: 100-140 (tight range, realistic)
 * - Average: 80-180
 * - Wildcard: 50-250 (wild swings)
 */
export function generateTiebreakerGoals(archetype: Archetype): number {
  const ranges: Record<Archetype, [number, number]> = {
    expert: [100, 140],
    average: [80, 180],
    wildcard: [50, 250],
  }
  const [min, max] = ranges[archetype]
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ============================================================================
// Force-Complete Logic (extracted from force-complete/route.ts)
// ============================================================================

/**
 * Resolve a group source like "1A" -> team_id, or composite "3C/D/E" for 3rd place qualifiers.
 */
export function resolveGroupSource(
  source: string,
  groupResults: Record<string, Record<number, string>>
): string | null {
  // Simple format: "1A" means 1st place of Group A
  const simpleMatch = source.match(/^(\d+)([A-L])$/)
  if (simpleMatch) {
    const position = parseInt(simpleMatch[1], 10)
    const letter = simpleMatch[2]
    return groupResults[letter]?.[position] ?? null
  }

  // Composite format: "3C/D/E" means 3rd place from one of groups C, D, E (whichever qualified)
  const compositeMatch = source.match(/^(\d+)([A-L](?:\/[A-L])+)$/)
  if (compositeMatch) {
    const position = parseInt(compositeMatch[1], 10)
    const letters = compositeMatch[2].split('/')
    for (const letter of letters) {
      const teamId = groupResults[letter]?.[position]
      if (teamId) return teamId
    }
    return null
  }

  return null
}

/**
 * Force-complete group stage: randomly assign positions, mark qualifiers,
 * then populate knockout bracket from group results.
 */
export async function forceCompleteGroupStageLogic(
  admin: AdminClient,
  tournamentId: string,
  thirdPlaceQualifiersCount: number | null = null
): Promise<{
  success: boolean
  thirdPlaceQualifyingGroups: Set<string>
  groupResults: Record<string, Record<number, string>>
}> {
  const { data: groups } = await admin
    .from('groups')
    .select(`id, name, group_teams ( team_id )`)
    .eq('tournament_id', tournamentId)
    .order('sort_order')

  if (!groups || groups.length === 0) {
    throw new Error('No groups found')
  }

  // Select which groups' 3rd place qualifies
  let thirdPlaceQualifyingGroups: Set<string> = new Set()
  if (thirdPlaceQualifiersCount && thirdPlaceQualifiersCount > 0) {
    const shuffledGroups = shuffle(groups.map((g) => g.id))
    thirdPlaceQualifyingGroups = new Set(shuffledGroups.slice(0, thirdPlaceQualifiersCount))
  }

  // For each group, randomly assign positions
  for (const group of groups) {
    const teamIds = group.group_teams.map((gt: { team_id: string }) => gt.team_id)

    // Delete existing results
    await admin.from('group_results').delete().eq('group_id', group.id)

    const shuffled = shuffle(teamIds)
    const results = shuffled.map((teamId, index) => ({
      group_id: group.id,
      team_id: teamId,
      final_position: index + 1,
      qualified: index < 2 || (index === 2 && thirdPlaceQualifyingGroups.has(group.id)),
    }))

    const { error } = await admin.from('group_results').insert(results)
    if (error) {
      throw new Error(`Failed to insert results for ${group.name}: ${error.message}`)
    }
  }

  // Build result lookup for bracket population
  const groupResultsByLetter = await buildGroupResultsLookup(admin, groups)

  // Populate knockout bracket
  await populateKnockoutFromGroupResults(admin, tournamentId, groupResultsByLetter)

  return {
    success: true,
    thirdPlaceQualifyingGroups,
    groupResults: groupResultsByLetter,
  }
}

/**
 * Build lookup: group letter -> { position -> team_id }
 */
async function buildGroupResultsLookup(
  admin: AdminClient,
  groups: { id: string; name: string }[]
): Promise<Record<string, Record<number, string>>> {
  const groupResultsByLetter: Record<string, Record<number, string>> = {}

  for (const group of groups) {
    const letter = group.name.replace('Group ', '')
    const { data: results } = await admin
      .from('group_results')
      .select('team_id, final_position')
      .eq('group_id', group.id)

    if (results) {
      groupResultsByLetter[letter] = {}
      for (const r of results) {
        groupResultsByLetter[letter][r.final_position] = r.team_id
      }
    }
  }

  return groupResultsByLetter
}

/**
 * Populate knockout matches from group results using home_source/away_source.
 */
export async function populateKnockoutFromGroupResults(
  admin: AdminClient,
  tournamentId: string,
  groupResults: Record<string, Record<number, string>>
): Promise<void> {
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('id, home_source, away_source')
    .eq('tournament_id', tournamentId)

  if (!matches) return

  for (const match of matches) {
    const updateFields: Record<string, string> = {}

    if (match.home_source) {
      const homeTeamId = resolveGroupSource(match.home_source, groupResults)
      if (homeTeamId) updateFields.home_team_id = homeTeamId
    }
    if (match.away_source) {
      const awayTeamId = resolveGroupSource(match.away_source, groupResults)
      if (awayTeamId) updateFields.away_team_id = awayTeamId
    }

    if (Object.keys(updateFields).length > 0) {
      await admin
        .from('knockout_matches')
        .update(updateFields)
        .eq('id', match.id)
    }
  }
}

/**
 * Force-complete a knockout round: randomly pick winners and advance them.
 */
export async function forceCompleteKnockoutRoundLogic(
  admin: AdminClient,
  tournamentId: string,
  round: KnockoutRound
): Promise<{ decidedCount: number; allKnockoutComplete: boolean }> {
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round', round)
    .order('match_number')

  if (!matches || matches.length === 0) {
    throw new Error(`No matches found for round ${round}`)
  }

  let decidedCount = 0

  for (const match of matches) {
    if (match.winner_team_id) {
      decidedCount++
      continue
    }

    if (!match.home_team_id || !match.away_team_id) continue

    const winnerId = Math.random() < 0.5 ? match.home_team_id : match.away_team_id

    const { error } = await admin
      .from('knockout_matches')
      .update({ winner_team_id: winnerId })
      .eq('id', match.id)

    if (error) {
      throw new Error(`Failed to set winner for match ${match.match_number}: ${error.message}`)
    }

    await advanceWinnerLogic(admin, tournamentId, match.match_number, winnerId)
    decidedCount++
  }

  // Check if all knockout matches are complete
  const { data: allMatches } = await admin
    .from('knockout_matches')
    .select('winner_team_id')
    .eq('tournament_id', tournamentId)

  const allKnockoutComplete = allMatches?.every((m) => m.winner_team_id !== null) ?? false

  return { decidedCount, allKnockoutComplete }
}

/**
 * Advance a winner to the next round by looking up matches that reference this match number.
 */
export async function advanceWinnerLogic(
  admin: AdminClient,
  tournamentId: string,
  matchNumber: number,
  winnerTeamId: string
): Promise<void> {
  const winnerSource = `W${matchNumber}`

  const { data: nextMatches } = await admin
    .from('knockout_matches')
    .select('id, home_source, away_source')
    .eq('tournament_id', tournamentId)
    .or(`home_source.eq.${winnerSource},away_source.eq.${winnerSource}`)

  if (!nextMatches || nextMatches.length === 0) return

  for (const nextMatch of nextMatches) {
    if (nextMatch.home_source === winnerSource) {
      await admin
        .from('knockout_matches')
        .update({ home_team_id: winnerTeamId })
        .eq('id', nextMatch.id)
    }
    if (nextMatch.away_source === winnerSource) {
      await admin
        .from('knockout_matches')
        .update({ away_team_id: winnerTeamId })
        .eq('id', nextMatch.id)
    }
  }
}

// ============================================================================
// Knockout Round Ordering
// ============================================================================

export const KNOCKOUT_ROUNDS_ORDER: KnockoutRound[] = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'final',
]

/**
 * Get the list of knockout rounds that exist for a tournament.
 */
export async function getExistingKnockoutRounds(
  admin: AdminClient,
  tournamentId: string
): Promise<KnockoutRound[]> {
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('round')
    .eq('tournament_id', tournamentId)

  if (!matches) return []

  const roundSet = new Set(matches.map((m) => m.round))
  return KNOCKOUT_ROUNDS_ORDER.filter((r) => roundSet.has(r))
}
