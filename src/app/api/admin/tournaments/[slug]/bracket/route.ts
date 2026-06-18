import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  populateKnockoutFromGroupResults,
  buildGroupResultsLookup,
} from '@/lib/testing/seed-helpers'

// POST: place the qualifying teams into the Round of 32 slots.
//
//   { action: 'auto' }
//     Resolve every R32 slot from the entered/derived group results
//     (1A, 2B, best-3rd composites, …) in one pass.
//
//   { action: 'manual', assignments: [{ match_id, home_team_id, away_team_id }] }
//     Set each R32 slot explicitly. Send all 16 matches; a team may only appear
//     in one slot.
//
// Only the Round of 32 is set here — every later round flows from match winners.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body = await request.json()

    // ---- Auto-fill from group results --------------------------------------
    if (body.action === 'auto') {
      const { data: groups } = await admin
        .from('groups')
        .select('id, name')
        .eq('tournament_id', tournament.id)
        .order('sort_order')

      if (!groups || groups.length === 0) {
        return NextResponse.json({ error: 'No groups found for this tournament' }, { status: 400 })
      }

      const lookup = await buildGroupResultsLookup(admin, groups)
      if (Object.keys(lookup).length === 0) {
        return NextResponse.json(
          { error: 'No group results yet — enter or simulate group results first' },
          { status: 400 }
        )
      }

      await populateKnockoutFromGroupResults(admin, tournament.id, lookup)

      const { count } = await admin
        .from('knockout_matches')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
        .eq('round', 'round_of_32')
        .not('home_team_id', 'is', null)

      return NextResponse.json({ success: true, mode: 'auto', r32_slots_filled: count ?? 0 })
    }

    // ---- Manual placement ---------------------------------------------------
    const assignments = body.assignments as
      | { match_id: string; home_team_id: string | null; away_team_id: string | null }[]
      | undefined

    if (!Array.isArray(assignments)) {
      return NextResponse.json({ error: 'assignments must be an array' }, { status: 400 })
    }

    // Validate the targets are this tournament's Round of 32 matches, and load
    // the CURRENT slot state so a partial payload can't create cross-slot dupes.
    const { data: r32Matches } = await admin
      .from('knockout_matches')
      .select('id, home_team_id, away_team_id')
      .eq('tournament_id', tournament.id)
      .eq('round', 'round_of_32')

    const slotState = new Map<string, { home: string | null; away: string | null }>()
    for (const m of r32Matches ?? []) slotState.set(m.id, { home: m.home_team_id, away: m.away_team_id })

    for (const a of assignments) {
      if (!slotState.has(a.match_id)) {
        return NextResponse.json(
          { error: `Match ${a.match_id} is not a Round of 32 match in this tournament` },
          { status: 400 }
        )
      }
      // Overlay the submitted assignment onto the current bracket state.
      slotState.set(a.match_id, { home: a.home_team_id ?? null, away: a.away_team_id ?? null })
    }

    // A team may only occupy a single R32 slot across the WHOLE bracket (current
    // state merged with the submitted assignments), so even a partial payload
    // can't leave the same team sitting in two slots.
    const seen = new Map<string, number>()
    for (const s of slotState.values()) {
      for (const teamId of [s.home, s.away]) {
        if (!teamId) continue
        seen.set(teamId, (seen.get(teamId) ?? 0) + 1)
      }
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
    if (dupes.length > 0) {
      return NextResponse.json(
        { error: 'Each team can only be placed in one slot. Duplicate team(s) detected.', duplicateTeamIds: dupes },
        { status: 400 }
      )
    }

    let updated = 0
    for (const a of assignments) {
      const { error } = await admin
        .from('knockout_matches')
        .update({ home_team_id: a.home_team_id ?? null, away_team_id: a.away_team_id ?? null })
        .eq('id', a.match_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      updated++
    }

    return NextResponse.json({ success: true, mode: 'manual', matches_updated: updated })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
