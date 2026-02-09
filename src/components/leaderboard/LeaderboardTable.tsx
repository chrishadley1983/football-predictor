'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PlayerRow } from './PlayerRow'
import type { LeaderboardEntry } from '@/lib/types'

interface LeaderboardTableProps {
  entries: LeaderboardEntry[]
  currentPlayerId?: string
}

type SortField = 'total_points' | 'group_stage_points' | 'knockout_points' | 'tiebreaker_diff'
type SortDir = 'asc' | 'desc'

export function LeaderboardTable({ entries, currentPlayerId }: LeaderboardTableProps) {
  const [sortField, setSortField] = useState<SortField>('total_points')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'tiebreaker_diff' ? 'asc' : 'desc')
    }
  }

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      let aVal: number
      let bVal: number

      if (sortField === 'tiebreaker_diff') {
        aVal = a.tiebreaker_diff ?? 9999
        bVal = b.tiebreaker_diff ?? 9999
      } else {
        aVal = a[sortField]
        bVal = b[sortField]
      }

      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    })
  }, [entries, sortField, sortDir])

  function sortIndicator(field: SortField) {
    if (sortField !== field) return null
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  function headerClass(field: SortField) {
    return cn(
      'cursor-pointer select-none whitespace-nowrap px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-text-muted',
      sortField === field && 'text-gold'
    )
  }

  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">No entries yet.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-custom">
      <table className="w-full min-w-[500px]">
        <thead className="bg-surface-light">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-text-muted">
              #
            </th>
            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted">
              Player
            </th>
            <th className="hidden whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-text-muted sm:table-cell">
              Nickname
            </th>
            <th className={headerClass('group_stage_points')} onClick={() => handleSort('group_stage_points')}>
              Group{sortIndicator('group_stage_points')}
            </th>
            <th className={headerClass('knockout_points')} onClick={() => handleSort('knockout_points')}>
              KO{sortIndicator('knockout_points')}
            </th>
            <th className={headerClass('total_points')} onClick={() => handleSort('total_points')}>
              Total{sortIndicator('total_points')}
            </th>
            <th className={headerClass('tiebreaker_diff')} onClick={() => handleSort('tiebreaker_diff')}>
              TB{sortIndicator('tiebreaker_diff')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-custom bg-surface">
          {sorted.map((entry, idx) => (
            <PlayerRow
              key={entry.entry_id}
              entry={entry}
              isCurrentUser={entry.player_id === currentPlayerId}
              rank={entry.overall_rank ?? idx + 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
