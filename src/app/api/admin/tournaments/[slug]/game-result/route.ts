import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface GroupResultPayload {
  type: 'group'
  group_id: string
  team_id: string
  final_position: number
  qualified: boolean
}

interface KnockoutResultPayload {
  type: 'knockout'
  match_id: string
  winner_team_id: string
}

type GameResultPayload = GroupResultPayload | KnockoutResultPayload

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    // Verify tournament exists
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body: GameResultPayload = await request.json()

    if (body.type === 'group') {
      return handleGroupResult(admin, body)
    } else if (body.type === 'knockout') {
      return handleKnockoutResult(admin, tournament.id, body)
    } else {
      return NextResponse.json({ error: 'Invalid type. Must be "group" or "knockout".' }, { status: 400 })
    }
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleGroupResult(
  admin: ReturnType<typeof createAdminClient>,
  payload: GroupResultPayload
) {
  const { group_id, team_id, final_position, qualified } = payload

  if (!group_id || !team_id || !final_position) {
    return NextResponse.json(
      { error: 'group_id, team_id, and final_position are required' },
      { status: 400 }
    )
  }

  // Upsert group result
  const { data: existing } = await admin
    .from('group_results')
    .select('id')
    .eq('group_id', group_id)
    .eq('team_id', team_id)
    .single()

  if (existing) {
    const { error } = await admin
      .from('group_results')
      .update({ final_position, qualified })
      .eq('id', existing.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await admin
      .from('group_results')
      .insert({ group_id, team_id, final_position, qualified })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}

async function handleKnockoutResult(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  payload: KnockoutResultPayload
) {
  const { match_id, winner_team_id } = payload

  if (!match_id || !winner_team_id) {
    return NextResponse.json(
      { error: 'match_id and winner_team_id are required' },
      { status: 400 }
    )
  }

  // Get the match to verify it exists and belongs to this tournament
  const { data: match } = await admin
    .from('knockout_matches')
    .select('*')
    .eq('id', match_id)
    .eq('tournament_id', tournamentId)
    .single()

  if (!match) {
    return NextResponse.json({ error: 'Match not found' }, { status: 404 })
  }

  // Set the winner
  const { error: updateErr } = await admin
    .from('knockout_matches')
    .update({ winner_team_id })
    .eq('id', match_id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Advance the winner to the next round
  await advanceWinner(admin, tournamentId, match.match_number, winner_team_id)

  return NextResponse.json({ success: true })
}

async function advanceWinner(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  matchNumber: number,
  winnerTeamId: string
) {
  // Find the next match that references this match's winner (e.g., home_source = "W1" or away_source = "W1")
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
