import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlayer } from '@/lib/auth'
import { PredictionGrid } from '@/components/predictions/PredictionGrid'
import { PredictionAnalyser } from '@/components/predictions/PredictionAnalyser'
import type { EntryInfo } from '@/components/predictions/PredictionAnalyser'
import { getDeadlineStatus } from '@/lib/utils'
import type {
  Tournament,
  GroupWithTeams,
  PredictionSummary,
  GroupResult,
  GroupPrediction,
  Group,
  Team,
  KnockoutPrediction,
  KnockoutMatch,
  Player,
  PlayerAchievement,
  TournamentEntry,
} from '@/lib/types'

export default async function PredictionsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  // Get current player (null for anon visitors)
  let currentPlayer: { id: string } | null = null
  try {
    currentPlayer = await getCurrentPlayer()
  } catch {
    // Not logged in — that's fine
  }

  const { data: tournament, error: tournamentErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (tournamentErr) console.error('Failed to fetch tournament:', tournamentErr.message)
  if (!tournament) notFound()

  const t = tournament as Tournament
  const groupDeadline = getDeadlineStatus(t.group_stage_deadline)

  // Don't show predictions before deadline
  if (!groupDeadline.passed && t.status === 'group_stage_open') {
    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {t.name} - All Predictions
        </h1>
        <div className="rounded-md bg-yellow-accent/10 p-4 text-sm text-yellow-accent">
          Predictions will be visible after the group stage deadline has passed.
          <br />
          {groupDeadline.label}
        </div>
      </div>
    )
  }

  // Fetch groups with teams
  const { data: groups } = await supabase
    .from('groups')
    .select(
      `
      *,
      group_teams (
        *,
        team:teams (*)
      )
    `
    )
    .eq('tournament_id', t.id)
    .order('sort_order')

  // Fetch all entries with players (includes score fields)
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select(
      `
      *,
      player:players (*)
    `
    )
    .eq('tournament_id', t.id)

  // Fetch all group predictions
  const entryIds = (entries ?? []).map((e) => e.id)
  const { data: allGroupPredictions } =
    entryIds.length > 0
      ? await supabase
          .from('group_predictions')
          .select('*')
          .in('entry_id', entryIds)
      : { data: [] }

  // Fetch group results
  const groupIds = ((groups as GroupWithTeams[]) ?? []).map((g) => g.id)
  const { data: groupResults } =
    groupIds.length > 0
      ? await supabase
          .from('group_results')
          .select('*')
          .in('group_id', groupIds)
      : { data: [] }

  // Knockout visibility
  const knockoutVisible =
    t.status === 'knockout_closed' || t.status === 'completed'

  // Fetch knockout data if visible
  let allKnockoutPredictions: KnockoutPrediction[] = []
  let knockoutMatches: KnockoutMatch[] = []

  if (knockoutVisible && entryIds.length > 0) {
    const { data: koPreds } = await supabase
      .from('knockout_predictions')
      .select('*')
      .in('entry_id', entryIds)

    allKnockoutPredictions = (koPreds ?? []) as KnockoutPrediction[]

    const { data: koMatches } = await supabase
      .from('knockout_matches')
      .select('*')
      .eq('tournament_id', t.id)
      .order('sort_order')

    knockoutMatches = (koMatches ?? []) as KnockoutMatch[]
  }

  // Build team lookup
  const teamMap = new Map<string, Team>()
  for (const g of (groups as GroupWithTeams[]) ?? []) {
    for (const gt of g.group_teams) {
      teamMap.set(gt.team.id, gt.team)
    }
  }

  // Build group lookup
  const groupMap = new Map<string, Group>()
  for (const g of (groups as GroupWithTeams[]) ?? []) {
    groupMap.set(g.id, g)
  }

  // Build prediction summaries (with knockout predictions)
  const predictions: PredictionSummary[] = (entries ?? []).map((entry) => {
    const gps = (allGroupPredictions ?? [])
      .filter((gp) => gp.entry_id === entry.id)
      .map((gp: GroupPrediction) => ({
        ...gp,
        group: groupMap.get(gp.group_id) as Group,
        predicted_1st_team: gp.predicted_1st
          ? teamMap.get(gp.predicted_1st) ?? null
          : null,
        predicted_2nd_team: gp.predicted_2nd
          ? teamMap.get(gp.predicted_2nd) ?? null
          : null,
        predicted_3rd_team: gp.predicted_3rd
          ? teamMap.get(gp.predicted_3rd) ?? null
          : null,
      }))

    const kps = allKnockoutPredictions
      .filter((kp) => kp.entry_id === entry.id)
      .map((kp) => {
        const match = knockoutMatches.find((m) => m.id === kp.match_id)
        return {
          ...kp,
          match: match as KnockoutMatch,
          predicted_winner: kp.predicted_winner_id
            ? teamMap.get(kp.predicted_winner_id) ?? null
            : null,
        }
      })
      .filter((kp) => kp.match) // Only include predictions where match exists

    return {
      entry_id: entry.id,
      player: entry.player as Player,
      group_predictions: gps,
      knockout_predictions: kps,
    }
  })

  // Build entry info for the analyser (includes score data)
  const entryInfos: EntryInfo[] = (entries ?? []).map((entry) => {
    const te = entry as TournamentEntry & { player: Player }
    return {
      entry_id: te.id,
      player_id: te.player_id,
      player: te.player,
      group_stage_points: te.group_stage_points,
      knockout_points: te.knockout_points,
      total_points: te.total_points,
      tiebreaker_goals: te.tiebreaker_goals,
      tiebreaker_diff: te.tiebreaker_diff,
      overall_rank: te.overall_rank,
    }
  })

  // Fetch achievements for this tournament
  const { data: achievements } = await supabase
    .from('player_achievements')
    .select('*')
    .eq('tournament_id', t.id)

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">
        {t.name} - All Predictions
      </h1>
      <PredictionAnalyser
        predictions={predictions}
        groups={((groups as GroupWithTeams[]) ?? [])}
        results={((groupResults as GroupResult[]) ?? [])}
        entries={entryInfos}
        currentPlayerId={currentPlayer?.id ?? null}
        thirdPlaceQualifiersCount={
          (tournament as Record<string, unknown>)
            .third_place_qualifiers_count as number | null
        }
        knockoutMatches={knockoutMatches}
        knockoutVisible={knockoutVisible}
        achievements={(achievements ?? []) as PlayerAchievement[]}
      />
      <PredictionGrid
        predictions={predictions}
        groups={((groups as GroupWithTeams[]) ?? [])}
        results={((groupResults as GroupResult[]) ?? [])}
        thirdPlaceQualifiersCount={
          (tournament as Record<string, unknown>)
            .third_place_qualifiers_count as number | null
        }
      />
    </div>
  )
}
