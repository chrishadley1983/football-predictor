import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatCurrency } from '@/lib/utils'
import { DeadlineCountdown } from '@/components/ui/Deadline'
import type { Tournament } from '@/lib/types'

interface TournamentCardProps {
  tournament: Tournament
}

export async function TournamentCard({ tournament }: TournamentCardProps) {
  // Live prize pool = entry fee × number of entries (matches the overview page).
  // Service-role count because tournament_entries RLS hides other players' rows
  // during the group stage.
  const { count } = await createAdminClient()
    .from('tournament_entries')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)
  const prizePool = (count ?? 0) * Number(tournament.entry_fee_gbp)

  return (
    <Link href={`/tournament/${tournament.slug}`} className="block transition-all hover:shadow-lg hover:shadow-black/30">
      <Card className="transition-colors hover:border-gold/30">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{tournament.name}</h3>
            <p className="text-sm text-text-secondary">
              {tournament.type === 'world_cup' ? 'World Cup' : 'Euros'} {tournament.year}
            </p>
          </div>
          <TournamentStatusBadge status={tournament.status} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-text-secondary">Entry Fee:</span>{' '}
            <span className="font-medium text-foreground">
              {formatCurrency(tournament.entry_fee_gbp)}
            </span>
          </div>
          <div>
            <span className="text-text-secondary">Prize Pool:</span>{' '}
            <span className="font-medium text-gold">
              {formatCurrency(prizePool)}
            </span>
          </div>
        </div>

        {tournament.status !== 'completed' && tournament.status !== 'draft' && (
          <div className="mt-3 space-y-1 text-xs text-text-muted">
            {tournament.group_stage_deadline && (
              <p>
                Groups: <DeadlineCountdown deadline={tournament.group_stage_deadline} closedLabel="Closed" showTime />
              </p>
            )}
            {tournament.knockout_stage_deadline && (
              <p>
                Knockout: <DeadlineCountdown deadline={tournament.knockout_stage_deadline} closedLabel="Closed" showTime />
              </p>
            )}
          </div>
        )}
      </Card>
    </Link>
  )
}
