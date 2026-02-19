import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { GroupResultsCard } from '@/components/groups/GroupResultsCard'
import { GroupFixtures } from '@/components/results/GroupFixtures'
import { KnockoutBracket } from '@/components/bracket/KnockoutBracket'
import type {
  Tournament,
  GroupWithTeams,
  GroupResult,
  GroupMatchWithTeams,
  KnockoutMatchWithTeams,
} from '@/lib/types'

export default async function ResultsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  // 1. Fetch tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()
  const t = tournament as Tournament

  // 2. Fetch groups with teams
  const { data: rawGroups } = await supabase
    .from('groups')
    .select('*, group_teams(*, team:teams(*))')
    .eq('tournament_id', t.id)
    .order('sort_order')

  const groups = (rawGroups ?? []) as GroupWithTeams[]
  const groupIds = groups.map((g) => g.id)

  // 3. Fetch group results
  const { data: rawResults } = groupIds.length > 0
    ? await supabase
        .from('group_results')
        .select('*')
        .in('group_id', groupIds)
    : { data: [] }

  const groupResults = (rawResults ?? []) as GroupResult[]
  const resultsByGroup = new Map<string, GroupResult[]>()
  for (const r of groupResults) {
    const existing = resultsByGroup.get(r.group_id) ?? []
    existing.push(r)
    resultsByGroup.set(r.group_id, existing)
  }

  // 4. Fetch group matches with teams
  const { data: rawMatches } = groupIds.length > 0
    ? await supabase
        .from('group_matches')
        .select('*, home_team:teams!group_matches_home_team_id_fkey(*), away_team:teams!group_matches_away_team_id_fkey(*)')
        .in('group_id', groupIds)
        .order('sort_order')
    : { data: [] }

  const groupMatches = (rawMatches ?? []) as GroupMatchWithTeams[]
  const matchesByGroup = new Map<string, GroupMatchWithTeams[]>()
  for (const m of groupMatches) {
    const existing = matchesByGroup.get(m.group_id) ?? []
    existing.push(m)
    matchesByGroup.set(m.group_id, existing)
  }

  // 5. Fetch knockout matches with teams
  const { data: rawKnockout } = await supabase
    .from('knockout_matches')
    .select('*, home_team:teams!knockout_matches_home_team_id_fkey(*), away_team:teams!knockout_matches_away_team_id_fkey(*), winner_team:teams!knockout_matches_winner_team_id_fkey(*)')
    .eq('tournament_id', t.id)
    .order('sort_order')

  const knockoutMatches = (rawKnockout ?? []) as KnockoutMatchWithTeams[]

  const hasGroupResults = groupResults.length > 0
  const hasGroupMatches = groupMatches.length > 0
  const hasKnockoutTeams = knockoutMatches.some((m) => m.home_team_id || m.away_team_id)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{t.name} — Results</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Tournament standings, fixtures, and bracket results
        </p>
      </div>

      {/* Group Standings */}
      {hasGroupResults && (
        <section>
          <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Group Standings</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <GroupResultsCard
                key={group.id}
                group={group}
                results={resultsByGroup.get(group.id) ?? []}
              />
            ))}
          </div>
        </section>
      )}

      {/* Group Fixtures */}
      {hasGroupMatches && (
        <section>
          <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Group Fixtures</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => {
              const matches = matchesByGroup.get(group.id) ?? []
              if (matches.length === 0) return null
              return (
                <GroupFixtures
                  key={group.id}
                  groupName={group.name}
                  matches={matches}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Knockout Bracket */}
      {hasKnockoutTeams && (
        <section>
          <h2 className="mb-4 font-heading text-lg font-semibold text-foreground">Knockout Bracket</h2>
          <KnockoutBracket matches={knockoutMatches} readonly />
        </section>
      )}

      {/* Empty state */}
      {!hasGroupResults && !hasGroupMatches && !hasKnockoutTeams && (
        <div className="py-12 text-center">
          <p className="text-text-muted">No results available yet. Check back once the tournament is underway.</p>
        </div>
      )}
    </div>
  )
}
