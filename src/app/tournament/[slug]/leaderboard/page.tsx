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

  // Fetch leaderboard data directly instead of self-fetching the API
  const { data: rawEntries, error: entriesErr } = await supabase
    .from('tournament_entries')
    .select(`
      id,
      player_id,
      tiebreaker_goals,
      group_stage_points,
      knockout_points,
      total_points,
      tiebreaker_diff,
      group_stage_rank,
      overall_rank,
      player:players (
        id,
        display_name,
        nickname,
        avatar_url
      )
    `)
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

  const entries: LeaderboardEntry[] = (rawEntries ?? []).map((e) => {
    const player = e.player as unknown as { id: string; display_name: string; nickname: string | null; avatar_url: string | null }
    return {
      entry_id: e.id,
      player_id: e.player_id,
      display_name: player?.display_name ?? 'Unknown',
      nickname: player?.nickname ?? null,
      avatar_url: player?.avatar_url ?? null,
      group_stage_points: e.group_stage_points,
      knockout_points: e.knockout_points,
      total_points: e.total_points,
      tiebreaker_goals: e.tiebreaker_goals,
      tiebreaker_diff: e.tiebreaker_diff,
      group_stage_rank: e.group_stage_rank,
      overall_rank: e.overall_rank,
      badges: achievementsByEntry.get(e.id) ?? [],
    }
  })

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
      />

      {earnedBadgeTypes.length > 0 && (
        <BadgeLegend earnedBadgeTypes={earnedBadgeTypes} />
      )}
    </div>
  )
}
