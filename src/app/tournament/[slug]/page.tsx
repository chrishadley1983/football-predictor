import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatDate, getDeadlineStatus } from '@/lib/utils'
import type { Tournament } from '@/lib/types'

export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
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
  const knockoutDeadline = getDeadlineStatus(t.knockout_stage_deadline)

  // Get entry count
  const { count: entryCount } = await supabase
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', t.id)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t.type === 'world_cup' ? 'World Cup' : 'Euros'} {t.year}
          </p>
        </div>
        <TournamentStatusBadge status={t.status} />
      </div>

      {/* Quick info cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Entry Fee</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(t.entry_fee_gbp)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Prize Pool</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-400">
              {t.prize_pool_gbp !== null ? formatCurrency(t.prize_pool_gbp) : 'TBD'}
            </p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Entries</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{entryCount ?? 0}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Prize Split</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t.overall_prize_pct}% overall / {t.group_stage_prize_pct}% groups
            </p>
          </div>
        </Card>
      </div>

      {/* Deadlines */}
      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Deadlines</h2>}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Group Stage Predictions</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t.group_stage_deadline
                ? `${formatDate(t.group_stage_deadline)} - ${groupDeadline.label}`
                : 'Not set'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Knockout Predictions</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {t.knockout_stage_deadline
                ? `${formatDate(t.knockout_stage_deadline)} - ${knockoutDeadline.label}`
                : 'Not set'}
            </span>
          </div>
        </div>
      </Card>

      {/* Navigation links */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(t.status === 'group_stage_open') && (
          <Link href={`/tournament/${slug}/enter`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="text-center">
                <h3 className="font-semibold text-green-700 dark:text-green-400">Enter Tournament</h3>
                <p className="mt-1 text-sm text-gray-500">Register and pay entry fee</p>
              </div>
            </Card>
          </Link>
        )}

        {['group_stage_open'].includes(t.status) && (
          <Link href={`/tournament/${slug}/predict/groups`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="text-center">
                <h3 className="font-semibold text-green-700 dark:text-green-400">Group Predictions</h3>
                <p className="mt-1 text-sm text-gray-500">Predict group stage outcomes</p>
              </div>
            </Card>
          </Link>
        )}

        {['knockout_open'].includes(t.status) && (
          <Link href={`/tournament/${slug}/predict/knockout`}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="text-center">
                <h3 className="font-semibold text-green-700 dark:text-green-400">Knockout Predictions</h3>
                <p className="mt-1 text-sm text-gray-500">Fill in your bracket</p>
              </div>
            </Card>
          </Link>
        )}

        <Link href={`/tournament/${slug}/leaderboard`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Leaderboard</h3>
              <p className="mt-1 text-sm text-gray-500">View scores and rankings</p>
            </div>
          </Card>
        </Link>

        <Link href={`/tournament/${slug}/predictions`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">All Predictions</h3>
              <p className="mt-1 text-sm text-gray-500">See what everyone predicted</p>
            </div>
          </Card>
        </Link>

        <Link href={`/tournament/${slug}/rules`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Rules</h3>
              <p className="mt-1 text-sm text-gray-500">Scoring system explained</p>
            </div>
          </Card>
        </Link>

        <Link href={`/tournament/${slug}/posts`}>
          <Card className="transition-shadow hover:shadow-md">
            <div className="text-center">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">Blog Posts</h3>
              <p className="mt-1 text-sm text-gray-500">Tournament updates and analysis</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  )
}
