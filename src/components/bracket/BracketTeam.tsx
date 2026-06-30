'use client'

import { cn } from '@/lib/utils'
import { Flag } from '@/components/ui/Flag'
import type { Team } from '@/lib/types'

interface BracketTeamProps {
  team: Team | null
  score?: number | null
  selected?: boolean
  correct?: boolean | null  // true=correct, false=incorrect, null=pending
  isWinner?: boolean
  isLoser?: boolean
  /** Team is really out but still shows in a later round of the player's bracket. */
  isEliminated?: boolean
  clickable?: boolean
  fullName?: boolean
  onClick?: () => void
}

export function BracketTeam({ team, score, selected, correct, isWinner, isLoser, isEliminated, clickable, fullName, onClick }: BracketTeamProps) {
  if (!team) {
    return (
      <div className="flex h-8 items-center gap-2 rounded border border-dashed border-border-custom bg-surface-light px-2 text-xs text-text-muted">
        TBD
      </div>
    )
  }

  let colorClass = 'border-border-custom bg-surface-light'
  if (correct === true) {
    colorClass = 'border-green-accent bg-green-accent/10'
  } else if (correct === false) {
    colorClass = 'border-red-accent bg-red-accent/10'
  } else if (isEliminated) {
    // Predicted team that's actually out — neutralise the gold "selected" look.
    colorClass = 'border-border-custom bg-surface-light'
  } else if (selected) {
    colorClass = 'border-gold bg-gold/10 ring-1 ring-gold/50'
  }

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? onClick : undefined}
      title={isEliminated ? `${team.name} is already out` : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded border px-2 text-xs font-medium transition-colors',
        colorClass,
        isLoser && 'opacity-40',
        isEliminated && 'opacity-50',
        isWinner && 'font-bold',
        clickable && 'cursor-pointer hover:border-gold hover:bg-gold/10',
        !clickable && 'cursor-default'
      )}
    >
      <Flag emoji={team.flag_emoji} name={team.name} />
      <span className={cn('truncate', isLoser || isEliminated ? 'text-text-muted' : 'text-foreground', isEliminated && 'line-through')}>
        {fullName ? team.name : team.code}
      </span>
      {score !== null && score !== undefined && (
        <span className={cn(
          'ml-auto tabular-nums',
          isWinner ? 'text-foreground font-bold' : 'text-text-muted'
        )}>
          {score}
        </span>
      )}
    </button>
  )
}
