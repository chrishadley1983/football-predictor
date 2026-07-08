// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KnockoutPredictionMatrix } from '@/components/predictions/KnockoutPredictionMatrix'
import type { PredictionSummary, KnockoutMatch, Team } from '@/lib/types'

// ---------------------------------------------------------------------------
// Tom's tweak #2: the all-players knockout grid is flipped (matches across the
// top, players down the side), each match column is sortable to cluster players
// by their pick, and a COMPLETED round collapses to a single per-player points
// total (expandable).
// ---------------------------------------------------------------------------

function team(id: string, code: string): Team {
  return { id, name: code, code, flag_emoji: null, flag_url: null } as unknown as Team
}
const TEAMS = [team('a', 'AA'), team('b', 'BB'), team('c', 'CC'), team('d', 'DD')]

function ko(id: string, round: string, sort: number, home: string | null, away: string | null, winner: string | null, num: number): KnockoutMatch {
  return {
    id,
    tournament_id: 't1',
    round,
    match_number: num,
    bracket_side: null,
    home_source: null,
    away_source: null,
    home_team_id: home,
    away_team_id: away,
    home_score: null,
    away_score: null,
    winner_team_id: winner,
    points_value: 1,
    sort_order: sort,
  } as unknown as KnockoutMatch
}

// R32 fully decided (m1: a beats b, m2: c beats d). R16 (m17) not yet played.
const MATCHES: KnockoutMatch[] = [
  ko('m1', 'round_of_32', 1, 'a', 'b', 'a', 1),
  ko('m2', 'round_of_32', 2, 'c', 'd', 'c', 2),
  ko('m17', 'round_of_16', 17, null, null, null, 17),
]

function player(entryId: string, name: string, picks: Record<string, string>, pts: Record<string, number>): PredictionSummary {
  return {
    entry_id: entryId,
    player: { id: entryId, display_name: name, avatar_url: null } as unknown as PredictionSummary['player'],
    group_predictions: [],
    knockout_predictions: Object.entries(picks).map(([matchId, winner]) => ({
      match_id: matchId,
      predicted_winner_id: winner,
      points_earned: pts[matchId] ?? 0,
    })) as unknown as PredictionSummary['knockout_predictions'],
  }
}

// Alice 2 KO pts, Carol 1, Bob 0 — so the default (points-desc) order is A,C,B.
const PREDICTIONS: PredictionSummary[] = [
  player('e1', 'Alice', { m1: 'a', m2: 'c', m17: 'a' }, { m1: 1, m2: 1 }),
  player('e2', 'Bob', { m1: 'b', m2: 'd', m17: 'b' }, {}),
  player('e3', 'Carol', { m1: 'a', m2: 'd', m17: 'c' }, { m1: 1 }),
]

function rowOrder(): string[] {
  return Array.from(document.querySelectorAll('tbody tr')).map((r) => {
    const t = r.textContent ?? ''
    return ['Alice', 'Bob', 'Carol'].find((n) => t.includes(n)) ?? '?'
  })
}

describe('Tweak #2 — KnockoutPredictionMatrix (flipped, collapsible, sortable)', () => {
  it('renders players as ROWS and matches as COLUMNS', () => {
    render(<KnockoutPredictionMatrix predictions={PREDICTIONS} knockoutMatches={MATCHES} teams={TEAMS} />)
    // Players down the side.
    for (const name of ['Alice', 'Bob', 'Carol']) expect(screen.getByText(name)).toBeInTheDocument()
    // The in-progress R16 match is a column (its sort header is present).
    expect(screen.getByTitle(/Match 1 — click to sort/i)).toBeInTheDocument()
  })

  it('collapses a COMPLETED round by default and expands it on click', () => {
    render(<KnockoutPredictionMatrix predictions={PREDICTIONS} knockoutMatches={MATCHES} teams={TEAMS} />)
    // R32 is complete -> starts collapsed: its per-match (AA v BB) header is hidden.
    expect(screen.queryByTitle(/AA v BB/i)).not.toBeInTheDocument()
    expect(screen.getByTitle(/Round of 32 — click to expand/i)).toBeInTheDocument()
    // Expand it -> the match column header appears.
    fireEvent.click(screen.getByTitle(/Round of 32 — click to expand/i))
    expect(screen.getByTitle(/AA v BB/i)).toBeInTheDocument()
  })

  it('sorts players by total knockout points', () => {
    render(<KnockoutPredictionMatrix predictions={PREDICTIONS} knockoutMatches={MATCHES} teams={TEAMS} />)
    // Default: points descending.
    expect(rowOrder()).toEqual(['Alice', 'Carol', 'Bob'])
    const totalHeader = screen.getByTitle('Sort by total knockout points')
    fireEvent.click(totalHeader) // -> desc (unchanged)
    fireEvent.click(totalHeader) // -> asc
    expect(rowOrder()).toEqual(['Bob', 'Carol', 'Alice'])
  })

  // When per-entry score data is supplied, the grid gains an overall Total column
  // (group + knockout) and defaults to leaderboard order rather than KO-only order.
  const ENTRIES = [
    // Bob has the fewest KO points but the most group points -> tops the overall Total.
    entry('e1', 'Alice', 5, 2), // total 7
    entry('e2', 'Bob', 12, 0), // total 12
    entry('e3', 'Carol', 4, 1), // total 5
  ]
  function entry(entryId: string, name: string, group: number, ko: number) {
    return {
      entry_id: entryId,
      player_id: entryId,
      player: { id: entryId, display_name: name, avatar_url: null },
      group_stage_points: group,
      knockout_points: ko,
      total_points: group + ko,
      tiebreaker_goals: null,
      tiebreaker_diff: null,
      overall_rank: null,
    } as unknown as import('@/components/predictions/PredictionAnalyser').EntryInfo
  }

  it('adds an overall Total column and defaults to overall-total order when entries are supplied', () => {
    render(
      <KnockoutPredictionMatrix
        predictions={PREDICTIONS}
        knockoutMatches={MATCHES}
        teams={TEAMS}
        entries={ENTRIES}
      />
    )
    // Default order now follows overall total (Bob 12, Alice 7, Carol 5),
    // NOT the KO-only order (Alice, Carol, Bob).
    expect(rowOrder()).toEqual(['Bob', 'Alice', 'Carol'])
    // Both a Total (overall) and a KO (knockout) sort header are present.
    expect(screen.getByTitle('Sort by total points (group + knockout)')).toBeInTheDocument()
    expect(screen.getByTitle('Sort by total knockout points')).toBeInTheDocument()
    // Sorting by KO points reverts to the knockout order (Alice 2, Carol 1, Bob 0).
    fireEvent.click(screen.getByTitle('Sort by total knockout points'))
    expect(rowOrder()).toEqual(['Alice', 'Carol', 'Bob'])
  })
})
