'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
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
          'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800',
          isCurrentUser && 'bg-green-50 font-medium dark:bg-green-950'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm font-bold text-gray-900 dark:text-gray-100">
          {rank}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
          {entry.display_name}
        </td>
        <td className="hidden whitespace-nowrap px-3 py-2 text-sm text-gray-500 sm:table-cell dark:text-gray-400">
          {entry.nickname ?? '-'}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-700 dark:text-gray-300">
          {entry.group_stage_points}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-700 dark:text-gray-300">
          {entry.knockout_points}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm font-bold text-gray-900 dark:text-gray-100">
          {entry.total_points}
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
          {entry.tiebreaker_goals ?? '-'}
          {entry.tiebreaker_diff !== null && (
            <span className="ml-1 text-xs text-gray-400">({entry.tiebreaker_diff})</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className={cn(isCurrentUser && 'bg-green-50/50 dark:bg-green-950/50')}>
          <td colSpan={7} className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400">
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
