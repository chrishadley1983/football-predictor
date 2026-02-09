import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentPlayer } from '@/lib/auth'
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable'
import type { Tournament, LeaderboardEntry } from '@/lib/types'

export default async function LeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()

  const t = tournament as Tournament

  // Fetch leaderboard data
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/api/tournaments/${slug}/leaderboard`,
    { cache: 'no-store' }
  )

  let entries: LeaderboardEntry[] = []
  if (res.ok) {
    entries = await res.json()
  }

  const currentPlayer = await getCurrentPlayer()

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
    </div>
  )
}
