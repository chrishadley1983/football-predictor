import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { sendAuditEmail } from '@/lib/email/audit'
import type { KnockoutPredictionChange } from '@/lib/email/audit'

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

const ROUND_SHORT: Record<string, string> = {
  round_of_32: 'R32',
  round_of_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  final: 'F',
}

type MatchInfo = {
  id: string
  round: string
  match_number: number
  home_team_id: string | null
  away_team_id: string | null
}

type Diff = {
  matchId: string
  old: string | null
  new: string
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

    let matches: MatchInfo[] = []

    // Validate all predictions: match must belong to tournament and winner must be a participant
    if (predictions.length > 0) {
      const matchIds = predictions.map((p: { match_id: string }) => p.match_id)
      const { data: matchesData } = await supabase
        .from('knockout_matches')
        .select('id, round, match_number, home_team_id, away_team_id')
        .eq('tournament_id', tournament.id)
        .in('id', matchIds)

      if (!matchesData) {
        return NextResponse.json({ error: 'Failed to look up matches' }, { status: 500 })
      }
      matches = matchesData as MatchInfo[]

      const matchMap = new Map(matches.map((m) => [m.id, m]))

      for (const pred of predictions) {
        const match = matchMap.get(pred.match_id)
        if (!match) {
          return NextResponse.json(
            { error: `Match ${pred.match_id} not found in this tournament` },
            { status: 400 }
          )
        }
        if (
          pred.predicted_winner_id !== match.home_team_id &&
          pred.predicted_winner_id !== match.away_team_id
        ) {
          return NextResponse.json(
            { error: `Predicted winner is not a participant in match ${pred.match_id}` },
            { status: 400 }
          )
        }
      }
    }

    // Upsert each knockout prediction, capturing before/after for the audit email
    const diffs: Diff[] = []
    for (const pred of predictions) {
      // Capture existing prediction for diffing
      const { data: existing } = await supabase
        .from('knockout_predictions')
        .select('id, predicted_winner_id')
        .eq('entry_id', entry.id)
        .eq('match_id', pred.match_id)
        .maybeSingle()

      diffs.push({
        matchId: pred.match_id,
        old: existing?.predicted_winner_id ?? null,
        new: pred.predicted_winner_id,
      })

      if (existing) {
        // Update existing prediction (preserve points_earned)
        const { error: updateErr } = await supabase
          .from('knockout_predictions')
          .update({
            predicted_winner_id: pred.predicted_winner_id,
          })
          .eq('id', existing.id)

        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 400 })
        }
      } else {
        // Insert new prediction
        const { error: insertErr } = await supabase
          .from('knockout_predictions')
          .insert({
            entry_id: entry.id,
            match_id: pred.match_id,
            predicted_winner_id: pred.predicted_winner_id,
            points_earned: 0,
          })

        if (insertErr) {
          return NextResponse.json({ error: insertErr.message }, { status: 400 })
        }
      }
    }

    // Audit email: build changes with team names + match labels, skip if nothing changed
    await fireKnockoutPredictionsAudit({
      supabase,
      player,
      tournament,
      diffs,
      matches,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function fireKnockoutPredictionsAudit(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>
  player: { id: string; display_name: string; nickname: string | null; email: string }
  tournament: { id: string; name: string; slug: string; year: number }
  diffs: Diff[]
  matches: MatchInfo[]
}): Promise<void> {
  const { supabase, player, tournament, diffs, matches } = opts
  if (diffs.length === 0) return

  const matchById = new Map(matches.map((m) => [m.id, m]))

  // Batch-fetch team names for all teams referenced
  const teamIds = new Set<string>()
  for (const d of diffs) {
    if (d.old) teamIds.add(d.old)
    if (d.new) teamIds.add(d.new)
  }
  for (const m of matches) {
    if (m.home_team_id) teamIds.add(m.home_team_id)
    if (m.away_team_id) teamIds.add(m.away_team_id)
  }
  const { data: teams } = teamIds.size
    ? await supabase.from('teams').select('id, name').in('id', [...teamIds])
    : { data: [] as { id: string; name: string }[] }
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]))

  const changes: KnockoutPredictionChange[] = diffs.map((d) => {
    const match = matchById.get(d.matchId)
    const short = match ? ROUND_SHORT[match.round] ?? match.round : '?'
    const home = match?.home_team_id ? teamName.get(match.home_team_id) ?? '?' : '?'
    const away = match?.away_team_id ? teamName.get(match.away_team_id) ?? '?' : '?'
    const label = match
      ? `${short} #${match.match_number}: ${home} vs ${away}`
      : 'Unknown match'
    return {
      matchLabel: label,
      old: d.old ? teamName.get(d.old) ?? null : null,
      new: teamName.get(d.new) ?? 'Unknown',
      changed: d.old !== d.new,
    }
  })

  if (!changes.some((c) => c.changed)) return

  void sendAuditEmail({
    event: 'knockout_predictions_submitted',
    player: {
      id: player.id,
      displayName: player.display_name,
      nickname: player.nickname,
      email: player.email,
    },
    tournament: {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      year: tournament.year,
    },
    changes,
  })
}
