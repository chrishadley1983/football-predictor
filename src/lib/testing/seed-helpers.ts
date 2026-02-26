import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGoldenTicketWindow, getEligibleSwaps, applyGoldenTicket } from '@/lib/golden-ticket'
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
  archetype: Archetype,
  includeThird: boolean = true
): { predicted_1st: string; predicted_2nd: string; predicted_3rd: string | null } {
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
    predicted_3rd: includeThird ? pick(0) : null,
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
 * Check if a set of qualifying 3rd-place groups produces a solvable bracket assignment.
 * Uses backtracking to verify that each composite slot (e.g., 3C/D/E) can be filled
 * with a unique qualifying team.
 */
function isBracketSolvable(
  qualifyingGroupIds: string[],
  groups: { id: string; name: string }[],
  thirdByGroup: Map<string, { groupId: string; teamId: string }>,
  compositeSources: string[]
): boolean {
  const qualifyingSet = new Set(qualifyingGroupIds)

  // Map qualifying group letters to team IDs
  const qualifyingLetters = new Set<string>()
  for (const group of groups) {
    if (qualifyingSet.has(group.id)) {
      qualifyingLetters.add(group.name.replace('Group ', ''))
    }
  }

  // Build slot candidates
  const slots = compositeSources.map((source) => {
    const match = source.match(/^(\d+)([A-L](?:\/[A-L])+)$/)
    const letters = match ? match[2].split('/') : []
    return letters
      .filter((l) => qualifyingLetters.has(l))
      .map((l) => thirdByGroup.get(l)?.teamId)
      .filter((id): id is string => !!id)
  })

  // Sort most-constrained first
  const indices = slots.map((_, i) => i)
  indices.sort((a, b) => slots[a].length - slots[b].length)

  const used = new Set<string>()
  function solve(i: number): boolean {
    if (i === indices.length) return true
    const slotIdx = indices[i]
    for (const teamId of slots[slotIdx]) {
      if (used.has(teamId)) continue
      used.add(teamId)
      if (solve(i + 1)) return true
      used.delete(teamId)
    }
    return false
  }

  return solve(0)
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

  // Generate match scores first, then derive everything from actual results
  await generateGroupMatchScores(admin, groups)

  // Derive positions from match results and collect 3rd-place stats
  const thirdPlaceTeams: { groupId: string; teamId: string; pts: number; gd: number; gf: number }[] = []
  const groupStandings = new Map<string, { teamId: string; position: number }[]>()

  for (const group of groups) {
    const teamIds = group.group_teams.map((gt: { team_id: string }) => gt.team_id)
    const standings = await calculateGroupStandings(admin, group.id, teamIds)

    groupStandings.set(group.id, standings.map((s, i) => ({ teamId: s.teamId, position: i + 1 })))

    // Collect 3rd-place team stats for cross-group comparison
    if (standings.length >= 3) {
      const third = standings[2]
      thirdPlaceTeams.push({
        groupId: group.id,
        teamId: third.teamId,
        pts: third.pts,
        gd: third.gf - third.ga,
        gf: third.gf,
      })
    }
  }

  // Determine which 3rd-place teams qualify based on actual stats
  let thirdPlaceQualifyingGroups: Set<string> = new Set()
  if (thirdPlaceQualifiersCount && thirdPlaceQualifiersCount > 0) {
    // Rank 3rd-place teams: points DESC, goal diff DESC, goals for DESC
    thirdPlaceTeams.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.gd !== a.gd) return b.gd - a.gd
      if (b.gf !== a.gf) return b.gf - a.gf
      return Math.random() - 0.5 // random tiebreak
    })

    // Fetch bracket composite sources to validate solvability
    const { data: koMatches } = await admin
      .from('knockout_matches')
      .select('home_source, away_source')
      .eq('tournament_id', tournamentId)

    const compositeSources: string[] = []
    for (const m of koMatches ?? []) {
      if (m.home_source && /^\d+[A-L](?:\/[A-L])+$/.test(m.home_source))
        compositeSources.push(m.home_source)
      if (m.away_source && /^\d+[A-L](?:\/[A-L])+$/.test(m.away_source))
        compositeSources.push(m.away_source)
    }

    // Build group letter -> team mapping for 3rd-place teams
    const thirdByGroup = new Map<string, { groupId: string; teamId: string }>()
    for (const t of thirdPlaceTeams) {
      const group = groups.find((g) => g.id === t.groupId)
      if (group) {
        const letter = group.name.replace('Group ', '')
        thirdByGroup.set(letter, { groupId: t.groupId, teamId: t.teamId })
      }
    }

    // Select qualifying groups with bracket solvability validation
    // Start with top N by ranking, then swap boundary teams if unsolvable
    const ranked = thirdPlaceTeams.map((t) => t.groupId)
    let qualifyingIds = ranked.slice(0, thirdPlaceQualifiersCount)
    const nonQualifying = ranked.slice(thirdPlaceQualifiersCount)

    if (!isBracketSolvable(qualifyingIds, groups, thirdByGroup, compositeSources)) {
      // Try swapping boundary teams until solvable
      let solved = false
      for (let swapOut = qualifyingIds.length - 1; swapOut >= 0 && !solved; swapOut--) {
        for (let swapIn = 0; swapIn < nonQualifying.length && !solved; swapIn++) {
          const candidate = [...qualifyingIds]
          candidate[swapOut] = nonQualifying[swapIn]
          if (isBracketSolvable(candidate, groups, thirdByGroup, compositeSources)) {
            qualifyingIds = candidate
            solved = true
          }
        }
      }
    }

    thirdPlaceQualifyingGroups = new Set(qualifyingIds)
  }

  // Insert group results with correct qualified flags
  for (const group of groups) {
    await admin.from('group_results').delete().eq('group_id', group.id)

    const standings = groupStandings.get(group.id)!
    const results = standings.map(({ teamId, position }) => ({
      group_id: group.id,
      team_id: teamId,
      final_position: position,
      qualified: position <= 2 || (position === 3 && thirdPlaceQualifyingGroups.has(group.id)),
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
 * Generate group match fixtures (round-robin) and random scores.
 * Creates group_matches rows if they don't exist, then populates random scores.
 * Positions are derived from these scores afterwards (not pre-assigned).
 */
async function generateGroupMatchScores(
  admin: AdminClient,
  groups: { id: string; name: string; group_teams: { team_id: string }[] }[]
): Promise<void> {
  for (const group of groups) {
    // Check if group matches already exist
    const { data: existing } = await admin
      .from('group_matches')
      .select('id')
      .eq('group_id', group.id)
      .limit(1)

    // Create round-robin fixtures if none exist
    if (!existing || existing.length === 0) {
      const teamIds = group.group_teams.map((gt) => gt.team_id)
      const fixtures: { group_id: string; home_team_id: string; away_team_id: string; match_number: number; sort_order: number }[] = []
      let matchNum = 1
      for (let i = 0; i < teamIds.length; i++) {
        for (let j = i + 1; j < teamIds.length; j++) {
          fixtures.push({
            group_id: group.id,
            home_team_id: teamIds[i],
            away_team_id: teamIds[j],
            match_number: matchNum,
            sort_order: matchNum,
          })
          matchNum++
        }
      }
      if (fixtures.length > 0) {
        await admin.from('group_matches').insert(fixtures)
      }
    }

    // Fetch all matches and set random scores
    const { data: matches } = await admin
      .from('group_matches')
      .select('id, home_team_id, away_team_id')
      .eq('group_id', group.id)

    if (!matches) continue

    for (const match of matches) {
      if (!match.home_team_id || !match.away_team_id) continue

      const homeScore = Math.floor(Math.random() * 4) // 0-3
      const awayScore = Math.floor(Math.random() * 4) // 0-3

      await admin
        .from('group_matches')
        .update({ home_score: homeScore, away_score: awayScore })
        .eq('id', match.id)
    }
  }
}

/**
 * Calculate group standings from match results.
 * Returns teams sorted by: points DESC, goal diff DESC, goals for DESC, then random tiebreak.
 */
async function calculateGroupStandings(
  admin: AdminClient,
  groupId: string,
  teamIds: string[]
): Promise<{ teamId: string; pts: number; gf: number; ga: number }[]> {
  const { data: matches } = await admin
    .from('group_matches')
    .select('home_team_id, away_team_id, home_score, away_score')
    .eq('group_id', groupId)

  // Accumulate stats per team
  const stats = new Map<string, { pts: number; gf: number; ga: number }>()
  for (const id of teamIds) {
    stats.set(id, { pts: 0, gf: 0, ga: 0 })
  }

  for (const m of matches ?? []) {
    if (m.home_score === null || m.away_score === null || !m.home_team_id || !m.away_team_id) continue
    const home = stats.get(m.home_team_id)!
    const away = stats.get(m.away_team_id)!

    home.gf += m.home_score
    home.ga += m.away_score
    away.gf += m.away_score
    away.ga += m.home_score

    if (m.home_score > m.away_score) {
      home.pts += 3
    } else if (m.home_score === m.away_score) {
      home.pts += 1
      away.pts += 1
    } else {
      away.pts += 3
    }
  }

  // Sort: points DESC, goal diff DESC, goals for DESC, random tiebreak
  return teamIds
    .map((id) => ({ teamId: id, ...stats.get(id)! }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      const gdA = a.gf - a.ga
      const gdB = b.gf - b.ga
      if (gdB !== gdA) return gdB - gdA
      if (b.gf !== a.gf) return b.gf - a.gf
      return Math.random() - 0.5 // random tiebreak
    })
}

/**
 * Build lookup: group letter -> { position -> team_id }
 * Only includes 3rd-place teams that qualified (to prevent non-qualifiers
 * appearing in R32 composite slots like 3A/D/E).
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
      .select('team_id, final_position, qualified')
      .eq('group_id', group.id)

    if (results) {
      groupResultsByLetter[letter] = {}
      for (const r of results) {
        // Only include 3rd-place teams that qualified
        if (r.final_position === 3 && !r.qualified) continue
        groupResultsByLetter[letter][r.final_position] = r.team_id
      }
    }
  }

  return groupResultsByLetter
}

/**
 * Populate knockout matches from group results using home_source/away_source.
 *
 * Composite 3rd-place sources (e.g., "3C/D/E") are resolved in a coordinated
 * pass to ensure each qualifying 3rd-place team is assigned to exactly one slot.
 * Without this, the same team could be picked by multiple slots that share a
 * group letter (e.g., South Africa 3rd in Group A matched by both "3A/D/E" and "3A/B/C").
 */
export async function populateKnockoutFromGroupResults(
  admin: AdminClient,
  tournamentId: string,
  groupResults: Record<string, Record<number, string>>
): Promise<void> {
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('id, match_number, home_source, away_source')
    .eq('tournament_id', tournamentId)

  if (!matches) return

  // Separate sources into simple and composite
  interface SourceSlot {
    matchId: string
    field: 'home_team_id' | 'away_team_id'
    source: string
  }
  const simpleSlots: SourceSlot[] = []
  const compositeSlots: SourceSlot[] = []
  const isComposite = (s: string) => /^\d+[A-L](?:\/[A-L])+$/.test(s)

  for (const match of matches) {
    for (const [sourceField, teamField] of [
      ['home_source', 'home_team_id'],
      ['away_source', 'away_team_id'],
    ] as const) {
      const source = match[sourceField]
      if (!source) continue
      const slot: SourceSlot = { matchId: match.id, field: teamField, source }
      if (isComposite(source)) {
        compositeSlots.push(slot)
      } else {
        simpleSlots.push(slot)
      }
    }
  }

  // Pass 1: Resolve simple sources (1A, 2B, etc.) — no duplicate risk
  for (const slot of simpleSlots) {
    const teamId = resolveGroupSource(slot.source, groupResults)
    if (teamId) {
      await admin
        .from('knockout_matches')
        .update({ [slot.field]: teamId })
        .eq('id', slot.matchId)
    }
  }

  // Pass 2: Resolve composite sources (3C/D/E, etc.) using backtracking
  // to find a valid assignment where each 3rd-place team is used exactly once
  const slotCandidates = compositeSlots.map((slot) => {
    const compositeMatch = slot.source.match(/^(\d+)([A-L](?:\/[A-L])+)$/)
    const position = compositeMatch ? parseInt(compositeMatch[1], 10) : 3
    const letters = compositeMatch ? compositeMatch[2].split('/') : []
    return {
      ...slot,
      candidates: letters
        .map((letter) => groupResults[letter]?.[position])
        .filter((id): id is string => !!id),
    }
  })

  // Sort most-constrained first for efficient backtracking
  slotCandidates.sort((a, b) => a.candidates.length - b.candidates.length)

  const assignment = new Map<number, string>() // slot index -> teamId
  const usedTeams = new Set<string>()

  function backtrack(index: number): boolean {
    if (index === slotCandidates.length) return true
    for (const teamId of slotCandidates[index].candidates) {
      if (usedTeams.has(teamId)) continue
      usedTeams.add(teamId)
      assignment.set(index, teamId)
      if (backtrack(index + 1)) return true
      usedTeams.delete(teamId)
      assignment.delete(index)
    }
    return false
  }

  backtrack(0)

  // Apply the assignment
  for (const [index, teamId] of assignment) {
    const slot = slotCandidates[index]
    await admin
      .from('knockout_matches')
      .update({ [slot.field]: teamId })
      .eq('id', slot.matchId)
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

    // Generate random scores (winner gets higher score, or wins on penalties)
    let homeScore = Math.floor(Math.random() * 4) // 0-3
    let awayScore = Math.floor(Math.random() * 4) // 0-3
    const winnerId = Math.random() < 0.5 ? match.home_team_id : match.away_team_id

    // Ensure winner has equal or higher score (draws go to penalties/ET)
    if (winnerId === match.home_team_id && homeScore < awayScore) {
      homeScore = awayScore // draw that home wins on penalties
    } else if (winnerId === match.away_team_id && awayScore < homeScore) {
      awayScore = homeScore // draw that away wins on penalties
    }

    const { error } = await admin
      .from('knockout_matches')
      .update({ winner_team_id: winnerId, home_score: homeScore, away_score: awayScore })
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

// ============================================================================
// AI Golden Ticket Processing
// ============================================================================

/**
 * Process golden tickets for AI test players after a knockout round completes.
 * Each archetype has a different probability of using their ticket:
 * - Expert: 90% (strategic, always looking for advantage)
 * - Average: 60% (sometimes remembers)
 * - Wildcard: 40% (often forgets or doesn't bother)
 *
 * Returns the number of tickets played.
 */
export async function processAIGoldenTickets(
  admin: AdminClient,
  tournamentId: string,
  completedRound: KnockoutRound
): Promise<number> {
  // Can't play golden ticket after the final
  if (completedRound === 'final') return 0

  const window = await getGoldenTicketWindow(admin, tournamentId)
  if (!window.isOpen || !window.nextRound || !window.completedRound) return 0

  // Get all entries with their player emails (to find archetypes)
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, player:players!tournament_entries_player_id_fkey ( email )')
    .eq('tournament_id', tournamentId)

  if (!entries || entries.length === 0) return 0

  let ticketsPlayed = 0

  for (const entry of entries) {
    const email = (entry.player as { email: string } | null)?.email ?? ''
    const testPlayer = TEST_PLAYERS.find((p) => p.email === email)
    if (!testPlayer) continue // skip non-test players

    // Check if they've already used their ticket
    const { data: existingTicket } = await admin
      .from('golden_tickets')
      .select('id')
      .eq('entry_id', entry.id)
      .maybeSingle()

    if (existingTicket) continue // already used

    // Get eligible swaps (wrong predictions in the completed round)
    const swaps = await getEligibleSwaps(
      admin,
      tournamentId,
      entry.id,
      window.completedRound
    )

    if (swaps.length === 0) continue // all predictions were correct — no swap needed

    // Decide whether to use the golden ticket based on archetype
    const useChance = testPlayer.archetype === 'expert' ? 0.9
      : testPlayer.archetype === 'average' ? 0.6
      : 0.4 // wildcard

    if (Math.random() >= useChance) continue // decided not to use it

    // Pick which wrong prediction to fix: experts pick first (highest bracket),
    // wildcards pick randomly
    const swap = testPlayer.archetype === 'wildcard'
      ? swaps[Math.floor(Math.random() * swaps.length)]
      : swaps[0]

    // Apply — the swap target is always the actual winner (automatic)
    await applyGoldenTicket(
      admin,
      tournamentId,
      entry.id,
      swap.match_id,
      swap.winner_team_id,
      window.completedRound
    )

    ticketsPlayed++
  }

  return ticketsPlayed
}
