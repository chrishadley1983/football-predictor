import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { formatCurrency, formatDate, getDeadlineStatus } from '@/lib/utils'
import type { Tournament } from '@/lib/types'

export default async function TournamentPage({ params }: { params: Promise<{ slug: string }> }) {
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
          <h1 className="font-heading text-3xl font-bold text-foreground">{t.name}</h1>
          <p className="text-sm text-text-secondary">
            {t.type === 'world_cup' ? 'World Cup' : 'Euros'} {t.year}
          </p>
        </div>
        <TournamentStatusBadge status={t.status} />
      </div>

      {/* Quick info cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Entry Fee</p>
            <p className="font-heading text-2xl font-bold text-foreground">{formatCurrency(t.entry_fee_gbp)}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Prize Pool</p>
            <p className="font-heading text-2xl font-bold text-gold">
              {t.prize_pool_gbp !== null ? formatCurrency(t.prize_pool_gbp) : 'TBD'}
            </p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Entries</p>
            <p className="font-heading text-2xl font-bold text-foreground">{entryCount ?? 0}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Prize Split</p>
            <p className="text-sm font-medium text-text-secondary">
              {t.overall_prize_pct}% overall / {t.group_stage_prize_pct}% groups
            </p>
          </div>
        </Card>
      </div>

      {/* Deadlines */}
      <Card header={<h2 className="font-heading font-semibold text-foreground">Deadlines</h2>}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Group Stage Predictions</span>
            <span className="text-sm font-medium text-foreground">
              {t.group_stage_deadline
                ? `${formatDate(t.group_stage_deadline)} - ${groupDeadline.label}`
                : 'Not set'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Knockout Predictions</span>
            <span className="text-sm font-medium text-foreground">
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
            <Card className="border-gold/25 bg-gold/5 transition-all hover:border-gold/40 hover:bg-gold/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gold-light">Enter Tournament</h3>
                  <p className="mt-1 text-sm text-text-secondary">Register and pay entry fee</p>
                </div>
                <span className="text-text-muted opacity-0 transition-opacity group-hover:opacity-70">&rarr;</span>
              </div>
            </Card>
          </Link>
        )}

        {['group_stage_open'].includes(t.status) && (
          <Link href={`/tournament/${slug}/predict/groups`}>
            <Card className="border-gold/25 bg-gold/5 transition-all hover:border-gold/40 hover:bg-gold/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gold-light">Group Predictions</h3>
                  <p className="mt-1 text-sm text-text-secondary">Predict group stage outcomes</p>
                </div>
                <span className="text-text-muted opacity-0 transition-opacity group-hover:opacity-70">&rarr;</span>
              </div>
            </Card>
          </Link>
        )}

        {['knockout_open'].includes(t.status) && (
          <Link href={`/tournament/${slug}/predict/knockout`}>
            <Card className="border-gold/25 bg-gold/5 transition-all hover:border-gold/40 hover:bg-gold/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gold-light">Knockout Predictions</h3>
                  <p className="mt-1 text-sm text-text-secondary">Fill in your bracket</p>
                </div>
                <span className="text-text-muted opacity-0 transition-opacity group-hover:opacity-70">&rarr;</span>
              </div>
            </Card>
          </Link>
        )}

        <Link href={`/tournament/${slug}/leaderboard`}>
          <Card className="transition-all hover:border-gold/30">
            <div className="text-center">
              <h3 className="font-semibold text-foreground">Leaderboard</h3>
              <p className="mt-1 text-sm text-text-secondary">View scores and rankings</p>
            </div>
          </Card>
        </Link>

        <Link href={`/tournament/${slug}/predictions`}>
          <Card className="transition-all hover:border-gold/30">
            <div className="text-center">
              <h3 className="font-semibold text-foreground">All Predictions</h3>
              <p className="mt-1 text-sm text-text-secondary">See what everyone predicted</p>
            </div>
          </Card>
        </Link>

        <Link href={`/tournament/${slug}/rules`}>
          <Card className="transition-all hover:border-gold/30">
            <div className="text-center">
              <h3 className="font-semibold text-foreground">Rules</h3>
              <p className="mt-1 text-sm text-text-secondary">Scoring system explained</p>
            </div>
          </Card>
        </Link>

        <Link href={`/tournament/${slug}/posts`}>
          <Card className="transition-all hover:border-gold/30">
            <div className="text-center">
              <h3 className="font-semibold text-foreground">Blog Posts</h3>
              <p className="mt-1 text-sm text-text-secondary">Tournament updates and analysis</p>
            </div>
          </Card>
        </Link>

        <Link href={`/tournament/${slug}/chat`}>
          <Card className="transition-all hover:border-gold/30">
            <div className="text-center">
              <h3 className="font-semibold text-foreground">Chat</h3>
              <p className="mt-1 text-sm text-text-secondary">Live tournament discussion</p>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  )
}
