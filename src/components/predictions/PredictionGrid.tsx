'use client'

import { cn } from '@/lib/utils'
import type { PredictionSummary, GroupWithTeams, GroupResult } from '@/lib/types'

interface PredictionGridProps {
  predictions: PredictionSummary[]
  groups: GroupWithTeams[]
  results?: GroupResult[]
}

export function PredictionGrid({ predictions, groups, results = [] }: PredictionGridProps) {
  // Build result lookup: team_id -> { qualified, final_position }
  const resultMap = new Map<string, { qualified: boolean; final_position: number }>()
  for (const r of results) {
    resultMap.set(r.team_id, { qualified: r.qualified, final_position: r.final_position })
  }

  function getCellColor(teamId: string | null, predictedPosition: number): string {
    if (!teamId || resultMap.size === 0) return 'bg-gray-50 dark:bg-gray-800'
    const result = resultMap.get(teamId)
    if (!result) return 'bg-gray-50 dark:bg-gray-800'

    if (result.qualified && result.final_position === predictedPosition) {
      return 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100' // exact
    }
    if (result.qualified) {
      return 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100' // qualified, wrong pos
    }
    return 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100' // not qualified
  }

  // Find team code by id across all groups
  function getTeamCode(teamId: string | null): string {
    if (!teamId) return '-'
    for (const g of groups) {
      for (const gt of g.group_teams) {
        if (gt.team.id === teamId) return gt.team.code
      }
    }
    return '?'
  }

  if (predictions.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No predictions available yet.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 px-2 py-2 text-left font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Group
            </th>
            <th className="sticky left-[60px] z-10 bg-gray-50 px-2 py-2 text-left font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Pos
            </th>
            {predictions.map((p) => (
              <th key={p.entry_id} className="px-2 py-2 text-center font-medium text-gray-500 dark:text-gray-400">
                <div className="max-w-[60px] truncate">
                  {p.player.display_name.split(' ')[0]}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {groups.map((group) => (
            [1, 2, 3].map((pos) => (
              <tr key={`${group.id}-${pos}`}>
                {pos === 1 && (
                  <td
                    rowSpan={3}
                    className="sticky left-0 z-10 bg-white px-2 py-1 font-medium text-gray-900 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {group.name}
                  </td>
                )}
                <td className="sticky left-[60px] z-10 bg-white px-2 py-1 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                  {pos === 1 ? '1st' : pos === 2 ? '2nd' : '3rd'}
                </td>
                {predictions.map((p) => {
                  const gp = p.group_predictions.find((gp) => gp.group.id === group.id)
                  const teamId = pos === 1
                    ? gp?.predicted_1st
                    : pos === 2
                    ? gp?.predicted_2nd
                    : gp?.predicted_3rd
                  return (
                    <td
                      key={`${p.entry_id}-${group.id}-${pos}`}
                      className={cn('px-2 py-1 text-center font-mono', getCellColor(teamId ?? null, pos))}
                    >
                      {getTeamCode(teamId ?? null)}
                    </td>
                  )
                })}
              </tr>
            ))
          ))}
        </tbody>
      </table>
    </div>
  )
}
