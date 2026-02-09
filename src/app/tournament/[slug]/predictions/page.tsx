import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PredictionGrid } from '@/components/predictions/PredictionGrid'
import { getDeadlineStatus } from '@/lib/utils'
import type { Tournament, GroupWithTeams, PredictionSummary, GroupResult, GroupPrediction, Group, Team } from '@/lib/types'

export default async function PredictionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()

  const t = tournament as Tournament
  const groupDeadline = getDeadlineStatus(t.group_stage_deadline)

  // Don't show predictions before deadline
  if (!groupDeadline.passed && t.status === 'group_stage_open') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.name} - All Predictions</h1>
        <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
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
    .select(`
      *,
      group_teams (
        *,
        team:teams (*)
      )
    `)
    .eq('tournament_id', t.id)
    .order('sort_order')

  // Fetch all entries with players
  const { data: entries } = await supabase
    .from('tournament_entries')
    .select(`
      *,
      player:players (*)
    `)
    .eq('tournament_id', t.id)

  // Fetch all group predictions
  const entryIds = (entries ?? []).map((e) => e.id)
  const { data: allGroupPredictions } = entryIds.length > 0
    ? await supabase
        .from('group_predictions')
        .select('*')
        .in('entry_id', entryIds)
    : { data: [] }

  // Fetch group results
  const groupIds = (groups as GroupWithTeams[] ?? []).map((g) => g.id)
  const { data: groupResults } = groupIds.length > 0
    ? await supabase
        .from('group_results')
        .select('*')
        .in('group_id', groupIds)
    : { data: [] }

  // Build team lookup
  const teamMap = new Map<string, Team>()
  for (const g of (groups as GroupWithTeams[] ?? [])) {
    for (const gt of g.group_teams) {
      teamMap.set(gt.team.id, gt.team)
    }
  }

  // Build group lookup
  const groupMap = new Map<string, Group>()
  for (const g of (groups as GroupWithTeams[] ?? [])) {
    groupMap.set(g.id, g)
  }

  // Build prediction summaries
  const predictions: PredictionSummary[] = (entries ?? []).map((entry) => {
    const gps = (allGroupPredictions ?? [])
      .filter((gp) => gp.entry_id === entry.id)
      .map((gp: GroupPrediction) => ({
        ...gp,
        group: groupMap.get(gp.group_id) as Group,
        predicted_1st_team: gp.predicted_1st ? teamMap.get(gp.predicted_1st) ?? null : null,
        predicted_2nd_team: gp.predicted_2nd ? teamMap.get(gp.predicted_2nd) ?? null : null,
        predicted_3rd_team: gp.predicted_3rd ? teamMap.get(gp.predicted_3rd) ?? null : null,
      }))

    return {
      entry_id: entry.id,
      player: entry.player,
      group_predictions: gps,
      knockout_predictions: [],
    }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.name} - All Predictions</h1>
      <PredictionGrid
        predictions={predictions}
        groups={(groups as GroupWithTeams[]) ?? []}
        results={(groupResults as GroupResult[]) ?? []}
      />
    </div>
  )
}
