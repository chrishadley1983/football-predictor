import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'

// POST: Submit group results or knockout results (admin only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const supabase = await createClient()
    const admin = createAdminClient()

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body = await request.json()

    // Handle group results
    // Expected: { type: 'group', results: [{ group_id, team_id, final_position, qualified }], total_group_stage_goals? }
    if (body.type === 'group') {
      if (!Array.isArray(body.results)) {
        return NextResponse.json({ error: 'results must be an array' }, { status: 400 })
      }

      for (const result of body.results) {
        const { error } = await admin
          .from('group_results')
          .upsert(
            {
              group_id: result.group_id,
              team_id: result.team_id,
              final_position: result.final_position,
              qualified: result.qualified ?? false,
            },
            { onConflict: 'group_id,team_id' }
          )

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
      }

      // Update total group stage goals if provided (for tiebreaker)
      if (body.total_group_stage_goals !== undefined) {
        await admin
          .from('tournament_stats')
          .upsert(
            {
              tournament_id: tournament.id,
              total_group_stage_goals: body.total_group_stage_goals,
            },
            { onConflict: 'tournament_id' }
          )
      }

      return NextResponse.json({ success: true, type: 'group' })
    }

    // Handle knockout results
    // Expected: { type: 'knockout', results: [{ match_id, winner_team_id }] }
    if (body.type === 'knockout') {
      if (!Array.isArray(body.results)) {
        return NextResponse.json({ error: 'results must be an array' }, { status: 400 })
      }

      for (const result of body.results) {
        const { error } = await admin
          .from('knockout_matches')
          .update({ winner_team_id: result.winner_team_id })
          .eq('id', result.match_id)
          .eq('tournament_id', tournament.id)

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
      }

      return NextResponse.json({ success: true, type: 'knockout' })
    }

    return NextResponse.json(
      { error: 'Invalid type. Must be "group" or "knockout".' },
      { status: 400 }
    )
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
