import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Get tournament details with groups, teams, and knockout config
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
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

    // Get groups with teams
    const { data: groups } = await supabase
      .from('groups')
      .select(`
        *,
        group_teams (
          *,
          team:teams (*)
        )
      `)
      .eq('tournament_id', tournament.id)
      .order('sort_order')

    // Get knockout round config
    const { data: knockoutConfig } = await supabase
      .from('knockout_round_config')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('sort_order')

    // Get knockout matches
    const { data: knockoutMatches } = await supabase
      .from('knockout_matches')
      .select(`
        *,
        home_team:teams!knockout_matches_home_team_id_fkey (*),
        away_team:teams!knockout_matches_away_team_id_fkey (*),
        winner_team:teams!knockout_matches_winner_team_id_fkey (*)
      `)
      .eq('tournament_id', tournament.id)
      .order('sort_order')

    return NextResponse.json({
      ...tournament,
      groups: groups ?? [],
      knockout_round_config: knockoutConfig ?? [],
      knockout_matches: knockoutMatches ?? [],
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
