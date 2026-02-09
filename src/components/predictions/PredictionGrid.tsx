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
    if (!teamId || resultMap.size === 0) return 'bg-surface-light'
    const result = resultMap.get(teamId)
    if (!result) return 'bg-surface-light'

    if (result.qualified && result.final_position === predictedPosition) {
      return 'bg-green-accent/20 text-green-accent' // exact
    }
    if (result.qualified) {
      return 'bg-yellow-accent/20 text-yellow-accent' // qualified, wrong pos
    }
    return 'bg-red-accent/20 text-red-accent' // not qualified
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
    return <p className="py-8 text-center text-sm text-text-muted">No predictions available yet.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border-custom">
      <table className="w-full text-xs">
        <thead className="bg-surface-light">
          <tr>
            <th className="sticky left-0 z-10 bg-surface-light px-2 py-2 text-left font-medium text-text-muted">
              Group
            </th>
            <th className="sticky left-[60px] z-10 bg-surface-light px-2 py-2 text-left font-medium text-text-muted">
              Pos
            </th>
            {predictions.map((p) => (
              <th key={p.entry_id} className="px-2 py-2 text-center font-medium text-text-muted">
                <div className="max-w-[60px] truncate">
                  {p.player.display_name.split(' ')[0]}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-custom bg-surface">
          {groups.map((group) => (
            [1, 2, 3].map((pos) => (
              <tr key={`${group.id}-${pos}`}>
                {pos === 1 && (
                  <td
                    rowSpan={3}
                    className="sticky left-0 z-10 bg-surface px-2 py-1 font-medium text-foreground"
                  >
                    {group.name}
                  </td>
                )}
                <td className="sticky left-[60px] z-10 bg-surface px-2 py-1 text-text-muted">
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
