// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PredictionAnalyser, type EntryInfo } from '@/components/predictions/PredictionAnalyser'
import type {
  PredictionSummary,
  GroupWithTeams,
  GroupResult,
  KnockoutMatch,
  Team,
  Player,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// D2 in the head-to-head Analyser: once the bracket is public the knockout H2H
// table must render EVERY round (R32, R16, QF, SF, Final) even when a downstream
// round's matchup isn't decided yet — the previous bug dropped null-team rows so
// only R32 + Final survived. A null-matchup slot falls back to a 'Match N' label.
// ---------------------------------------------------------------------------

function team(id: string, code: string): Team {
  return { id, name: id, code, flag_emoji: null, flag_url: null } as unknown as Team
}

const A = team('a', 'AAA')
const B = team('b', 'BBB')
const C = team('c', 'CCC')
const D = team('d', 'DDD')

const groups: GroupWithTeams[] = [
  {
    id: 'g1',
    tournament_id: 't1',
    name: 'Group A',
    sort_order: 0,
    group_teams: [A, B, C, D].map((t, i) => ({ id: `gt${i}`, team: t })),
  } as unknown as GroupWithTeams,
]

function ko(
  id: string,
  round: KnockoutMatch['round'],
  match_number: number,
  home: string | null,
  away: string | null,
  winner: string | null = null
): KnockoutMatch {
  return {
    id,
    tournament_id: 't1',
    round,
    match_number,
    sort_order: match_number,
    home_team_id: home,
    away_team_id: away,
    winner_team_id: winner,
    home_score: null,
    away_score: null,
    home_source: home ? null : `W${match_number - 1}`,
    away_source: away ? null : `W${match_number}`,
    bracket_side: null,
  } as unknown as KnockoutMatch
}

// R32 decided (winner set); R16/QF/SF/Final all have NULL home/away ids — exactly
// the "after_round_of_32" state where the bracket hasn't advanced downstream.
const knockoutMatches: KnockoutMatch[] = [
  ko('m1', 'round_of_32', 1, 'a', 'b', 'a'),
  ko('m2', 'round_of_32', 2, 'c', 'd', 'c'),
  ko('m17', 'round_of_16', 17, null, null),
  ko('m25', 'quarter_final', 25, null, null),
  ko('m29', 'semi_final', 29, null, null),
  ko('mf', 'final', 31, null, null),
]

const player: Player = {
  id: 'p1',
  display_name: 'Tom Freeman',
  nickname: null,
  avatar_url: null,
} as unknown as Player

const predictions: PredictionSummary[] = [
  {
    entry_id: 'e1',
    player,
    group_predictions: [],
    knockout_predictions: [
      { match_id: 'm1', predicted_winner_id: 'a', points_earned: 0 },
      { match_id: 'm2', predicted_winner_id: 'c', points_earned: 0 },
      { match_id: 'm17', predicted_winner_id: 'a', points_earned: 0 },
      { match_id: 'm25', predicted_winner_id: 'a', points_earned: 0 },
      { match_id: 'm29', predicted_winner_id: 'a', points_earned: 0 },
      { match_id: 'mf', predicted_winner_id: 'a', points_earned: 0 },
    ] as unknown as PredictionSummary['knockout_predictions'],
  },
]

const entries: EntryInfo[] = [
  {
    entry_id: 'e1',
    player_id: 'p1',
    player,
    group_stage_points: 0,
    knockout_points: 0,
    total_points: 0,
    tiebreaker_goals: null,
    tiebreaker_diff: null,
    overall_rank: 1,
  },
]

const results: GroupResult[] = []

describe('D2 — PredictionAnalyser knockout H2H view (solo mode)', () => {
  it('renders EVERY round in solo mode, including downstream rounds with null matchups', () => {
    // currentPlayerId auto-selects Player A => solo mode (Player B = none).
    render(
      <PredictionAnalyser
        predictions={predictions}
        groups={groups}
        results={results}
        entries={entries}
        currentPlayerId="p1"
        knockoutMatches={knockoutMatches}
        knockoutVisible
        hideGroups
      />
    )

    const knockout = screen.getByTestId('h2h-knockout')
    const ko = within(knockout)

    // All four non-final round headers + the Final all appear (previously the
    // null-matchup rounds R16/QF/SF vanished, leaving only R32 + Final).
    expect(ko.getByText('Round of 32')).toBeInTheDocument()
    expect(ko.getByText('Round of 16')).toBeInTheDocument()
    expect(ko.getByText('Quarter Finals')).toBeInTheDocument()
    expect(ko.getByText('Semi Finals')).toBeInTheDocument()
    expect(ko.getByText('Final')).toBeInTheDocument()

    // A null-matchup downstream slot falls back to its 'Match N' label rather
    // than being dropped. R16/QF/SF/Final each contribute one 'Match 1' slot.
    expect(ko.getAllByText('Match 1').length).toBeGreaterThanOrEqual(4)
  })
})
