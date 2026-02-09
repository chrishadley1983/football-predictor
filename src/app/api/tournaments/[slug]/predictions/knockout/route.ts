import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

// GET: Get player's knockout predictions
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const player = await requireAuth()
    const { slug } = await params
    const supabase = await createClient()

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Get player's entry
    const { data: entry } = await supabase
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('player_id', player.id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Not entered in this tournament' }, { status: 404 })
    }

    // Get knockout predictions with match and team details
    const { data: predictions, error } = await supabase
      .from('knockout_predictions')
      .select(`
        *,
        match:knockout_matches (
          *,
          home_team:teams!knockout_matches_home_team_id_fkey (*),
          away_team:teams!knockout_matches_away_team_id_fkey (*),
          winner_team:teams!knockout_matches_winner_team_id_fkey (*)
        ),
        predicted_winner:teams!knockout_predictions_predicted_winner_id_fkey (*)
      `)
      .eq('entry_id', entry.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      entry_id: entry.id,
      predictions: predictions ?? [],
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Submit/update knockout predictions
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const player = await requireAuth()
    const { slug } = await params
    const supabase = await createClient()

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Enforce deadline: tournament must be in knockout_open and before deadline
    if (tournament.status !== 'knockout_open') {
      return NextResponse.json(
        { error: 'Knockout predictions are not currently open' },
        { status: 400 }
      )
    }

    if (
      tournament.knockout_stage_deadline &&
      new Date(tournament.knockout_stage_deadline) < new Date()
    ) {
      return NextResponse.json(
        { error: 'Knockout prediction deadline has passed' },
        { status: 400 }
      )
    }

    // Get player's entry
    const { data: entry } = await supabase
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('player_id', player.id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Not entered in this tournament' }, { status: 404 })
    }

    const body = await request.json()
    // Expected body: { predictions: [{ match_id, predicted_winner_id }] }
    const { predictions } = body

    if (!Array.isArray(predictions)) {
      return NextResponse.json({ error: 'predictions must be an array' }, { status: 400 })
    }

    // Upsert each knockout prediction
    for (const pred of predictions) {
      const { error: upsertErr } = await supabase
        .from('knockout_predictions')
        .upsert(
          {
            entry_id: entry.id,
            match_id: pred.match_id,
            predicted_winner_id: pred.predicted_winner_id,
            points_earned: 0,
          },
          { onConflict: 'entry_id,match_id' }
        )

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
