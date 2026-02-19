import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  TEST_PLAYERS,
  generateGroupPrediction,
  generateTiebreakerGoals,
} from '@/lib/testing/seed-helpers'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    // Get tournament
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id, status')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Get all groups with their teams (ordered by seed position)
    const { data: groups } = await admin
      .from('groups')
      .select(`id, name, group_teams ( team_id, seed_position )`)
      .eq('tournament_id', tournament.id)
      .order('sort_order')

    if (!groups || groups.length === 0) {
      return NextResponse.json({ error: 'No groups found - set up groups first' }, { status: 400 })
    }

    let playersCreated = 0
    let entriesCreated = 0
    let predictionsCreated = 0

    for (const testPlayer of TEST_PLAYERS) {
      // Upsert player by email
      const { data: existingPlayer } = await admin
        .from('players')
        .select('id')
        .eq('email', testPlayer.email)
        .single()

      let playerId: string

      if (existingPlayer) {
        playerId = existingPlayer.id
      } else {
        const { data: newPlayer, error: playerErr } = await admin
          .from('players')
          .insert({
            auth_user_id: crypto.randomUUID(),
            display_name: testPlayer.display_name,
            nickname: testPlayer.nickname,
            email: testPlayer.email,
          })
          .select('id')
          .single()

        if (playerErr || !newPlayer) {
          return NextResponse.json(
            { error: `Failed to create player ${testPlayer.display_name}: ${playerErr?.message}` },
            { status: 500 }
          )
        }
        playerId = newPlayer.id
        playersCreated++
      }

      // Check if entry already exists
      const { data: existingEntry } = await admin
        .from('tournament_entries')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('player_id', playerId)
        .single()

      let entryId: string

      if (existingEntry) {
        entryId = existingEntry.id
      } else {
        const tiebreakerGoals = generateTiebreakerGoals(testPlayer.archetype)

        const { data: newEntry, error: entryErr } = await admin
          .from('tournament_entries')
          .insert({
            tournament_id: tournament.id,
            player_id: playerId,
            payment_status: 'paid',
            tiebreaker_goals: tiebreakerGoals,
            group_stage_points: 0,
            knockout_points: 0,
          })
          .select('id')
          .single()

        if (entryErr || !newEntry) {
          return NextResponse.json(
            { error: `Failed to create entry for ${testPlayer.display_name}: ${entryErr?.message}` },
            { status: 500 }
          )
        }
        entryId = newEntry.id
        entriesCreated++
      }

      // Generate group predictions for all groups
      for (const group of groups) {
        // Check if prediction already exists
        const { data: existingPred } = await admin
          .from('group_predictions')
          .select('id')
          .eq('entry_id', entryId)
          .eq('group_id', group.id)
          .single()

        if (existingPred) continue

        // Sort teams by seed_position for archetype-based prediction
        const sortedTeams = [...group.group_teams]
          .sort((a, b) => (a.seed_position ?? 99) - (b.seed_position ?? 99))
          .map((gt) => gt.team_id)

        const prediction = generateGroupPrediction(sortedTeams, testPlayer.archetype)

        const { error: predErr } = await admin
          .from('group_predictions')
          .insert({
            entry_id: entryId,
            group_id: group.id,
            ...prediction,
            points_earned: 0,
          })

        if (predErr) {
          return NextResponse.json(
            { error: `Failed to create prediction for ${testPlayer.display_name} in ${group.name}: ${predErr.message}` },
            { status: 500 }
          )
        }
        predictionsCreated++
      }
    }

    return NextResponse.json({
      success: true,
      players_created: playersCreated,
      entries_created: entriesCreated,
      predictions_created: predictionsCreated,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
