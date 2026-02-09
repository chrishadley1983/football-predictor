import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Get leaderboard data (all entries with rankings, sorted)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
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

    // Get all entries with player info, sorted by overall rank
    const { data: entries, error } = await supabase
      .from('tournament_entries')
      .select(`
        id,
        player_id,
        payment_status,
        tiebreaker_goals,
        group_stage_points,
        knockout_points,
        total_points,
        tiebreaker_diff,
        group_stage_rank,
        overall_rank,
        player:players (
          id,
          display_name,
          nickname,
          avatar_url
        )
      `)
      .eq('tournament_id', tournament.id)
      .order('overall_rank', { ascending: true, nullsFirst: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Flatten player info into the leaderboard entry format
    const leaderboard = (entries ?? []).map((e) => {
      const player = e.player as unknown as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }
      return {
        entry_id: e.id,
        player_id: e.player_id,
        display_name: player?.display_name ?? 'Unknown',
        nickname: player?.nickname ?? null,
        avatar_url: player?.avatar_url ?? null,
        group_stage_points: e.group_stage_points,
        knockout_points: e.knockout_points,
        total_points: e.total_points,
        tiebreaker_goals: e.tiebreaker_goals,
        tiebreaker_diff: e.tiebreaker_diff,
        group_stage_rank: e.group_stage_rank,
        overall_rank: e.overall_rank,
        payment_status: e.payment_status,
      }
    })

    return NextResponse.json(leaderboard)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
