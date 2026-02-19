import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateAllScores } from '@/lib/scoring'
import {
  forceCompleteGroupStageLogic,
  forceCompleteKnockoutRoundLogic,
  getExistingKnockoutRounds,
  generateKnockoutPrediction,
  TEST_EMAIL_DOMAIN,
  TEST_PLAYERS,
} from '@/lib/testing/seed-helpers'
import type { KnockoutRound } from '@/lib/types'

type Phase =
  | 'after_group_stage'
  | 'after_round_of_32'
  | 'after_round_of_16'
  | 'after_quarter_finals'
  | 'after_semi_finals'
  | 'completed'

const PHASE_ORDER: Phase[] = [
  'after_group_stage',
  'after_round_of_32',
  'after_round_of_16',
  'after_quarter_finals',
  'after_semi_finals',
  'completed',
]

// Map phases to the knockout round that gets completed in that phase
const PHASE_TO_ROUND: Record<string, KnockoutRound> = {
  after_round_of_32: 'round_of_32',
  after_round_of_16: 'round_of_16',
  after_quarter_finals: 'quarter_final',
  after_semi_finals: 'semi_final',
  completed: 'final',
}

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
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body = await request.json()
    const targetPhase: Phase = body.phase

    if (!PHASE_ORDER.includes(targetPhase)) {
      return NextResponse.json(
        { error: `Invalid phase: ${targetPhase}. Valid phases: ${PHASE_ORDER.join(', ')}` },
        { status: 400 }
      )
    }

    const tournamentId = tournament.id
    const thirdPlaceCount = tournament.third_place_qualifiers_count
    const targetPhaseIndex = PHASE_ORDER.indexOf(targetPhase)
    const log: string[] = []

    // --- Phase 1: Group stage ---
    try {
      await forceCompleteGroupStageLogic(admin, tournamentId, thirdPlaceCount)
      log.push('Group stage completed with random results')
    } catch (err) {
      return NextResponse.json(
        { error: `Group stage failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
        { status: 500 }
      )
    }

    // Set a random total goals for tiebreaker (realistic range: 80-170)
    const totalGoals = Math.floor(Math.random() * 91) + 80
    await admin
      .from('tournament_stats')
      .upsert({
        tournament_id: tournamentId,
        total_group_stage_goals: totalGoals,
      }, { onConflict: 'tournament_id' })
    log.push(`Total group stage goals set to ${totalGoals}`)

    // Update tournament status past group stage
    await admin
      .from('tournaments')
      .update({ status: 'knockout_closed' })
      .eq('id', tournamentId)

    // Seed knockout predictions for matches that now have teams populated
    await seedKnockoutPredictions(admin, tournamentId)
    log.push('Knockout predictions seeded for populated matches')

    if (targetPhaseIndex === 0) {
      // Just group stage — calculate scores and return
      await calculateAllScores(tournamentId)
      log.push('Scores calculated')

      const leaderboard = await getTopLeaderboard(admin, tournamentId, 3)

      return NextResponse.json({
        success: true,
        phase: targetPhase,
        log,
        leaderboard,
      })
    }

    // --- Subsequent knockout phases ---
    const existingRounds = await getExistingKnockoutRounds(admin, tournamentId)

    for (let i = 1; i <= targetPhaseIndex; i++) {
      const phase = PHASE_ORDER[i]
      const round = PHASE_TO_ROUND[phase]

      if (!round || !existingRounds.includes(round)) {
        // This round doesn't exist for this tournament (e.g., R32 for 8-group tournament)
        continue
      }

      try {
        const result = await forceCompleteKnockoutRoundLogic(admin, tournamentId, round)
        log.push(`${round}: ${result.decidedCount} matches decided`)
      } catch (err) {
        return NextResponse.json(
          { error: `${round} failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
          { status: 500 }
        )
      }

      // Seed knockout predictions for newly populated matches (next round)
      await seedKnockoutPredictions(admin, tournamentId)

      if (phase === 'completed') {
        await admin
          .from('tournaments')
          .update({ status: 'completed' })
          .eq('id', tournamentId)
        log.push('Tournament marked as completed')
      }
    }

    // Calculate all scores
    await calculateAllScores(tournamentId)
    log.push('Scores calculated')

    const leaderboard = await getTopLeaderboard(admin, tournamentId, 3)

    return NextResponse.json({
      success: true,
      phase: targetPhase,
      log,
      leaderboard,
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Seed knockout predictions for all entries, for all matches that have both teams populated
 * and don't already have a prediction for that entry.
 */
async function seedKnockoutPredictions(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string
): Promise<void> {
  // Get all entries with their player emails (to determine archetype)
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, player:players!tournament_entries_player_id_fkey ( email )')
    .eq('tournament_id', tournamentId)

  if (!entries || entries.length === 0) return

  // Get all knockout matches with both teams populated
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('id, home_team_id, away_team_id')
    .eq('tournament_id', tournamentId)
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null)

  if (!matches || matches.length === 0) return

  // Get existing knockout predictions to avoid duplicates
  const entryIds = entries.map((e) => e.id)
  const { data: existingPreds } = await admin
    .from('knockout_predictions')
    .select('entry_id, match_id')
    .in('entry_id', entryIds)

  const existingSet = new Set(
    (existingPreds ?? []).map((p) => `${p.entry_id}:${p.match_id}`)
  )

  const inserts: {
    entry_id: string
    match_id: string
    predicted_winner_id: string
    points_earned: number
  }[] = []

  for (const entry of entries) {
    // Determine archetype from email
    const email = (entry.player as { email: string } | null)?.email ?? ''
    const archetype = email.endsWith(TEST_EMAIL_DOMAIN)
      ? getArchetypeFromEmail(email)
      : 'average' as const

    for (const match of matches) {
      const key = `${entry.id}:${match.id}`
      if (existingSet.has(key)) continue

      const predictedWinner = generateKnockoutPrediction(
        match.home_team_id!,
        match.away_team_id!,
        archetype
      )

      inserts.push({
        entry_id: entry.id,
        match_id: match.id,
        predicted_winner_id: predictedWinner,
        points_earned: 0,
      })
    }
  }

  if (inserts.length > 0) {
    // Insert in batches of 100 to avoid payload limits
    for (let i = 0; i < inserts.length; i += 100) {
      const batch = inserts.slice(i, i + 100)
      await admin.from('knockout_predictions').insert(batch)
    }
  }
}

function getArchetypeFromEmail(email: string): 'expert' | 'average' | 'wildcard' {
  const player = TEST_PLAYERS.find((p) => p.email === email)
  return player?.archetype ?? 'average'
}

async function getTopLeaderboard(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  limit: number
) {
  const { data } = await admin
    .from('tournament_entries')
    .select(`
      id,
      group_stage_points,
      knockout_points,
      total_points,
      tiebreaker_diff,
      overall_rank,
      player:players!tournament_entries_player_id_fkey ( display_name, nickname )
    `)
    .eq('tournament_id', tournamentId)
    .order('overall_rank', { ascending: true, nullsFirst: false })
    .limit(limit)

  return (data ?? []).map((e) => ({
    rank: e.overall_rank,
    name: (e.player as { nickname: string | null; display_name: string } | null)?.nickname
      ?? (e.player as { display_name: string } | null)?.display_name
      ?? 'Unknown',
    group_stage_points: e.group_stage_points,
    knockout_points: e.knockout_points,
    total_points: e.total_points,
    tiebreaker_diff: e.tiebreaker_diff,
  }))
}
