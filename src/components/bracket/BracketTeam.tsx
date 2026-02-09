'use client'

import { cn } from '@/lib/utils'
import type { Team } from '@/lib/types'

interface BracketTeamProps {
  team: Team | null
  selected?: boolean
  correct?: boolean | null  // true=correct, false=incorrect, null=pending
  clickable?: boolean
  onClick?: () => void
}

export function BracketTeam({ team, selected, correct, clickable, onClick }: BracketTeamProps) {
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
  } else if (selected) {
    colorClass = 'border-gold bg-gold/10 ring-1 ring-gold/50'
  }

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? onClick : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded border px-2 text-xs font-medium transition-colors',
        colorClass,
        clickable && 'cursor-pointer hover:border-gold hover:bg-gold/10',
        !clickable && 'cursor-default'
      )}
    >
      {team.flag_emoji && <span className="text-sm">{team.flag_emoji}</span>}
      <span className="truncate text-foreground">{team.code}</span>
    </button>
  )
}
