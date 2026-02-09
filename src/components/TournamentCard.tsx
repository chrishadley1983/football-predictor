import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import { formatCurrency, formatDate, getDeadlineStatus } from '@/lib/utils'
import type { Tournament } from '@/lib/types'

interface TournamentCardProps {
  tournament: Tournament
}

export function TournamentCard({ tournament }: TournamentCardProps) {
  const groupDeadline = getDeadlineStatus(tournament.group_stage_deadline)
  const knockoutDeadline = getDeadlineStatus(tournament.knockout_stage_deadline)

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
          {tournament.prize_pool_gbp !== null && (
            <div>
              <span className="text-text-secondary">Prize Pool:</span>{' '}
              <span className="font-medium text-gold">
                {formatCurrency(tournament.prize_pool_gbp)}
              </span>
            </div>
          )}
        </div>

        {tournament.status !== 'completed' && tournament.status !== 'draft' && (
          <div className="mt-3 space-y-1 text-xs text-text-muted">
            {tournament.group_stage_deadline && (
              <p>
                Groups: {groupDeadline.passed ? 'Closed' : groupDeadline.label}
                {!groupDeadline.passed && tournament.group_stage_deadline && (
                  <span className="ml-1">({formatDate(tournament.group_stage_deadline, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })})</span>
                )}
              </p>
            )}
            {tournament.knockout_stage_deadline && (
              <p>
                Knockout: {knockoutDeadline.passed ? 'Closed' : knockoutDeadline.label}
              </p>
            )}
          </div>
        )}
      </Card>
    </Link>
  )
}
