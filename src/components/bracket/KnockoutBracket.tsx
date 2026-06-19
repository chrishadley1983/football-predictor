'use client'

import { useMemo } from 'react'
import type { KnockoutMatchWithTeams, KnockoutPrediction } from '@/lib/types'
import { resolveBracket, predictionsToRecord } from '@/lib/bracket'
import { BracketMatch } from './BracketMatch'

const ROUND_LABELS: Record<string, string> = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter-finals',
  semi_final: 'Semi-finals',
  final: 'Final',
}

interface KnockoutBracketProps {
  matches: KnockoutMatchWithTeams[]
  predictions?: KnockoutPrediction[]
  onPrediction?: (matchId: string, teamId: string) => void
  readonly?: boolean
  goldenTicketMatchId?: string | null
  /**
   * 'mirrored' = the classic left → Final ← right bracket (nice for display).
   * 'columns'  = every round in its own left-to-right column (clearer for entry).
   */
  layout?: 'mirrored' | 'columns'
  /** Show full country names instead of 3-letter codes (wider cards). */
  fullNames?: boolean
}

export function KnockoutBracket({ matches, predictions = [], onPrediction, readonly = false, goldenTicketMatchId, layout = 'mirrored', fullNames = false }: KnockoutBracketProps) {
  const predictionMap = useMemo(() => {
    const map: Record<string, KnockoutPrediction> = {}
    for (const p of predictions) {
      map[p.match_id] = p
    }
    return map
  }, [predictions])

  // While the bracket is editable, each later round's two participants flow from
  // the player's OWN predicted winners (W{n} sources), so they can pick a winner
  // for every match through to the Final. Once locked, we render the real
  // matchups/results instead. `effective` holds the per-match render model.
  const effective = useMemo(() => {
    const map = new Map<string, { match: KnockoutMatchWithTeams; prediction?: KnockoutPrediction }>()

    if (readonly) {
      for (const m of matches) map.set(m.id, { match: m, prediction: predictionMap[m.id] })
      return map
    }

    const resolved = resolveBracket(matches, predictionsToRecord(predictions))
    for (const m of matches) {
      const r = resolved.get(m.id)
      const effMatch: KnockoutMatchWithTeams = {
        ...m,
        home_team_id: r?.homeTeamId ?? null,
        away_team_id: r?.awayTeamId ?? null,
        home_team: r?.homeTeam ?? null,
        away_team: r?.awayTeam ?? null,
      }
      const effPred: KnockoutPrediction | undefined = r?.predictedWinnerId
        ? {
            id: predictionMap[m.id]?.id ?? '',
            entry_id: predictionMap[m.id]?.entry_id ?? '',
            match_id: m.id,
            predicted_winner_id: r.predictedWinnerId,
            is_correct: null,
            points_earned: 0,
            submitted_at: predictionMap[m.id]?.submitted_at ?? new Date(0).toISOString(),
          }
        : undefined
      map.set(m.id, { match: effMatch, prediction: effPred })
    }
    return map
  }, [matches, predictions, predictionMap, readonly])

  // Group matches by round, then split by bracket side
  const rounds = useMemo(() => {
    const roundOrder = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final']
    const grouped: Record<string, KnockoutMatchWithTeams[]> = {}

    for (const m of matches) {
      if (!grouped[m.round]) grouped[m.round] = []
      grouped[m.round].push(m)
    }

    // Sort each round by sort_order
    for (const round of Object.keys(grouped)) {
      grouped[round].sort((a, b) => a.sort_order - b.sort_order)
    }

    // Return rounds in tournament order, filtering out empty rounds
    return roundOrder
      .filter((r) => grouped[r] && grouped[r].length > 0)
      .map((r) => ({ round: r, matches: grouped[r] }))
  }, [matches])

  // Split into left side, right side, and final
  const { leftRounds, rightRounds, finalMatch } = useMemo(() => {
    const left: typeof rounds = []
    const right: typeof rounds = []
    let final: KnockoutMatchWithTeams | undefined

    for (const r of rounds) {
      if (r.round === 'final') {
        final = r.matches[0]
        continue
      }

      const leftMatches = r.matches.filter((m) => m.bracket_side === 'left')
      const rightMatches = r.matches.filter((m) => m.bracket_side === 'right')
      const unassigned = r.matches.filter((m) => !m.bracket_side)

      // If no sides assigned, split evenly
      if (leftMatches.length === 0 && rightMatches.length === 0 && unassigned.length > 0) {
        const mid = Math.ceil(unassigned.length / 2)
        if (mid > 0) left.push({ round: r.round, matches: unassigned.slice(0, mid) })
        if (unassigned.length > mid) right.push({ round: r.round, matches: unassigned.slice(mid) })
      } else {
        if (leftMatches.length > 0) left.push({ round: r.round, matches: leftMatches })
        if (rightMatches.length > 0) right.push({ round: r.round, matches: rightMatches })
      }
    }

    return { leftRounds: left, rightRounds: right, finalMatch: final }
  }, [rounds])

  function renderMatch(m: KnockoutMatchWithTeams) {
    const eff = effective.get(m.id)
    return (
      <BracketMatch
        key={m.id}
        match={eff?.match ?? m}
        prediction={eff?.prediction}
        onSelectWinner={onPrediction}
        readonly={readonly}
        goldenTicketUsed={goldenTicketMatchId === m.id}
        fullNames={fullNames}
      />
    )
  }

  function renderRound(roundMatches: KnockoutMatchWithTeams[]) {
    return (
      <div className="flex flex-col justify-around gap-4">
        {roundMatches.map((m) => renderMatch(m))}
      </div>
    )
  }

  // Mobile: simple stacked view
  const mobileView = (
    <div className="flex flex-col gap-6 md:hidden">
      {rounds.map((r) => (
        <div key={r.round}>
          <h3 className="mb-2 text-sm font-semibold text-text-secondary">
            {r.round.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {r.matches.map((m) => renderMatch(m))}
          </div>
        </div>
      ))}
    </div>
  )

  // Desktop: bracket view with left -> final <- right
  const desktopView = (
    <div className="hidden overflow-x-auto pb-2 md:block">
      <div className="mx-auto flex w-max items-center gap-6 px-4">
        {/* Left side */}
        <div className="flex items-center gap-6">
          {leftRounds.map((r) => (
            <div key={r.round}>{renderRound(r.matches)}</div>
          ))}
        </div>

        {/* Final */}
        {finalMatch && (
          <div className="flex flex-col items-center">
            <div className="mb-2 text-sm font-bold text-gold">Final</div>
            {renderMatch(finalMatch)}
          </div>
        )}

        {/* Right side (reversed round order to mirror bracket) */}
        <div className="flex items-center gap-6">
          {[...rightRounds].reverse().map((r) => (
            <div key={r.round}>{renderRound(r.matches)}</div>
          ))}
        </div>
      </div>
    </div>
  )

  // Simple left-to-right columns — one column per round, every match listed in
  // its round's column. Clearer than the mirrored bracket for entering picks.
  const columnsView = (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max gap-4 px-1">
        {rounds.map((r) => (
          <div key={r.round} className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-gold">
              {ROUND_LABELS[r.round] ?? r.round}
              <span className="ml-1 font-normal text-text-muted">({r.matches.length})</span>
            </h3>
            {r.matches.map((m) => renderMatch(m))}
          </div>
        ))}
      </div>
    </div>
  )

  if (layout === 'columns') {
    return <div>{columnsView}</div>
  }

  return (
    <div>
      {desktopView}
      {mobileView}
    </div>
  )
}
