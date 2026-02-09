'use client'

import { useMemo } from 'react'
import type { KnockoutMatchWithTeams, KnockoutPrediction } from '@/lib/types'
import { BracketMatch } from './BracketMatch'

interface KnockoutBracketProps {
  matches: KnockoutMatchWithTeams[]
  predictions?: KnockoutPrediction[]
  onPrediction?: (matchId: string, teamId: string) => void
  readonly?: boolean
}

export function KnockoutBracket({ matches, predictions = [], onPrediction, readonly = false }: KnockoutBracketProps) {
  const predictionMap = useMemo(() => {
    const map: Record<string, KnockoutPrediction> = {}
    for (const p of predictions) {
      map[p.match_id] = p
    }
    return map
  }, [predictions])

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

  function renderRound(roundMatches: KnockoutMatchWithTeams[]) {
    return (
      <div className="flex flex-col justify-around gap-4">
        {roundMatches.map((m) => (
          <BracketMatch
            key={m.id}
            match={m}
            prediction={predictionMap[m.id]}
            onSelectWinner={onPrediction}
            readonly={readonly}
          />
        ))}
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
            {r.matches.map((m) => (
              <BracketMatch
                key={m.id}
                match={m}
                prediction={predictionMap[m.id]}
                onSelectWinner={onPrediction}
                readonly={readonly}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  // Desktop: bracket view with left -> final <- right
  const desktopView = (
    <div className="hidden items-center justify-center gap-6 overflow-x-auto md:flex">
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
          <BracketMatch
            match={finalMatch}
            prediction={predictionMap[finalMatch.id]}
            onSelectWinner={onPrediction}
            readonly={readonly}
          />
        </div>
      )}

      {/* Right side (reversed round order to mirror bracket) */}
      <div className="flex items-center gap-6">
        {[...rightRounds].reverse().map((r) => (
          <div key={r.round}>{renderRound(r.matches)}</div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      {desktopView}
      {mobileView}
    </div>
  )
}
