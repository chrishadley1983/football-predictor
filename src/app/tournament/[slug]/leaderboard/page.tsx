import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlayer } from '@/lib/auth'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import { BadgeLegend } from '@/components/leaderboard/BadgeLegend'
import type { Tournament, LeaderboardEntry, PlayerAchievement } from '@/lib/types'

export default async function LeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament, error: tournamentErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (tournamentErr) console.error('Failed to fetch tournament:', tournamentErr.message)
  if (!tournament) notFound()

  const t = tournament as Tournament

  // Fetch leaderboard via the public view. The view bypasses RLS and masks
  // tiebreaker/points/ranks while status is 'draft' or 'group_stage_open',
  // so all registered players are visible without leaking predictions.
  const { data: rawEntries, error: entriesErr } = await supabase
    .from('tournament_leaderboard')
    .select('*')
    .eq('tournament_id', t.id)
    .order('overall_rank', { ascending: true, nullsFirst: false })

  if (entriesErr) console.error('Failed to fetch leaderboard:', entriesErr.message)

  // Fetch achievements for this tournament
  const { data: achievements } = await supabase
    .from('player_achievements')
    .select('*')
    .eq('tournament_id', t.id)

  const achievementsByEntry = new Map<string, PlayerAchievement[]>()
  for (const a of (achievements ?? []) as PlayerAchievement[]) {
    if (!achievementsByEntry.has(a.entry_id)) achievementsByEntry.set(a.entry_id, [])
    achievementsByEntry.get(a.entry_id)!.push(a)
  }

  const entries: LeaderboardEntry[] = (rawEntries ?? []).map((e) => ({
    entry_id: e.entry_id,
    player_id: e.player_id,
    display_name: e.display_name ?? 'Unknown',
    nickname: e.nickname ?? null,
    avatar_url: e.avatar_url ?? null,
    group_stage_points: e.group_stage_points,
    knockout_points: e.knockout_points,
    total_points: e.total_points,
    tiebreaker_goals: e.tiebreaker_goals,
    tiebreaker_diff: e.tiebreaker_diff,
    knockout_tiebreaker_goals: e.knockout_tiebreaker_goals,
    knockout_tiebreaker_diff: e.knockout_tiebreaker_diff,
    group_stage_rank: e.group_stage_rank,
    overall_rank: e.overall_rank,
    badges: achievementsByEntry.get(e.entry_id) ?? [],
  }))

  const currentPlayer = await getCurrentPlayer()

  // Collect earned badge types for the legend
  const earnedBadgeTypes = [...new Set(
    (achievements ?? []).map((a: PlayerAchievement) => a.badge_type)
  )]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">{t.name} - Leaderboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Click on column headers to sort. Click a row to expand details.
        </p>
      </div>

      <LeaderboardTable
        entries={entries}
        currentPlayerId={currentPlayer?.id}
        tournamentStatus={t.status}
      />

      {earnedBadgeTypes.length > 0 && (
        <BadgeLegend earnedBadgeTypes={earnedBadgeTypes} />
      )}
    </div>
  )
}
