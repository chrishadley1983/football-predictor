import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAuditEmail } from '@/lib/email/audit'
import {
  getGoldenTicketWindow,
  getEligibleSwaps,
  applyGoldenTicket,
} from '@/lib/golden-ticket'

const ROUND_SHORT: Record<string, string> = {
  round_of_32: 'R32',
  round_of_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  final: 'F',
}

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
    if (window.isOpen && !usedTicket && window.completedRound) {
      eligibleSwaps = await getEligibleSwaps(
        admin,
        tournament.id,
        entry.id,
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
    const { match_id } = body

    if (!match_id) {
      return NextResponse.json(
        { error: 'match_id is required' },
        { status: 400 }
      )
    }

    // Validate the match is in the completed round and the player predicted wrong
    const eligibleSwaps = await getEligibleSwaps(
      admin,
      tournament.id,
      entry.id,
      window.completedRound
    )

    const swap = eligibleSwaps.find((s) => s.match_id === match_id)
    if (!swap) {
      return NextResponse.json(
        { error: 'This match is not eligible for a golden ticket swap' },
        { status: 400 }
      )
    }

    // Apply the golden ticket — swap to the actual winner
    await applyGoldenTicket(
      admin,
      tournament.id,
      entry.id,
      match_id,
      swap.winner_team_id,
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

    // Fire audit email.
    if (createdTicket) {
      const { data: tournamentInfo } = await admin
        .from('tournaments')
        .select('id, name, slug, year')
        .eq('id', tournament.id)
        .single()

      const originalTeam = Array.isArray(createdTicket.original_team)
        ? createdTicket.original_team[0]
        : createdTicket.original_team
      const newTeam = Array.isArray(createdTicket.new_team)
        ? createdTicket.new_team[0]
        : createdTicket.new_team
      const originalMatch = Array.isArray(createdTicket.original_match)
        ? createdTicket.original_match[0]
        : createdTicket.original_match

      if (tournamentInfo && newTeam && originalMatch) {
        const shortRound = ROUND_SHORT[originalMatch.round] ?? originalMatch.round
        void sendAuditEmail({
          event: 'golden_ticket_played',
          player: {
            id: player.id,
            displayName: player.display_name,
            nickname: player.nickname,
            email: player.email,
          },
          tournament: {
            id: tournamentInfo.id,
            name: tournamentInfo.name,
            slug: tournamentInfo.slug,
            year: tournamentInfo.year,
          },
          swap: {
            round: shortRound,
            matchLabel: `${shortRound} #${originalMatch.match_number}`,
            oldTeam: originalTeam?.name ?? null,
            newTeam: newTeam.name,
          },
        })
      }
    }

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
