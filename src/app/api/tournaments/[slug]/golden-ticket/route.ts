import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getGoldenTicketWindow,
  getEligibleSwaps,
  applyGoldenTicket,
} from '@/lib/golden-ticket'

// GET: Get golden ticket state for the current player + all tournament tickets
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const player = await requireAuth()
    const { slug } = await params
    const admin = createAdminClient()

    // Get tournament
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Get player's entry
    const { data: entry } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('player_id', player.id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Not entered in this tournament' }, { status: 404 })
    }

    // Check if player has used their golden ticket
    const { data: usedTicket } = await admin
      .from('golden_tickets')
      .select(`
        *,
        original_team:teams!golden_tickets_original_team_id_fkey (*),
        new_team:teams!golden_tickets_new_team_id_fkey (*),
        original_match:knockout_matches!golden_tickets_original_match_id_fkey (*)
      `)
      .eq('entry_id', entry.id)
      .maybeSingle()

    // Get the current golden ticket window state
    const window = await getGoldenTicketWindow(admin, tournament.id)

    // Get eligible swaps if the window is open and ticket not used
    let eligibleSwaps: Awaited<ReturnType<typeof getEligibleSwaps>> = []
    if (window.isOpen && !usedTicket && window.nextRound && window.completedRound) {
      eligibleSwaps = await getEligibleSwaps(
        admin,
        tournament.id,
        entry.id,
        window.nextRound,
        window.completedRound
      )
    }

    // Get all golden tickets for this tournament (for the summary table)
    const { data: allTickets } = await admin
      .from('golden_tickets')
      .select(`
        *,
        original_team:teams!golden_tickets_original_team_id_fkey (*),
        new_team:teams!golden_tickets_new_team_id_fkey (*),
        original_match:knockout_matches!golden_tickets_original_match_id_fkey (*)
      `)
      .eq('tournament_id', tournament.id)
      .order('played_at')

    return NextResponse.json({
      hasUsedTicket: !!usedTicket,
      ticketDetails: usedTicket ?? null,
      window,
      eligibleSwaps,
      allTickets: allTickets ?? [],
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Play the golden ticket
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const player = await requireAuth()
    const { slug } = await params
    const admin = createAdminClient()

    // Get tournament
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Get player's entry
    const { data: entry } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('player_id', player.id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Not entered in this tournament' }, { status: 404 })
    }

    // Check if player has already used their golden ticket
    const { data: existingTicket } = await admin
      .from('golden_tickets')
      .select('id')
      .eq('entry_id', entry.id)
      .maybeSingle()

    if (existingTicket) {
      return NextResponse.json(
        { error: 'You have already used your golden ticket' },
        { status: 400 }
      )
    }

    // Check golden ticket window is open
    const window = await getGoldenTicketWindow(admin, tournament.id)
    if (!window.isOpen || !window.completedRound || !window.nextRound) {
      return NextResponse.json(
        { error: 'The golden ticket window is not currently open' },
        { status: 400 }
      )
    }

    // Parse and validate the request body
    const body = await request.json()
    const { match_id, new_team_id } = body

    if (!match_id || !new_team_id) {
      return NextResponse.json(
        { error: 'match_id and new_team_id are required' },
        { status: 400 }
      )
    }

    // Validate the match is in the next round
    const { data: match } = await admin
      .from('knockout_matches')
      .select('id, round, home_team_id, away_team_id')
      .eq('id', match_id)
      .eq('tournament_id', tournament.id)
      .eq('round', window.nextRound)
      .single()

    if (!match) {
      return NextResponse.json(
        { error: 'Match not found in the next round' },
        { status: 400 }
      )
    }

    // Validate new_team_id is one of the teams in the match
    if (new_team_id !== match.home_team_id && new_team_id !== match.away_team_id) {
      return NextResponse.json(
        { error: 'Selected team is not a participant in this match' },
        { status: 400 }
      )
    }

    // Validate the player's current prediction for this match is for an eliminated team
    const eligibleSwaps = await getEligibleSwaps(
      admin,
      tournament.id,
      entry.id,
      window.nextRound,
      window.completedRound
    )

    const swap = eligibleSwaps.find((s) => s.match_id === match_id)
    if (!swap) {
      return NextResponse.json(
        { error: 'Your predicted team for this match was not eliminated — no swap needed' },
        { status: 400 }
      )
    }

    // Apply the golden ticket
    await applyGoldenTicket(
      admin,
      tournament.id,
      entry.id,
      match_id,
      new_team_id,
      window.completedRound
    )

    // Fetch the created ticket for the response
    const { data: createdTicket } = await admin
      .from('golden_tickets')
      .select(`
        *,
        original_team:teams!golden_tickets_original_team_id_fkey (*),
        new_team:teams!golden_tickets_new_team_id_fkey (*),
        original_match:knockout_matches!golden_tickets_original_match_id_fkey (*)
      `)
      .eq('entry_id', entry.id)
      .single()

    return NextResponse.json({
      success: true,
      ticket: createdTicket,
    })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
