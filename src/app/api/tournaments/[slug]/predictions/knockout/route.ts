import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { scheduleAuditEmail } from '@/lib/email/audit'
import { scheduleUserEmail } from '@/lib/email/user'
import type { KnockoutPredictionChange } from '@/lib/email/audit'
import { resolveParticipantIds, type BracketMatchLike } from '@/lib/bracket'

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

type MatchInfo = BracketMatchLike & {
  round: string
}

type Diff = {
  matchId: string
  old: string | null
  new: string | null
}

// POST: Submit/update the player's full knockout bracket + tiebreaker.
//
// The whole bracket is validated as one: each later round's participants flow
// from the player's own predicted winners, so a submitted pick only persists
// when it is bracket-consistent (see resolveParticipantIds). Anything that no
// longer fits is pruned (cleared), and the knockout goal-total tiebreaker is
// saved alongside.
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
    // Expected body: { predictions: [{ match_id, predicted_winner_id }], knockout_tiebreaker_goals?: number | null }
    const { predictions, knockout_tiebreaker_goals } = body

    if (!Array.isArray(predictions)) {
      return NextResponse.json({ error: 'predictions must be an array' }, { status: 400 })
    }

    // Load the WHOLE bracket so downstream W{n} sources can be resolved.
    const { data: matchesData } = await supabase
      .from('knockout_matches')
      .select('id, round, match_number, home_source, away_source, home_team_id, away_team_id')
      .eq('tournament_id', tournament.id)

    if (!matchesData) {
      return NextResponse.json({ error: 'Failed to look up matches' }, { status: 500 })
    }
    const matches = matchesData as MatchInfo[]
    const matchIdSet = new Set(matches.map((m) => m.id))

    // Build the submitted picks record (ignore unknown matches / blank picks).
    const submitted: Record<string, string | null> = {}
    for (const p of predictions as { match_id: string; predicted_winner_id: string | null }[]) {
      if (p && p.match_id && matchIdSet.has(p.match_id) && p.predicted_winner_id) {
        submitted[p.match_id] = p.predicted_winner_id
      }
    }

    // Resolve + validate: validWinners holds only bracket-consistent picks.
    const { participants, validWinners } = resolveParticipantIds(matches, submitted)
    const desired = new Map<string, string>()
    for (const [matchId, winner] of validWinners) {
      if (winner) desired.set(matchId, winner)
    }

    // Existing stored predictions for this entry
    const { data: existingRows } = await supabase
      .from('knockout_predictions')
      .select('id, match_id, predicted_winner_id')
      .eq('entry_id', entry.id)
    const existing = existingRows ?? []
    const existingByMatch = new Map(existing.map((e) => [e.match_id, e]))

    const diffs: Diff[] = []

    // Upsert every desired (valid) pick.
    for (const [matchId, winnerId] of desired) {
      const ex = existingByMatch.get(matchId)
      if (ex) {
        if (ex.predicted_winner_id !== winnerId) {
          const { error: updateErr } = await supabase
            .from('knockout_predictions')
            .update({ predicted_winner_id: winnerId })
            .eq('id', ex.id)
          if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 })
          diffs.push({ matchId, old: ex.predicted_winner_id, new: winnerId })
        }
      } else {
        const { error: insertErr } = await supabase
          .from('knockout_predictions')
          .insert({ entry_id: entry.id, match_id: matchId, predicted_winner_id: winnerId, points_earned: 0 })
        if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 })
        diffs.push({ matchId, old: null, new: winnerId })
      }
    }

    // Clear any stored pick that is no longer bracket-consistent. (RLS only lets
    // a player UPDATE — not DELETE — their own rows, so we null the winner.)
    for (const ex of existing) {
      if (ex.predicted_winner_id && !desired.has(ex.match_id)) {
        const { error: clearErr } = await supabase
          .from('knockout_predictions')
          .update({ predicted_winner_id: null })
          .eq('id', ex.id)
        if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 400 })
        diffs.push({ matchId: ex.match_id, old: ex.predicted_winner_id, new: null })
      }
    }

    // Save the knockout goal-total tiebreaker if it was included in the request.
    if ('knockout_tiebreaker_goals' in body) {
      const raw = knockout_tiebreaker_goals
      const val = raw === null || raw === undefined || raw === '' ? null : Number(raw)
      if (val !== null && (!Number.isInteger(val) || val < 0)) {
        return NextResponse.json(
          { error: 'knockout_tiebreaker_goals must be a whole number of 0 or more' },
          { status: 400 }
        )
      }
      const { error: tbErr } = await supabase
        .from('tournament_entries')
        .update({ knockout_tiebreaker_goals: val })
        .eq('id', entry.id)
      if (tbErr) return NextResponse.json({ error: tbErr.message }, { status: 400 })
    }

    // Audit email: build changes with team names + match labels, skip if nothing changed
    await fireKnockoutPredictionsAudit({
      supabase,
      player,
      tournament,
      diffs,
      matches,
      participants,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function fireKnockoutPredictionsAudit(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>
  player: {
    id: string
    display_name: string
    nickname: string | null
    email: string
    unsubscribe_token: string
    email_notifications_enabled: boolean
  }
  tournament: { id: string; name: string; slug: string; year: number }
  diffs: Diff[]
  matches: MatchInfo[]
  participants: Map<string, { homeTeamId: string | null; awayTeamId: string | null }>
}): Promise<void> {
  const { supabase, player, tournament, diffs, matches, participants } = opts
  if (diffs.length === 0) return

  const matchById = new Map(matches.map((m) => [m.id, m]))

  // Batch-fetch team names for all teams referenced (diffs + resolved participants)
  const teamIds = new Set<string>()
  for (const d of diffs) {
    if (d.old) teamIds.add(d.old)
    if (d.new) teamIds.add(d.new)
  }
  for (const p of participants.values()) {
    if (p.homeTeamId) teamIds.add(p.homeTeamId)
    if (p.awayTeamId) teamIds.add(p.awayTeamId)
  }
  const { data: teams } = teamIds.size
    ? await supabase.from('teams').select('id, name').in('id', [...teamIds])
    : { data: [] as { id: string; name: string }[] }
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]))

  const changes: KnockoutPredictionChange[] = diffs.map((d) => {
    const match = matchById.get(d.matchId)
    const part = participants.get(d.matchId)
    const short = match ? ROUND_SHORT[match.round] ?? match.round : '?'
    const home = part?.homeTeamId ? teamName.get(part.homeTeamId) ?? '?' : '?'
    const away = part?.awayTeamId ? teamName.get(part.awayTeamId) ?? '?' : '?'
    const label = match
      ? `${short} #${match.match_number}: ${home} vs ${away}`
      : 'Unknown match'
    return {
      matchLabel: label,
      old: d.old ? teamName.get(d.old) ?? null : null,
      new: d.new ? teamName.get(d.new) ?? 'Unknown' : 'No pick',
      changed: d.old !== d.new,
    }
  })

  if (!changes.some((c) => c.changed)) return

  scheduleAuditEmail({
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

  // First submission when every diff had no prior pick. Drives subject wording.
  const isFirstSubmission = diffs.every((d) => d.old === null)

  scheduleUserEmail({
    event: 'knockout_predictions_confirmation',
    player: {
      id: player.id,
      displayName: player.display_name,
      email: player.email,
      unsubscribeToken: player.unsubscribe_token,
      notificationsEnabled: player.email_notifications_enabled,
    },
    tournament: {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      year: tournament.year,
    },
    changes,
    isFirstSubmission,
  })
}
