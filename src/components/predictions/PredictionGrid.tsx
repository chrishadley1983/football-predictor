'use client'

import { Fragment, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import type {
  PredictionSummary,
  GroupWithTeams,
  GroupResult,
  KnockoutMatch,
  KnockoutRound,
} from '@/lib/types'

const ROUND_ORDER: KnockoutRound[] = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'final',
]

const ROUND_NAMES: Record<string, string> = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  final: 'Final',
}

interface PredictionGridProps {
  predictions: PredictionSummary[]
  groups: GroupWithTeams[]
  results?: GroupResult[]
  thirdPlaceQualifiersCount?: number | null
  knockoutMatches?: KnockoutMatch[]
  knockoutVisible?: boolean
}

export function PredictionGrid({
  predictions,
  groups,
  results = [],
  thirdPlaceQualifiersCount,
  knockoutMatches = [],
  knockoutVisible = false,
}: PredictionGridProps) {
  const hasThirdPlaceFeature = !!thirdPlaceQualifiersCount
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

  function getKnockoutCellColor(
    predictedWinnerId: string | null,
    actualWinnerId: string | null,
    impossible?: boolean
  ): string {
    if (impossible) return 'bg-surface-light/50 text-text-muted line-through'
    if (!predictedWinnerId || !actualWinnerId) return 'bg-surface-light'
    if (predictedWinnerId === actualWinnerId)
      return 'bg-green-accent/20 text-green-accent'
    return 'bg-red-accent/20 text-red-accent'
  }

  // Find team code by id across all groups, also check knockout match teams
  function getTeamCode(teamId: string | null): string {
    if (!teamId) return '-'
    for (const g of groups) {
      for (const gt of g.group_teams) {
        if (gt.team.id === teamId) return gt.team.code
      }
    }
    return '?'
  }

  // Group knockout matches by round
  const knockoutByRound = useMemo(() => {
    const map = new Map<string, KnockoutMatch[]>()
    for (const match of knockoutMatches) {
      if (!match.home_team_id || !match.away_team_id) continue
      const existing = map.get(match.round) ?? []
      existing.push(match)
      map.set(match.round, existing)
    }
    for (const [, matches] of map) {
      matches.sort((a, b) => a.sort_order - b.sort_order)
    }
    return map
  }, [knockoutMatches])

  // Build eliminated teams lookup for impossible pick detection
  const eliminatedBeforeRound = useMemo(() => {
    const eliminated = new Map<string, number>()
    for (const match of knockoutMatches) {
      if (!match.winner_team_id) continue
      const loserId =
        match.home_team_id === match.winner_team_id
          ? match.away_team_id
          : match.home_team_id
      if (loserId) {
        const roundIdx = ROUND_ORDER.indexOf(match.round)
        if (roundIdx >= 0) {
          const existing = eliminated.get(loserId)
          if (existing === undefined || roundIdx < existing) {
            eliminated.set(loserId, roundIdx)
          }
        }
      }
    }
    return eliminated
  }, [knockoutMatches])

  function isImpossiblePick(
    predictedWinnerId: string | null,
    matchRound: KnockoutRound
  ): boolean {
    if (!predictedWinnerId) return false
    const eliminatedAt = eliminatedBeforeRound.get(predictedWinnerId)
    if (eliminatedAt === undefined) return false
    const currentRoundIdx = ROUND_ORDER.indexOf(matchRound)
    return eliminatedAt < currentRoundIdx
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
                <div className="flex flex-col items-center gap-1">
                  <PlayerAvatar avatarUrl={p.player.avatar_url} displayName={p.player.display_name} size="sm" />
                  <div className="max-w-[60px] truncate">
                    {p.player.display_name.split(' ')[0]}
                  </div>
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
                  const isNullThird = pos === 3 && hasThirdPlaceFeature && !teamId
                  const result = teamId ? resultMap.get(teamId) : undefined
                  const isCorrectPosButNQ = pos === 3 && !!teamId && !!result
                    && result.final_position === 3 && !result.qualified
                  return (
                    <td
                      key={`${p.entry_id}-${group.id}-${pos}`}
                      className={cn(
                        'px-2 py-1 text-center font-mono',
                        isNullThird ? 'bg-surface-light/50 text-text-muted' : getCellColor(teamId ?? null, pos)
                      )}
                    >
                      {isNullThird ? '-' : (
                        <>
                          {getTeamCode(teamId ?? null)}
                          {isCorrectPosButNQ && <span className="ml-0.5 text-[9px] opacity-70">NQ</span>}
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))
          ))}
          {/* Knockout predictions grid */}
          {knockoutVisible && knockoutByRound.size > 0 &&
            ROUND_ORDER.filter((r) => knockoutByRound.has(r)).map((round) => (
              <Fragment key={round}>
                {/* Round header */}
                <tr>
                  <td
                    colSpan={2 + predictions.length}
                    className="sticky left-0 z-10 px-2 py-1.5 text-xs font-heading font-bold text-gold bg-surface-light/50"
                  >
                    {ROUND_NAMES[round]}
                  </td>
                </tr>
                {knockoutByRound.get(round)!.map((match) => (
                  <tr key={match.id}>
                    <td className="sticky left-0 z-10 bg-surface px-2 py-1 font-mono text-foreground whitespace-nowrap text-[10px]">
                      {getTeamCode(match.home_team_id)}
                    </td>
                    <td className="sticky left-[60px] z-10 bg-surface px-2 py-1 font-mono text-foreground whitespace-nowrap text-[10px]">
                      v {getTeamCode(match.away_team_id)}
                    </td>
                    {predictions.map((p) => {
                      const pred = p.knockout_predictions.find(
                        (kp) => kp.match_id === match.id
                      )
                      const impossible = isImpossiblePick(
                        pred?.predicted_winner_id ?? null,
                        match.round
                      )
                      return (
                        <td
                          key={`${p.entry_id}-${match.id}`}
                          className={cn(
                            'px-2 py-1 text-center font-mono',
                            getKnockoutCellColor(
                              pred?.predicted_winner_id ?? null,
                              match.winner_team_id,
                              impossible
                            )
                          )}
                        >
                          {pred
                            ? getTeamCode(pred.predicted_winner_id)
                            : '-'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            ))
          }
        </tbody>
      </table>
    </div>
  )
}
