import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'

// POST: Register player for tournament
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const player = await requireAuth()
    const { slug } = await params
    const supabase = await createClient()

    // Get tournament
    const { data: tournament, error: tournamentErr } = await supabase
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (tournamentErr || !tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Only allow entry during group_stage_open
    if (tournament.status !== 'group_stage_open') {
      return NextResponse.json(
        { error: 'Tournament is not currently accepting entries' },
        { status: 400 }
      )
    }

    // Check if already entered
    const { data: existing } = await supabase
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('player_id', player.id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Already entered this tournament' },
        { status: 400 }
      )
    }

    // Create entry
    const { data: entry, error: entryErr } = await supabase
      .from('tournament_entries')
      .insert({
        tournament_id: tournament.id,
        player_id: player.id,
        payment_status: 'pending',
        group_stage_points: 0,
        knockout_points: 0,
      })
      .select()
      .single()

    if (entryErr) {
      return NextResponse.json({ error: entryErr.message }, { status: 400 })
    }

    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
