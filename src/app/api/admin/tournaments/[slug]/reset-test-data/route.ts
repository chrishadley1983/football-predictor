import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEST_EMAIL_DOMAIN } from '@/lib/testing/seed-helpers'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    const body = await request.json()
    if (!body.confirm) {
      return NextResponse.json(
        { error: 'Must pass { confirm: true } to reset test data' },
        { status: 400 }
      )
    }

    // Get tournament
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const tournamentId = tournament.id

    // Get all entries for this tournament
    const { data: entries } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournamentId)

    const entryIds = (entries ?? []).map((e) => e.id)

    // Get all groups for this tournament
    const { data: groups } = await admin
      .from('groups')
      .select('id')
      .eq('tournament_id', tournamentId)

    const groupIds = (groups ?? []).map((g) => g.id)

    // 1. Delete knockout predictions for this tournament's entries
    if (entryIds.length > 0) {
      await admin
        .from('knockout_predictions')
        .delete()
        .in('entry_id', entryIds)
    }

    // 2. Delete group predictions for this tournament's entries
    if (entryIds.length > 0) {
      await admin
        .from('group_predictions')
        .delete()
        .in('entry_id', entryIds)
    }

    // 3. Delete tournament entries
    if (entryIds.length > 0) {
      await admin
        .from('tournament_entries')
        .delete()
        .eq('tournament_id', tournamentId)
    }

    // 4. Delete group results
    if (groupIds.length > 0) {
      await admin
        .from('group_results')
        .delete()
        .in('group_id', groupIds)
    }

    // 5. Delete honours
    await admin
      .from('honours')
      .delete()
      .eq('tournament_id', tournamentId)

    // 6. Reset tournament_stats total_group_stage_goals to NULL
    await admin
      .from('tournament_stats')
      .update({ total_group_stage_goals: null })
      .eq('tournament_id', tournamentId)

    // 7. Reset knockout matches: clear winner, home_team, away_team (keep structure)
    // Only clear team IDs that were populated from group results (where source exists)
    // For matches with sources like "1A", "W1" etc, clear the team IDs
    const { data: knockoutMatches } = await admin
      .from('knockout_matches')
      .select('id, home_source, away_source')
      .eq('tournament_id', tournamentId)

    if (knockoutMatches) {
      for (const match of knockoutMatches) {
        const updateFields: Record<string, null> = { winner_team_id: null }
        // Clear team IDs for matches that have sources (populated from group results or prior round)
        if (match.home_source) updateFields.home_team_id = null
        if (match.away_source) updateFields.away_team_id = null

        await admin
          .from('knockout_matches')
          .update(updateFields)
          .eq('id', match.id)
      }
    }

    // 8. Delete test players
    await admin
      .from('players')
      .delete()
      .like('email', `%${TEST_EMAIL_DOMAIN}`)

    // 9. Reset tournament status to group_stage_open
    await admin
      .from('tournaments')
      .update({ status: 'group_stage_open' })
      .eq('id', tournamentId)

    return NextResponse.json({
      success: true,
      message: 'Test data reset complete. Tournament status set to group_stage_open.',
      entries_deleted: entryIds.length,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
