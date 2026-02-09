import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

// GET: Get player's group predictions
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

    // Get group predictions with team details
    const { data: predictions, error } = await supabase
      .from('group_predictions')
      .select(`
        *,
        group:groups (*),
        predicted_1st_team:teams!group_predictions_predicted_1st_fkey (*),
        predicted_2nd_team:teams!group_predictions_predicted_2nd_fkey (*),
        predicted_3rd_team:teams!group_predictions_predicted_3rd_fkey (*)
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

// POST: Submit/update group predictions
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

    // Enforce deadline: tournament must be in group_stage_open and before deadline
    if (tournament.status !== 'group_stage_open') {
      return NextResponse.json(
        { error: 'Group stage predictions are not currently open' },
        { status: 400 }
      )
    }

    if (tournament.group_stage_deadline && new Date(tournament.group_stage_deadline) < new Date()) {
      return NextResponse.json(
        { error: 'Group stage prediction deadline has passed' },
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
    // Expected body: { predictions: [{ group_id, predicted_1st, predicted_2nd, predicted_3rd? }], tiebreaker_goals? }
    const { predictions, tiebreaker_goals } = body

    if (!Array.isArray(predictions)) {
      return NextResponse.json({ error: 'predictions must be an array' }, { status: 400 })
    }

    // Upsert each group prediction
    for (const pred of predictions) {
      const { error: upsertErr } = await supabase
        .from('group_predictions')
        .upsert(
          {
            entry_id: entry.id,
            group_id: pred.group_id,
            predicted_1st: pred.predicted_1st,
            predicted_2nd: pred.predicted_2nd,
            predicted_3rd: pred.predicted_3rd ?? null,
            points_earned: 0,
          },
          { onConflict: 'entry_id,group_id' }
        )

      if (upsertErr) {
        return NextResponse.json({ error: upsertErr.message }, { status: 400 })
      }
    }

    // Update tiebreaker if provided
    if (tiebreaker_goals !== undefined) {
      await supabase
        .from('tournament_entries')
        .update({ tiebreaker_goals })
        .eq('id', entry.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
