import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

// GET: Get all players' predictions (only after deadline has passed, or admin)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAuth()
    const { slug } = await params
    const supabase = await createClient()

    // Check if current user is admin
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const isAdmin = authUser?.app_metadata?.role === 'admin'

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Check if group predictions can be shown (after group stage closes, or admin)
    const groupPredictionsVisible =
      isAdmin || (tournament.status !== 'draft' && tournament.status !== 'group_stage_open')

    // Check if knockout predictions can be shown (after knockout stage closes, or admin)
    const knockoutPredictionsVisible =
      isAdmin || tournament.status === 'knockout_closed' || tournament.status === 'completed'

    if (!groupPredictionsVisible) {
      return NextResponse.json(
        { error: 'Predictions are not yet visible. Deadline has not passed.' },
        { status: 403 }
      )
    }

    // Get all entries with player info (paginated)
    const entries = await fetchAllRows<{ id: string; player_id: string; tiebreaker_goals: number | null; player: unknown }>(
      (from, to) =>
        supabase
          .from('tournament_entries')
          .select(`
            id,
            player_id,
            tiebreaker_goals,
            player:players (
              id,
              display_name,
              nickname,
              avatar_url
            )
          `)
          .eq('tournament_id', tournament.id)
          .range(from, to)
    )

    if (entries.length === 0) {
      return NextResponse.json([])
    }

    const entryIds = entries.map((e) => e.id)

    // Get all group predictions (paginated — entries × groups can exceed 1,000)
    const groupPredictions = await fetchAllRows<Record<string, unknown> & { entry_id: string }>(
      (from, to) =>
        supabase
          .from('group_predictions')
          .select(`
            *,
            group:groups (*),
            predicted_1st_team:teams!group_predictions_predicted_1st_fkey (*),
            predicted_2nd_team:teams!group_predictions_predicted_2nd_fkey (*),
            predicted_3rd_team:teams!group_predictions_predicted_3rd_fkey (*)
          `)
          .in('entry_id', entryIds)
          .range(from, to)
    )

    // Get knockout predictions only if visible (paginated — entries × matches can exceed 1,000)
    let knockoutPredictions: (Record<string, unknown> & { entry_id: string })[] | null = null
    if (knockoutPredictionsVisible) {
      knockoutPredictions = await fetchAllRows<Record<string, unknown> & { entry_id: string }>(
        (from, to) =>
          supabase
            .from('knockout_predictions')
            .select(`
              *,
              match:knockout_matches (*),
              predicted_winner:teams!knockout_predictions_predicted_winner_id_fkey (*)
            `)
            .in('entry_id', entryIds)
            .range(from, to)
      )
    }

    // Assemble per-player summary
    const summaries = entries.map((entry) => {
      const player = entry.player as unknown as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }
      return {
        entry_id: entry.id,
        player: {
          id: entry.player_id,
          display_name: player?.display_name ?? 'Unknown',
          nickname: player?.nickname ?? null,
          avatar_url: player?.avatar_url ?? null,
        },
        tiebreaker_goals: entry.tiebreaker_goals,
        group_predictions: (groupPredictions ?? []).filter((gp) => gp.entry_id === entry.id),
        knockout_predictions: knockoutPredictionsVisible
          ? (knockoutPredictions ?? []).filter((kp) => kp.entry_id === entry.id)
          : null,
      }
    })

    return NextResponse.json(summaries)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
