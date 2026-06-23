import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlayer } from '@/lib/auth'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { PredictionGrid } from '@/components/predictions/PredictionGrid'
import { PredictionAnalyser } from '@/components/predictions/PredictionAnalyser'
import { PredictionsByCountry } from '@/components/predictions/PredictionsByCountry'
import { PredictionsByCountryKnockout } from '@/components/predictions/PredictionsByCountryKnockout'
import type { EntryInfo } from '@/components/predictions/PredictionAnalyser'
import { getDeadlineStatus } from '@/lib/utils'
import { computeDecidedTeamIds } from '@/lib/decided-teams'
import { DeadlineCountdown } from '@/components/ui/Deadline'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import { GoldenTicketSummary } from '@/components/bracket/GoldenTicketSummary'
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
  GoldenTicketWithDetails,
  Player,
  PlayerAchievement,
  TournamentEntry,
} from '@/lib/types'

export default async function PredictionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ stage?: string }>
}) {
  const { slug } = await params
  const forceGroup = (await searchParams)?.stage === 'group'
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

  // Check if current user is admin
  let isAdmin = false
  if (currentPlayer) {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    isAdmin = authUser?.app_metadata?.role === 'admin'
  }

  // Don't show predictions before deadline (unless admin)
  if (!groupDeadline.passed && t.status === 'group_stage_open' && !isAdmin) {
    // Fetch entries to show who has entered
    const { data: enteredPlayers } = await supabase
      .from('tournament_entries')
      .select('id, player:players (id, display_name, nickname, avatar_url)')
      .eq('tournament_id', t.id)

    return (
      <div className="space-y-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {t.name} - All Predictions
        </h1>
        <div className="rounded-md bg-yellow-accent/10 p-4 text-sm text-yellow-accent">
          Predictions will be visible after the group stage deadline has passed.
          <br />
          <DeadlineCountdown deadline={t.group_stage_deadline} showTime />
        </div>

        {/* Show who has entered */}
        {enteredPlayers && enteredPlayers.length > 0 && (
          <div className="rounded-xl border border-border-custom bg-surface p-4">
            <h3 className="mb-3 font-heading text-sm font-bold text-foreground">
              Players Entered ({enteredPlayers.length})
            </h3>
            <div className="flex flex-wrap gap-3">
              {enteredPlayers.map((entry) => {
                const player = entry.player as unknown as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }
                return (
                  <div key={entry.id} className="flex items-center gap-2 rounded-lg border border-border-custom bg-surface-light px-3 py-2">
                    <PlayerAvatar avatarUrl={player?.avatar_url ?? null} displayName={player?.display_name ?? 'Unknown'} size="sm" />
                    <span className="text-sm text-foreground">
                      {player?.nickname ?? player?.display_name ?? 'Unknown'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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

  // Fetch all entries with players (includes score fields) — paginated
  const entries = await fetchAllRows<TournamentEntry & { player: Player }>((from, to) =>
    supabase
      .from('tournament_entries')
      .select(
        `
      *,
      player:players (*)
    `
      )
      .eq('tournament_id', t.id)
      .range(from, to)
  )

  // Fetch all group predictions (paginated — entries × groups can exceed 1,000)
  const entryIds = entries.map((e) => e.id)
  const allGroupPredictions =
    entryIds.length > 0
      ? await fetchAllRows<GroupPrediction>((from, to) =>
          supabase.from('group_predictions').select('*').in('entry_id', entryIds).range(from, to)
        )
      : []

  // Fetch group results
  const groupIds = ((groups as GroupWithTeams[]) ?? []).map((g) => g.id)
  const { data: groupResults } =
    groupIds.length > 0
      ? await supabase
          .from('group_results')
          .select('*')
          .in('group_id', groupIds)
      : { data: [] }

  // Everyone's knockout brackets become visible only once the bracket CLOSES —
  // i.e. kickoff of the first knockout game (status knockout_closed). While the
  // bracket is still OPEN, players are entering their picks, so the page shows
  // ONLY the group predictions (no peeking at others' brackets) — for everyone,
  // admins included, so this page mirrors what real players see.
  // `forceGroup` (?stage=group) is the Group-Stage look-back.
  const knockoutPublic = ['knockout_closed', 'completed'].includes(t.status)
  const knockoutVisible = knockoutPublic && !forceGroup
  // Once the knockout brackets are shown, the Group Stage predictions are no
  // longer relevant (only the score carries over) — hide them on the main view.
  const hideGroups = knockoutPublic && !forceGroup

  // Fetch knockout data if visible
  let allKnockoutPredictions: KnockoutPrediction[] = []
  let knockoutMatches: KnockoutMatch[] = []

  if (knockoutVisible && entryIds.length > 0) {
    // Paginated — entries × matches can exceed 1,000
    const koPreds = await fetchAllRows<KnockoutPrediction>((from, to) =>
      supabase.from('knockout_predictions').select('*').in('entry_id', entryIds).range(from, to)
    )

    allKnockoutPredictions = koPreds as KnockoutPrediction[]

    const { data: koMatches } = await supabase
      .from('knockout_matches')
      .select('*')
      .eq('tournament_id', t.id)
      .order('sort_order')

    knockoutMatches = (koMatches ?? []) as KnockoutMatch[]
  }

  // Fetch golden tickets for this tournament
  let goldenTickets: GoldenTicketWithDetails[] = []
  if (knockoutVisible) {
    const { data: gtData } = await supabase
      .from('golden_tickets')
      .select(`
        *,
        original_team:teams!golden_tickets_original_team_id_fkey (*),
        new_team:teams!golden_tickets_new_team_id_fkey (*),
        original_match:knockout_matches!golden_tickets_original_match_id_fkey (*)
      `)
      .eq('tournament_id', t.id)

    goldenTickets = (gtData ?? []) as unknown as GoldenTicketWithDetails[]
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

  // Only colour-code teams whose group-stage fate is mathematically settled — a
  // team still in the balance stays neutral. See computeDecidedTeamIds.
  const decidedTeamIds = computeDecidedTeamIds((groupResults as GroupResult[]) ?? [])

  // Fetch achievements for this tournament
  const { data: achievements } = await supabase
    .from('player_achievements')
    .select('*')
    .eq('tournament_id', t.id)

  const allTeams = Array.from(teamMap.values())

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {t.name} — {hideGroups ? 'Knockout Predictions' : forceGroup ? 'Group Stage Predictions' : 'All Predictions'}
        </h1>
        {/* Cross-link between the knockout view and the group-stage look-back */}
        {knockoutPublic && (
          forceGroup ? (
            <Link
              href={`/tournament/${slug}/predictions`}
              className="text-sm font-medium text-gold hover:underline"
            >
              ← Back to Knockout predictions
            </Link>
          ) : (
            <Link
              href={`/tournament/${slug}/predictions/groups`}
              className="text-sm font-medium text-text-secondary hover:text-gold hover:underline"
            >
              Look back at Group Stage predictions →
            </Link>
          )
        )}
      </div>

      {/* Points Scoring Key — reflects the relevant stage */}
      <div className="rounded-xl border border-border-custom bg-surface p-4">
        <h3 className="mb-2 font-heading text-sm font-bold text-foreground">
          {hideGroups ? 'Knockout Scoring Key' : 'Group Stage Scoring Key'}
        </h3>
        {hideGroups ? (
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-text-secondary">Points double each round for each correct winner:</span>
            <span className="text-text-secondary"><strong className="text-foreground">R32</strong> 1 pt</span>
            <span className="text-text-secondary"><strong className="text-foreground">R16</strong> 2 pts</span>
            <span className="text-text-secondary"><strong className="text-foreground">QF</strong> 4 pts</span>
            <span className="text-text-secondary"><strong className="text-foreground">SF</strong> 8 pts</span>
            <span className="text-text-secondary"><strong className="text-gold">Final</strong> 16 pts</span>
            <span className="text-text-secondary"><strong className="text-red-accent">Emergency Sub</strong> −6 pts</span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded bg-green-accent/20"></span>
              <span className="text-text-secondary"><strong className="text-green-accent">2 pts</strong> — Correct team in correct position</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded bg-yellow-accent/20"></span>
              <span className="text-text-secondary"><strong className="text-yellow-accent">1 pt</strong> — Correct qualifier, wrong position</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 rounded bg-red-accent/20"></span>
              <span className="text-text-secondary"><strong className="text-red-accent">0 pts</strong> — Team did not qualify</span>
            </div>
          </div>
        )}
      </div>

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
        hideGroups={hideGroups}
        achievements={(achievements ?? []) as PlayerAchievement[]}
        goldenTickets={goldenTickets}
        decidedTeamIds={decidedTeamIds}
      />

      {hideGroups ? (
        <PredictionsByCountryKnockout
          predictions={predictions}
          knockoutMatches={knockoutMatches}
          teams={allTeams}
        />
      ) : (
        <PredictionsByCountry
          predictions={predictions}
          groups={((groups as GroupWithTeams[]) ?? [])}
        />
      )}

      {/* Predictions grid comes BEFORE the Emergency Sub table */}
      <PredictionGrid
        predictions={predictions}
        groups={((groups as GroupWithTeams[]) ?? [])}
        results={((groupResults as GroupResult[]) ?? [])}
        thirdPlaceQualifiersCount={
          (tournament as Record<string, unknown>)
            .third_place_qualifiers_count as number | null
        }
        knockoutMatches={knockoutMatches}
        knockoutVisible={knockoutVisible}
        goldenTickets={goldenTickets}
        hideGroups={hideGroups}
        useShortNames
        decidedTeamIds={decidedTeamIds}
      />

      {/* Emergency Sub roster — after the predictions */}
      {knockoutVisible && entryInfos.length > 0 && (
        <GoldenTicketSummary tickets={goldenTickets} entries={entryInfos} />
      )}
    </div>
  )
}
