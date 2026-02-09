'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import type { LeaderboardEntry } from '@/lib/types'

interface PlayerRowProps {
  entry: LeaderboardEntry
  isCurrentUser: boolean
  rank: number
}

export function PlayerRow({ entry, isCurrentUser, rank }: PlayerRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer transition-colors hover:bg-surface-light',
          isCurrentUser && 'bg-gold/10 font-medium'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm font-bold text-foreground">
          {rank}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <PlayerAvatar avatarUrl={entry.avatar_url} displayName={entry.display_name} size="sm" />
            {entry.display_name}
          </div>
        </td>
        <td className="hidden whitespace-nowrap px-3 py-2 text-sm text-text-secondary sm:table-cell">
          {entry.nickname ?? '-'}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-text-secondary">
          {entry.group_stage_points}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-text-secondary">
          {entry.knockout_points}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm font-bold text-foreground">
          {entry.total_points}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-text-muted">
          {entry.tiebreaker_goals ?? '-'}
          {entry.tiebreaker_diff !== null && (
            <span className="ml-1 text-xs text-text-faint">({entry.tiebreaker_diff})</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className={cn(isCurrentUser && 'bg-gold/5')}>
          <td colSpan={7} className="px-3 py-3 text-xs text-text-secondary">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <span className="font-medium">Group Pts:</span> {entry.group_stage_points}
              </div>
              <div>
                <span className="font-medium">Knockout Pts:</span> {entry.knockout_points}
              </div>
              <div>
                <span className="font-medium">Tiebreaker:</span> {entry.tiebreaker_goals ?? 'N/A'}
              </div>
              <div>
                <span className="font-medium">Tiebreaker Diff:</span> {entry.tiebreaker_diff ?? 'N/A'}
              </div>
              <div>
                <span className="font-medium">Group Rank:</span> {entry.group_stage_rank ?? '-'}
              </div>
              <div>
                <span className="font-medium">Overall Rank:</span> {entry.overall_rank ?? '-'}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
