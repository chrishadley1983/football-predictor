import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/utils'
import type { GroupMatchWithTeams } from '@/lib/types'

interface GroupFixturesProps {
  groupName: string
  matches: GroupMatchWithTeams[]
}

export function GroupFixtures({ groupName, matches }: GroupFixturesProps) {
  return (
    <Card header={<h3 className="text-base font-semibold text-foreground">{groupName}</h3>}>
      <div className="space-y-2">
        {matches.map((match) => (
          <div
            key={match.id}
            className="flex items-center gap-3 rounded bg-surface-light px-3 py-2 text-sm"
          >
            {/* Date & Venue — only shown when data exists */}
            {(match.scheduled_at || match.venue) && (
              <div className="hidden w-28 shrink-0 text-xs text-text-muted sm:block">
                {match.scheduled_at && <div>{formatDate(match.scheduled_at, { day: 'numeric', month: 'short', year: undefined })}</div>}
                {match.venue && <div className="truncate">{match.venue}</div>}
              </div>
            )}

            {/* Home team */}
            <div className="flex flex-1 items-center justify-end gap-1.5">
              <span className="truncate text-right font-medium text-foreground">
                {match.home_team?.name ?? 'TBC'}
              </span>
              {match.home_team?.flag_emoji && (
                <span className="text-sm">{match.home_team.flag_emoji}</span>
              )}
            </div>

            {/* Score */}
            <div className="w-14 shrink-0 text-center font-mono font-bold text-foreground">
              {match.home_score !== null && match.away_score !== null
                ? `${match.home_score} - ${match.away_score}`
                : 'vs'}
            </div>

            {/* Away team */}
            <div className="flex flex-1 items-center gap-1.5">
              {match.away_team?.flag_emoji && (
                <span className="text-sm">{match.away_team.flag_emoji}</span>
              )}
              <span className="truncate font-medium text-foreground">
                {match.away_team?.name ?? 'TBC'}
              </span>
            </div>
          </div>
        ))}

        {matches.length === 0 && (
          <p className="py-2 text-center text-sm text-text-muted">No fixtures scheduled</p>
        )}
      </div>
    </Card>
  )
}
