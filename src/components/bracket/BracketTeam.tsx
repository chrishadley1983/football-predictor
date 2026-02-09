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
      <div className="flex h-8 items-center gap-2 rounded border border-dashed border-gray-300 bg-gray-50 px-2 text-xs text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500">
        TBD
      </div>
    )
  }

  let colorClass = 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
  if (correct === true) {
    colorClass = 'border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950'
  } else if (correct === false) {
    colorClass = 'border-red-500 bg-red-50 dark:border-red-600 dark:bg-red-950'
  } else if (selected) {
    colorClass = 'border-green-500 bg-green-50 ring-1 ring-green-400 dark:border-green-500 dark:bg-green-950'
  }

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={clickable ? onClick : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded border px-2 text-xs font-medium transition-colors',
        colorClass,
        clickable && 'cursor-pointer hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-950',
        !clickable && 'cursor-default'
      )}
    >
      {team.flag_emoji && <span className="text-sm">{team.flag_emoji}</span>}
      <span className="truncate text-gray-900 dark:text-gray-100">{team.code}</span>
    </button>
  )
}
