'use client'

import { Fragment, useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import { BADGE_INFO } from '@/lib/badge-info'
import type {
  PredictionSummary,
  GroupWithTeams,
  GroupResult,
  Player,
  PlayerAchievement,
  KnockoutMatch,
  KnockoutRound,
} from '@/lib/types'

export interface EntryInfo {
  entry_id: string
  player_id: string
  player: Player
  group_stage_points: number
  knockout_points: number
  total_points: number
  tiebreaker_goals: number | null
  tiebreaker_diff: number | null
  overall_rank: number | null
}

interface PredictionAnalyserProps {
  predictions: PredictionSummary[]
  groups: GroupWithTeams[]
  results: GroupResult[]
  entries: EntryInfo[]
  currentPlayerId?: string | null
  thirdPlaceQualifiersCount?: number | null
  knockoutMatches?: KnockoutMatch[]
  knockoutVisible?: boolean
  achievements?: PlayerAchievement[]
}

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

export function PredictionAnalyser({
  predictions,
  groups,
  results,
  entries,
  currentPlayerId,
  thirdPlaceQualifiersCount,
  knockoutMatches = [],
  knockoutVisible = false,
  achievements = [],
}: PredictionAnalyserProps) {
  const [isOpen, setIsOpen] = useState(true)

  const currentEntry = currentPlayerId
    ? entries.find((e) => e.player_id === currentPlayerId)
    : undefined

  const [playerAId, setPlayerAId] = useState<string>(currentEntry?.entry_id ?? '')
  const [playerBId, setPlayerBId] = useState<string>('')

  const hasThirdPlaceFeature = !!thirdPlaceQualifiersCount

  // Build result lookup: group_id -> position -> { team_id, qualified }
  const actualResults = useMemo(() => {
    const map = new Map<string, Map<number, { team_id: string; qualified: boolean }>>()
    for (const r of results) {
      if (!map.has(r.group_id)) map.set(r.group_id, new Map())
      map.get(r.group_id)!.set(r.final_position, {
        team_id: r.team_id,
        qualified: r.qualified,
      })
    }
    return map
  }, [results])

  // Build result lookup by team: team_id -> { qualified, final_position }
  const resultByTeam = useMemo(() => {
    const map = new Map<string, { qualified: boolean; final_position: number }>()
    for (const r of results) {
      map.set(r.team_id, { qualified: r.qualified, final_position: r.final_position })
    }
    return map
  }, [results])

  function getTeamCode(teamId: string | null): string {
    if (!teamId) return '-'
    for (const g of groups) {
      for (const gt of g.group_teams) {
        if (gt.team.id === teamId) return gt.team.code
      }
    }
    return '?'
  }

  function getCellColor(teamId: string | null, predictedPosition: number): string {
    if (!teamId || resultByTeam.size === 0) return 'bg-surface-light'
    const result = resultByTeam.get(teamId)
    if (!result) return 'bg-surface-light'
    if (result.qualified && result.final_position === predictedPosition) {
      return 'bg-green-accent/20 text-green-accent'
    }
    if (result.qualified) {
      return 'bg-yellow-accent/20 text-yellow-accent'
    }
    return 'bg-red-accent/20 text-red-accent'
  }

  function getKnockoutCellColor(
    predictedWinnerId: string | null,
    actualWinnerId: string | null,
    impossible?: boolean
  ): string {
    if (impossible) return 'bg-gray-700/40 text-gray-500 line-through'
    if (!predictedWinnerId || !actualWinnerId) return 'bg-surface-light'
    if (predictedWinnerId === actualWinnerId)
      return 'bg-green-accent/20 text-green-accent'
    return 'bg-red-accent/20 text-red-accent'
  }

  // Build set of eliminated teams (lost in a knockout match) keyed by round index
  // A team is "impossible" for round X if they were eliminated in any round before X
  const eliminatedBeforeRound = useMemo(() => {
    const eliminated = new Map<string, number>() // team_id -> round_index they were eliminated in
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

  const playerA = playerAId
    ? predictions.find((p) => p.entry_id === playerAId)
    : undefined
  const playerB = playerBId
    ? predictions.find((p) => p.entry_id === playerBId)
    : undefined
  const entryA = playerAId
    ? entries.find((e) => e.entry_id === playerAId)
    : undefined
  const entryB = playerBId
    ? entries.find((e) => e.entry_id === playerBId)
    : undefined

  const isH2H = !!playerA && !!playerB
  const isSolo = !!playerA && !playerB
  const samePlayer = !!playerAId && !!playerBId && playerAId === playerBId
  const showComparison = (isSolo || isH2H) && !samePlayer

  // Build achievements lookup by entry_id
  const achievementsByEntry = useMemo(() => {
    const map = new Map<string, PlayerAchievement[]>()
    for (const a of achievements) {
      if (!map.has(a.entry_id)) map.set(a.entry_id, [])
      map.get(a.entry_id)!.push(a)
    }
    return map
  }, [achievements])

  function getPlayerName(entry: EntryInfo): string {
    return entry.player.nickname ?? entry.player.display_name
  }

  const groupTotalA = useMemo(() => {
    if (!playerA) return 0
    return playerA.group_predictions.reduce((sum, gp) => sum + gp.points_earned, 0)
  }, [playerA])

  const groupTotalB = useMemo(() => {
    if (!playerB) return 0
    return playerB.group_predictions.reduce((sum, gp) => sum + gp.points_earned, 0)
  }, [playerB])

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

  const colCount = isH2H ? 6 : 4

  return (
    <div className="rounded-xl border border-border-custom">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">
          Prediction Analyser
        </h2>
        <svg
          className={cn(
            'h-5 w-5 text-text-muted transition-transform',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-border-custom px-4 pb-4 pt-3 space-y-4">
          {/* Player Selectors */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-muted whitespace-nowrap">
                Player A
              </label>
              <select
                data-testid="h2h-player-a"
                value={playerAId}
                onChange={(e) => setPlayerAId(e.target.value)}
                className="rounded-lg border border-border-custom bg-surface px-3 py-1.5 text-sm text-foreground"
              >
                <option value="">Select a player...</option>
                {entries.map((e) => (
                  <option key={e.entry_id} value={e.entry_id}>
                    {getPlayerName(e)}
                  </option>
                ))}
              </select>
            </div>
            <span className="hidden text-sm text-text-muted sm:block">vs</span>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-muted whitespace-nowrap">
                Player B
              </label>
              <select
                data-testid="h2h-player-b"
                value={playerBId}
                onChange={(e) => setPlayerBId(e.target.value)}
                className="rounded-lg border border-border-custom bg-surface px-3 py-1.5 text-sm text-foreground"
              >
                <option value="">None (solo mode)</option>
                {entries.map((e) => (
                  <option key={e.entry_id} value={e.entry_id}>
                    {getPlayerName(e)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Validation Messages */}
          {!playerAId && (
            <p className="text-sm text-text-muted">
              Select a player to view their predictions.
            </p>
          )}
          {samePlayer && (
            <p className="text-sm text-yellow-accent">
              Please select two different players.
            </p>
          )}

          {/* Score Summary */}
          {showComparison && (
            <div
              data-testid="h2h-summary"
              className="flex flex-col gap-2 sm:flex-row sm:gap-4"
            >
              {entryA && (
                <div className="flex-1 rounded-lg border border-border-custom bg-surface-light p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <PlayerAvatar
                      avatarUrl={entryA.player.avatar_url}
                      displayName={entryA.player.display_name}
                      size="sm"
                    />
                    <span className="font-heading font-bold text-foreground">
                      {getPlayerName(entryA)}
                    </span>
                    {entryA.overall_rank != null && (
                      <span className="text-xs text-gold">
                        #{entryA.overall_rank}
                      </span>
                    )}
                    {(achievementsByEntry.get(entryA.entry_id) ?? []).length > 0 && (
                      <span className="flex gap-0.5" data-testid="analyser-badges-a">
                        {achievementsByEntry.get(entryA.entry_id)!.map((badge) => {
                          const info = BADGE_INFO[badge.badge_type]
                          return (
                            <span
                              key={badge.badge_type}
                              title={`${info?.name ?? badge.badge_type}: ${badge.description}`}
                              className="cursor-help text-sm"
                            >
                              {info?.emoji ?? '🏅'}
                            </span>
                          )
                        })}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-text-muted">Group</span>
                      <p className="font-mono font-bold text-foreground">
                        {entryA.group_stage_points}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted">KO</span>
                      <p className="font-mono font-bold text-foreground">
                        {entryA.knockout_points}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted">Total</span>
                      <p className="font-mono font-bold text-gold">
                        {entryA.total_points}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted">TB</span>
                      <p className="font-mono font-bold text-foreground">
                        {entryA.tiebreaker_goals ?? '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {entryB && isH2H && (
                <div className="flex-1 rounded-lg border border-border-custom bg-surface-light p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <PlayerAvatar
                      avatarUrl={entryB.player.avatar_url}
                      displayName={entryB.player.display_name}
                      size="sm"
                    />
                    <span className="font-heading font-bold text-foreground">
                      {getPlayerName(entryB)}
                    </span>
                    {entryB.overall_rank != null && (
                      <span className="text-xs text-gold">
                        #{entryB.overall_rank}
                      </span>
                    )}
                    {(achievementsByEntry.get(entryB.entry_id) ?? []).length > 0 && (
                      <span className="flex gap-0.5" data-testid="analyser-badges-b">
                        {achievementsByEntry.get(entryB.entry_id)!.map((badge) => {
                          const info = BADGE_INFO[badge.badge_type]
                          return (
                            <span
                              key={badge.badge_type}
                              title={`${info?.name ?? badge.badge_type}: ${badge.description}`}
                              className="cursor-help text-sm"
                            >
                              {info?.emoji ?? '🏅'}
                            </span>
                          )
                        })}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-text-muted">Group</span>
                      <p className="font-mono font-bold text-foreground">
                        {entryB.group_stage_points}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted">KO</span>
                      <p className="font-mono font-bold text-foreground">
                        {entryB.knockout_points}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted">Total</span>
                      <p className="font-mono font-bold text-gold">
                        {entryB.total_points}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted">TB</span>
                      <p className="font-mono font-bold text-foreground">
                        {entryB.tiebreaker_goals ?? '-'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Group Comparison Table */}
          {showComparison && (
            <div
              className="overflow-x-auto rounded-xl border border-border-custom"
              data-testid="h2h-comparison"
            >
              <table className="w-full text-xs">
                <thead className="bg-surface-light">
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface-light px-2 py-2 text-left font-medium text-text-muted">
                      Group
                    </th>
                    <th className="px-2 py-2 text-left font-medium text-text-muted">
                      Pos
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-text-muted">
                      {entryA ? getPlayerName(entryA) : 'Prediction'}
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-text-muted">
                      Actual
                    </th>
                    {isH2H && (
                      <th className="px-2 py-2 text-center font-medium text-text-muted">
                        {entryB ? getPlayerName(entryB) : 'Player B'}
                      </th>
                    )}
                    {isH2H && (
                      <th className="w-8 px-1 py-2 text-center font-medium text-text-muted" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom bg-surface">
                  {groups.map((group) => {
                    const gpA = playerA?.group_predictions.find(
                      (gp) => gp.group.id === group.id
                    )
                    const gpB = playerB?.group_predictions.find(
                      (gp) => gp.group.id === group.id
                    )
                    const groupActual = actualResults.get(group.id)

                    return (
                      <Fragment key={group.id}>
                        {[1, 2, 3].map((pos) => {
                          const teamIdA =
                            pos === 1
                              ? gpA?.predicted_1st
                              : pos === 2
                                ? gpA?.predicted_2nd
                                : gpA?.predicted_3rd
                          const teamIdB =
                            pos === 1
                              ? gpB?.predicted_1st
                              : pos === 2
                                ? gpB?.predicted_2nd
                                : gpB?.predicted_3rd
                          const actualTeam = groupActual?.get(pos)
                          const isNullThirdA =
                            pos === 3 && hasThirdPlaceFeature && !teamIdA
                          const isNullThirdB =
                            pos === 3 && hasThirdPlaceFeature && !teamIdB
                          const resultA = teamIdA
                            ? resultByTeam.get(teamIdA)
                            : undefined
                          const resultB = teamIdB
                            ? resultByTeam.get(teamIdB)
                            : undefined
                          const isNQA =
                            pos === 3 &&
                            !!teamIdA &&
                            !!resultA &&
                            resultA.final_position === 3 &&
                            !resultA.qualified
                          const isNQB =
                            pos === 3 &&
                            !!teamIdB &&
                            !!resultB &&
                            resultB.final_position === 3 &&
                            !resultB.qualified
                          const agree =
                            isH2H &&
                            !!teamIdA &&
                            !!teamIdB &&
                            teamIdA === teamIdB

                          return (
                            <tr
                              key={`${group.id}-${pos}`}
                              data-agree={agree || undefined}
                            >
                              {pos === 1 && (
                                <td
                                  rowSpan={3}
                                  className="sticky left-0 z-10 bg-surface px-2 py-1 font-medium text-foreground align-top"
                                >
                                  {group.name}
                                </td>
                              )}
                              <td className="px-2 py-1 text-text-muted">
                                {pos === 1
                                  ? '1st'
                                  : pos === 2
                                    ? '2nd'
                                    : '3rd'}
                              </td>
                              {/* Player A Prediction */}
                              <td
                                className={cn(
                                  'px-2 py-1 text-center font-mono',
                                  isNullThirdA
                                    ? 'bg-surface-light/50 text-text-muted'
                                    : getCellColor(teamIdA ?? null, pos)
                                )}
                              >
                                {isNullThirdA ? (
                                  '-'
                                ) : (
                                  <>
                                    {getTeamCode(teamIdA ?? null)}
                                    {isNQA && (
                                      <span className="ml-0.5 text-[9px] opacity-70">
                                        NQ
                                      </span>
                                    )}
                                  </>
                                )}
                              </td>
                              {/* Actual Result */}
                              <td className="px-2 py-1 text-center font-mono text-foreground bg-surface-light/30">
                                {actualTeam
                                  ? getTeamCode(actualTeam.team_id)
                                  : '-'}
                              </td>
                              {/* Player B Prediction */}
                              {isH2H && (
                                <td
                                  className={cn(
                                    'px-2 py-1 text-center font-mono',
                                    isNullThirdB
                                      ? 'bg-surface-light/50 text-text-muted'
                                      : getCellColor(teamIdB ?? null, pos)
                                  )}
                                >
                                  {isNullThirdB ? (
                                    '-'
                                  ) : (
                                    <>
                                      {getTeamCode(teamIdB ?? null)}
                                      {isNQB && (
                                        <span className="ml-0.5 text-[9px] opacity-70">
                                          NQ
                                        </span>
                                      )}
                                    </>
                                  )}
                                </td>
                              )}
                              {/* Agree indicator */}
                              {isH2H && (
                                <td className="px-1 py-1 text-center">
                                  {agree && (
                                    <span className="text-[10px] text-green-accent">
                                      =
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        {/* Per-group points row */}
                        <tr className="border-t-2 border-gold/30 bg-gold/5">
                          <td className="sticky left-0 z-10 bg-gold/5" />
                          <td className="px-2 py-1.5 text-gold text-[10px] font-bold uppercase tracking-wider">
                            Pts
                          </td>
                          <td
                            className="px-2 py-1.5 text-center font-mono text-xs font-bold text-gold"
                            data-testid="h2h-group-points"
                          >
                            {gpA?.points_earned ?? 0}
                          </td>
                          <td className="px-2 py-1.5 bg-gold/5" />
                          {isH2H && (
                            <td
                              className="px-2 py-1.5 text-center font-mono text-xs font-bold text-gold"
                              data-testid="h2h-group-points"
                            >
                              {gpB?.points_earned ?? 0}
                            </td>
                          )}
                          {isH2H && <td />}
                        </tr>
                      </Fragment>
                    )
                  })}
                  {/* Total row */}
                  <tr
                    className="bg-surface-light font-bold"
                    data-testid="h2h-group-total"
                  >
                    <td className="sticky left-0 z-10 bg-surface-light px-2 py-2 text-foreground">
                      Total
                    </td>
                    <td />
                    <td className="px-2 py-2 text-center font-mono text-gold">
                      {groupTotalA}
                    </td>
                    <td className="px-2 py-2 bg-surface-light" />
                    {isH2H && (
                      <td className="px-2 py-2 text-center font-mono text-gold">
                        {groupTotalB}
                      </td>
                    )}
                    {isH2H && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Knockout Section */}
          {showComparison && knockoutVisible && knockoutByRound.size > 0 && (
            <div
              data-testid="h2h-knockout"
              className="overflow-x-auto rounded-xl border border-border-custom"
            >
              <table className="w-full text-xs">
                <thead className="bg-surface-light">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-text-muted">
                      Match
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-text-muted">
                      {entryA ? getPlayerName(entryA) : 'Prediction'}
                    </th>
                    <th className="px-2 py-2 text-center font-medium text-text-muted">
                      Actual
                    </th>
                    {isH2H && (
                      <th className="px-2 py-2 text-center font-medium text-text-muted">
                        {entryB ? getPlayerName(entryB) : 'Player B'}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-custom bg-surface">
                  {ROUND_ORDER.filter((r) => knockoutByRound.has(r)).map(
                    (round) => {
                      const matches = knockoutByRound.get(round)!
                      // Calculate round points for each player
                      const roundPtsA = matches.reduce((sum, m) => {
                        const pred = playerA?.knockout_predictions.find(
                          (kp) => kp.match_id === m.id
                        )
                        return sum + (pred?.points_earned ?? 0)
                      }, 0)
                      const roundPtsB = matches.reduce((sum, m) => {
                        const pred = playerB?.knockout_predictions.find(
                          (kp) => kp.match_id === m.id
                        )
                        return sum + (pred?.points_earned ?? 0)
                      }, 0)

                      return (
                        <Fragment key={round}>
                          <tr>
                            <td
                              colSpan={colCount}
                              className="px-2 py-1.5 text-xs font-heading font-bold text-gold bg-surface-light/50"
                            >
                              {ROUND_NAMES[round]}
                            </td>
                          </tr>
                          {matches.map((match) => {
                            const predA =
                              playerA?.knockout_predictions.find(
                                (kp) => kp.match_id === match.id
                              )
                            const predB =
                              playerB?.knockout_predictions.find(
                                (kp) => kp.match_id === match.id
                              )
                            const impossibleA = isImpossiblePick(
                              predA?.predicted_winner_id ?? null,
                              match.round
                            )
                            const impossibleB = isImpossiblePick(
                              predB?.predicted_winner_id ?? null,
                              match.round
                            )
                            return (
                              <tr key={match.id}>
                                <td className="px-2 py-1 font-mono text-foreground whitespace-nowrap">
                                  {getTeamCode(match.home_team_id)} v{' '}
                                  {getTeamCode(match.away_team_id)}
                                </td>
                                <td
                                  className={cn(
                                    'px-2 py-1 text-center font-mono',
                                    getKnockoutCellColor(
                                      predA?.predicted_winner_id ?? null,
                                      match.winner_team_id,
                                      impossibleA
                                    )
                                  )}
                                >
                                  {predA
                                    ? getTeamCode(predA.predicted_winner_id)
                                    : '-'}
                                </td>
                                <td className="px-2 py-1 text-center font-mono text-foreground bg-surface-light/30">
                                  {match.winner_team_id
                                    ? getTeamCode(match.winner_team_id)
                                    : '-'}
                                </td>
                                {isH2H && (
                                  <td
                                    className={cn(
                                      'px-2 py-1 text-center font-mono',
                                      getKnockoutCellColor(
                                        predB?.predicted_winner_id ?? null,
                                        match.winner_team_id,
                                        impossibleB
                                      )
                                    )}
                                  >
                                    {predB
                                      ? getTeamCode(predB.predicted_winner_id)
                                      : '-'}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                          {/* Per-round points row */}
                          <tr className="border-t-2 border-gold/30 bg-gold/5">
                            <td className="px-2 py-1.5 text-gold text-[10px] font-bold uppercase tracking-wider">
                              Pts
                            </td>
                            <td className="px-2 py-1.5 text-center font-mono text-xs font-bold text-gold">
                              {roundPtsA}
                            </td>
                            <td className="px-2 py-1.5 bg-gold/5" />
                            {isH2H && (
                              <td className="px-2 py-1.5 text-center font-mono text-xs font-bold text-gold">
                                {roundPtsB}
                              </td>
                            )}
                          </tr>
                        </Fragment>
                      )
                    }
                  )}
                  {/* Knockout Total row */}
                  <tr
                    className="bg-surface-light font-bold"
                    data-testid="h2h-knockout-total"
                  >
                    <td className="px-2 py-2 text-foreground">
                      Total
                    </td>
                    <td className="px-2 py-2 text-center font-mono text-gold">
                      {playerA?.knockout_predictions.reduce(
                        (sum, kp) => sum + kp.points_earned,
                        0
                      ) ?? 0}
                    </td>
                    <td className="px-2 py-2 bg-surface-light" />
                    {isH2H && (
                      <td className="px-2 py-2 text-center font-mono text-gold">
                        {playerB?.knockout_predictions.reduce(
                          (sum, kp) => sum + kp.points_earned,
                          0
                        ) ?? 0}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
