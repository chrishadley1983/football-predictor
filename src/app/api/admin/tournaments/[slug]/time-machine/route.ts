import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateAllScores } from '@/lib/scoring'
import {
  TEST_PLAYERS,
  TEST_EMAIL_DOMAIN,
  generateGroupPrediction,
  generateTiebreakerGoals,
  generateKnockoutPrediction,
  forceCompleteGroupStageLogic,
  forceCompleteKnockoutRoundLogic,
  getExistingKnockoutRounds,
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
    const body = await request.json()
    const targetPhase: Phase = body.phase

    if (!targetPhase || !PHASE_ORDER.includes(targetPhase)) {
      return NextResponse.json(
        { error: `Invalid phase. Valid: ${PHASE_ORDER.join(', ')}` },
        { status: 400 }
      )
    }

    const { data: tournament } = await admin
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const tournamentId = tournament.id
    const log: string[] = []

    // ========== STEP 1: RESET ==========
    const resetResult = await resetTestData(admin, tournamentId)
    log.push(`Reset: ${resetResult.entries_deleted} entries deleted`)

    // ========== STEP 2: SEED ENTRIES ==========
    const seedResult = await seedEntries(admin, tournamentId)
    log.push(`Seeded: ${seedResult.entries_created} entries, ${seedResult.predictions_created} predictions`)

    // ========== STEP 3: SEED RESULTS ==========
    const targetPhaseIndex = PHASE_ORDER.indexOf(targetPhase)

    // Group stage
    await forceCompleteGroupStageLogic(admin, tournamentId, tournament.third_place_qualifiers_count)
    log.push('Group stage completed')

    // Set total goals
    const totalGoals = Math.floor(Math.random() * 91) + 80
    await admin
      .from('tournament_stats')
      .upsert({ tournament_id: tournamentId, total_group_stage_goals: totalGoals }, { onConflict: 'tournament_id' })
    log.push(`Total goals: ${totalGoals}`)

    await admin.from('tournaments').update({ status: 'knockout_closed' }).eq('id', tournamentId)

    // Seed knockout predictions for matches with populated teams
    await seedKnockoutPredictions(admin, tournamentId)
    log.push('Knockout predictions seeded')

    // Knockout phases
    if (targetPhaseIndex > 0) {
      const existingRounds = await getExistingKnockoutRounds(admin, tournamentId)

      for (let i = 1; i <= targetPhaseIndex; i++) {
        const phase = PHASE_ORDER[i]
        const round = PHASE_TO_ROUND[phase]
        if (!round || !existingRounds.includes(round)) continue

        const result = await forceCompleteKnockoutRoundLogic(admin, tournamentId, round)
        log.push(`${round}: ${result.decidedCount} matches decided`)

        // Seed predictions for newly populated matches
        await seedKnockoutPredictions(admin, tournamentId)

        if (phase === 'completed') {
          await admin.from('tournaments').update({ status: 'completed' }).eq('id', tournamentId)
          log.push('Tournament completed')
        }
      }
    }

    // Calculate all scores
    await calculateAllScores(tournamentId)
    log.push('Scores calculated')

    // Get leaderboard preview
    const leaderboard = await getTopLeaderboard(admin, tournamentId, 5)

    return NextResponse.json({
      success: true,
      phase: targetPhase,
      log,
      leaderboard,
    })
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================================
// Inline helpers (simplified versions of the individual route logic)
// ============================================================================

async function resetTestData(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string
) {
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('tournament_id', tournamentId)

  const entryIds = (entries ?? []).map((e) => e.id)

  const { data: groups } = await admin
    .from('groups')
    .select('id')
    .eq('tournament_id', tournamentId)

  const groupIds = (groups ?? []).map((g) => g.id)

  if (entryIds.length > 0) {
    await admin.from('knockout_predictions').delete().in('entry_id', entryIds)
    await admin.from('group_predictions').delete().in('entry_id', entryIds)
    await admin.from('tournament_entries').delete().eq('tournament_id', tournamentId)
  }

  if (groupIds.length > 0) {
    await admin.from('group_results').delete().in('group_id', groupIds)
  }

  await admin.from('honours').delete().eq('tournament_id', tournamentId)
  await admin.from('tournament_stats').update({ total_group_stage_goals: null }).eq('tournament_id', tournamentId)

  // Reset knockout matches
  const { data: knockoutMatches } = await admin
    .from('knockout_matches')
    .select('id, home_source, away_source')
    .eq('tournament_id', tournamentId)

  if (knockoutMatches) {
    for (const match of knockoutMatches) {
      const updateFields: Record<string, null> = { winner_team_id: null }
      if (match.home_source) updateFields.home_team_id = null
      if (match.away_source) updateFields.away_team_id = null
      await admin.from('knockout_matches').update(updateFields).eq('id', match.id)
    }
  }

  await admin.from('players').delete().like('email', `%${TEST_EMAIL_DOMAIN}`)
  await admin.from('tournaments').update({ status: 'group_stage_open' }).eq('id', tournamentId)

  return { entries_deleted: entryIds.length }
}

async function seedEntries(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string
) {
  const { data: groups } = await admin
    .from('groups')
    .select(`id, name, group_teams ( team_id, seed_position )`)
    .eq('tournament_id', tournamentId)
    .order('sort_order')

  if (!groups || groups.length === 0) throw new Error('No groups found')

  let playersCreated = 0
  let entriesCreated = 0
  let predictionsCreated = 0

  for (const testPlayer of TEST_PLAYERS) {
    const { data: existingPlayer } = await admin
      .from('players')
      .select('id')
      .eq('email', testPlayer.email)
      .single()

    let playerId: string

    if (existingPlayer) {
      playerId = existingPlayer.id
    } else {
      const { data: newPlayer, error } = await admin
        .from('players')
        .insert({
          auth_user_id: null,
          display_name: testPlayer.display_name,
          nickname: testPlayer.nickname,
          email: testPlayer.email,
        })
        .select('id')
        .single()

      if (error || !newPlayer) throw new Error(`Failed to create player: ${error?.message}`)
      playerId = newPlayer.id
      playersCreated++
    }

    const { data: existingEntry } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .single()

    let entryId: string

    if (existingEntry) {
      entryId = existingEntry.id
    } else {
      const { data: newEntry, error } = await admin
        .from('tournament_entries')
        .insert({
          tournament_id: tournamentId,
          player_id: playerId,
          payment_status: 'paid',
          tiebreaker_goals: generateTiebreakerGoals(testPlayer.archetype),
          group_stage_points: 0,
          knockout_points: 0,
        })
        .select('id')
        .single()

      if (error || !newEntry) throw new Error(`Failed to create entry: ${error?.message}`)
      entryId = newEntry.id
      entriesCreated++
    }

    for (const group of groups) {
      const { data: existingPred } = await admin
        .from('group_predictions')
        .select('id')
        .eq('entry_id', entryId)
        .eq('group_id', group.id)
        .single()

      if (existingPred) continue

      const sortedTeams = [...group.group_teams]
        .sort((a, b) => (a.seed_position ?? 99) - (b.seed_position ?? 99))
        .map((gt) => gt.team_id)

      const prediction = generateGroupPrediction(sortedTeams, testPlayer.archetype)

      await admin.from('group_predictions').insert({
        entry_id: entryId,
        group_id: group.id,
        ...prediction,
        points_earned: 0,
      })
      predictionsCreated++
    }
  }

  return { players_created: playersCreated, entries_created: entriesCreated, predictions_created: predictionsCreated }
}

async function seedKnockoutPredictions(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string
) {
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, player:players!tournament_entries_player_id_fkey ( email )')
    .eq('tournament_id', tournamentId)

  if (!entries || entries.length === 0) return

  const { data: matches } = await admin
    .from('knockout_matches')
    .select('id, home_team_id, away_team_id')
    .eq('tournament_id', tournamentId)
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null)

  if (!matches || matches.length === 0) return

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
    const email = (entry.player as { email: string } | null)?.email ?? ''
    const player = TEST_PLAYERS.find((p) => p.email === email)
    const archetype = player?.archetype ?? 'average' as const

    for (const match of matches) {
      const key = `${entry.id}:${match.id}`
      if (existingSet.has(key)) continue

      inserts.push({
        entry_id: entry.id,
        match_id: match.id,
        predicted_winner_id: generateKnockoutPrediction(match.home_team_id!, match.away_team_id!, archetype),
        points_earned: 0,
      })
    }
  }

  for (let i = 0; i < inserts.length; i += 100) {
    await admin.from('knockout_predictions').insert(inserts.slice(i, i + 100))
  }
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
