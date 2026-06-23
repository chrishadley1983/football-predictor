// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PredictionGrid } from '@/components/predictions/PredictionGrid'
import type {
  PredictionSummary,
  GroupWithTeams,
  KnockoutMatch,
  Team,
  Player,
} from '@/lib/types'

// Minimal team factory — the grid only reads id / code / name / flag_emoji.
function team(id: string, code: string): Team {
  return { id, name: code, code, flag_emoji: null, flag_url: null } as unknown as Team
}

const A = team('a', 'AAA')
const B = team('b', 'BBB')
const C = team('c', 'CCC')
const D = team('d', 'DDD')

// One group carries the teams so the grid can resolve codes (rows are hidden in
// knockout view, but the team lookup still reads from `groups`).
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
    home_source: home ? null : `W${match_number - 1}`,
    away_source: away ? null : `W${match_number}`,
    bracket_side: null,
  } as unknown as KnockoutMatch
}

// R32 has real teams; R16 + Final are unresolved (no results yet) — exactly the
// state right after the knockout locks. These used to vanish from the grid.
const knockoutMatches: KnockoutMatch[] = [
  ko('m1', 'round_of_32', 1, 'a', 'b'),
  ko('m2', 'round_of_32', 2, 'c', 'd'),
  ko('m3', 'round_of_16', 17, null, null),
  ko('mf', 'final', 31, null, null),
]

const predictions: PredictionSummary[] = [
  {
    entry_id: 'e1',
    player: { id: 'p1', display_name: 'Tom Freeman', nickname: null, avatar_url: null } as unknown as Player,
    group_predictions: [],
    knockout_predictions: [
      { match_id: 'm1', predicted_winner_id: 'a' },
      { match_id: 'm2', predicted_winner_id: 'c' },
      { match_id: 'm3', predicted_winner_id: 'a' },
      { match_id: 'mf', predicted_winner_id: 'a' },
    ] as unknown as PredictionSummary['knockout_predictions'],
  },
]

describe('<PredictionGrid> knockout view', () => {
  it('renders every round — not just R32 and the Final — once the bracket is public', () => {
    render(
      <PredictionGrid
        predictions={predictions}
        groups={groups}
        knockoutMatches={knockoutMatches}
        knockoutVisible
        hideGroups
        useShortNames
      />
    )

    // The in-between round renders even though its matchup isn't decided yet.
    expect(screen.getByText('Round of 32')).toBeInTheDocument()
    expect(screen.getByText('Round of 16')).toBeInTheDocument()

    // The Final is the highlighted champion row (not a duplicate round section).
    expect(screen.getByText('🏆 Predicted Champion')).toBeInTheDocument()

    // An unresolved downstream slot falls back to a slot label rather than vanishing.
    expect(screen.getByText('Match 1')).toBeInTheDocument()
  })
})
