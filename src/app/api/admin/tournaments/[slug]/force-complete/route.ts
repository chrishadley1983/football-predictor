import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KnockoutRound } from '@/lib/types'

interface ForceCompletePayload {
  phase: 'group_stage' | 'knockout_round'
  round?: 'round_of_16' | 'quarter_final' | 'semi_final' | 'final'
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    const { data: tournament } = await admin
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body: ForceCompletePayload = await request.json()

    if (body.phase === 'group_stage') {
      return forceCompleteGroupStage(admin, tournament.id, slug)
    } else if (body.phase === 'knockout_round') {
      if (!body.round) {
        return NextResponse.json({ error: 'round is required for knockout_round phase' }, { status: 400 })
      }
      return forceCompleteKnockoutRound(admin, tournament.id, body.round)
    } else {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 })
    }
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function forceCompleteGroupStage(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  slug: string
) {
  // Get all groups with their teams
  const { data: groups } = await admin
    .from('groups')
    .select(`
      id, name,
      group_teams (
        team_id
      )
    `)
    .eq('tournament_id', tournamentId)
    .order('sort_order')

  if (!groups || groups.length === 0) {
    return NextResponse.json({ error: 'No groups found' }, { status: 400 })
  }

  // For each group, randomly assign positions and mark top 2 as qualified
  for (const group of groups) {
    const teamIds = group.group_teams.map((gt: { team_id: string }) => gt.team_id)

    // Check if results already exist for this group
    const { data: existingResults } = await admin
      .from('group_results')
      .select('id')
      .eq('group_id', group.id)

    // Delete existing results for this group
    if (existingResults && existingResults.length > 0) {
      await admin.from('group_results').delete().eq('group_id', group.id)
    }

    // Shuffle teams randomly
    const shuffled = [...teamIds]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    // Assign positions 1 through N
    const results = shuffled.map((teamId, index) => ({
      group_id: group.id,
      team_id: teamId,
      final_position: index + 1,
      qualified: index < 2, // Top 2 qualify
    }))

    const { error } = await admin.from('group_results').insert(results)
    if (error) {
      return NextResponse.json(
        { error: `Failed to insert results for ${group.name}: ${error.message}` },
        { status: 500 }
      )
    }
  }

  // Now populate R16 matches based on group results
  await populateR16FromGroupResults(admin, tournamentId, groups)

  // Update tournament status to group_stage_closed
  await admin
    .from('tournaments')
    .update({ status: 'group_stage_closed' })
    .eq('slug', slug)

  return NextResponse.json({
    success: true,
    message: 'Group stage force-completed with random results',
  })
}

async function populateR16FromGroupResults(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  groups: { id: string; name: string; group_teams: { team_id: string }[] }[]
) {
  // Build a lookup: group letter -> { position -> team_id }
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

  // Get all knockout matches for this tournament
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('id, home_source, away_source')
    .eq('tournament_id', tournamentId)

  if (!matches) return

  // For each match, resolve home_source and away_source like "1A" or "2B"
  for (const match of matches) {
    let homeTeamId: string | null = null
    let awayTeamId: string | null = null

    if (match.home_source) {
      homeTeamId = resolveGroupSource(match.home_source, groupResultsByLetter)
    }
    if (match.away_source) {
      awayTeamId = resolveGroupSource(match.away_source, groupResultsByLetter)
    }

    // Only update if we resolved at least one team
    const updateFields: Record<string, string> = {}
    if (homeTeamId) updateFields.home_team_id = homeTeamId
    if (awayTeamId) updateFields.away_team_id = awayTeamId

    if (Object.keys(updateFields).length > 0) {
      await admin
        .from('knockout_matches')
        .update(updateFields)
        .eq('id', match.id)
    }
  }
}

function resolveGroupSource(
  source: string,
  groupResults: Record<string, Record<number, string>>
): string | null {
  // Source format: "1A" means 1st place of Group A, "2B" means 2nd place of Group B
  const match = source.match(/^(\d+)([A-H])$/)
  if (!match) return null

  const position = parseInt(match[1], 10)
  const letter = match[2]

  return groupResults[letter]?.[position] ?? null
}

async function forceCompleteKnockoutRound(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  round: KnockoutRound
) {
  // Get all matches in this round
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('round', round)
    .order('match_number')

  if (!matches || matches.length === 0) {
    return NextResponse.json({ error: `No matches found for round ${round}` }, { status: 400 })
  }

  let decidedCount = 0

  for (const match of matches) {
    // Skip matches that already have a winner
    if (match.winner_team_id) {
      decidedCount++
      continue
    }

    // Both teams must be populated
    if (!match.home_team_id || !match.away_team_id) continue

    // Randomly pick a winner
    const winnerId = Math.random() < 0.5 ? match.home_team_id : match.away_team_id

    const { error } = await admin
      .from('knockout_matches')
      .update({ winner_team_id: winnerId })
      .eq('id', match.id)

    if (error) {
      return NextResponse.json(
        { error: `Failed to set winner for match ${match.match_number}: ${error.message}` },
        { status: 500 }
      )
    }

    // Advance winner to next round
    await advanceWinner(admin, tournamentId, match.match_number, winnerId)
    decidedCount++
  }

  // Check if all knockout rounds are complete
  const { data: allMatches } = await admin
    .from('knockout_matches')
    .select('round, winner_team_id')
    .eq('tournament_id', tournamentId)

  const allDecided = allMatches?.every((m) => m.winner_team_id !== null)

  if (allDecided) {
    await admin
      .from('tournaments')
      .update({ status: 'completed' })
      .eq('id', tournamentId)
  }

  return NextResponse.json({
    success: true,
    message: `Force-completed ${round}: ${decidedCount} matches decided`,
    all_knockout_complete: allDecided,
  })
}

async function advanceWinner(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  matchNumber: number,
  winnerTeamId: string
) {
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
