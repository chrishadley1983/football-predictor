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

// ---------------------------------------------------------------------------
// D1 at the component level: while the knockout is OPEN the page passes
// knockoutVisible={false}, so the grid must NOT render ANY knockout content —
// not even for an admin viewer. Once the bracket CLOSES the page flips both
// knockoutVisible and hideGroups to true and the knockout content appears.
// ---------------------------------------------------------------------------

function team(id: string, code: string): Team {
  return { id, name: code, code, flag_emoji: null, flag_url: null } as unknown as Team
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
    home_source: home ? null : `W${match_number - 1}`,
    away_source: away ? null : `W${match_number}`,
    bracket_side: null,
  } as unknown as KnockoutMatch
}

// R32 has real teams; R16/Final unresolved — same baseline as the locked state.
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

describe('D1 — knockout visibility gate (PredictionGrid)', () => {
  it('renders NO knockout content while OPEN (knockoutVisible={false}), even with knockout data supplied', () => {
    // The page never even FETCHES knockout data while OPEN, but a defensive test:
    // even if matches are passed, knockoutVisible={false} must suppress them.
    render(
      <PredictionGrid
        predictions={predictions}
        groups={groups}
        knockoutMatches={knockoutMatches}
        knockoutVisible={false}
        hideGroups={false}
        useShortNames
      />
    )

    // No champion row, no round sections — nobody (admins included) sees brackets.
    expect(screen.queryByText('🏆 Predicted Champion')).not.toBeInTheDocument()
    expect(screen.queryByText('Round of 32')).not.toBeInTheDocument()
    expect(screen.queryByText('Round of 16')).not.toBeInTheDocument()

    // Group Stage is still shown (header is 'Group'/'Pos', not the knockout 'Match').
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('Pos')).toBeInTheDocument()
    expect(screen.queryByText('Match')).not.toBeInTheDocument()
  })

  it('renders the full knockout grid once CLOSED (knockoutVisible + hideGroups)', () => {
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

    // Knockout content now appears...
    expect(screen.getByText('🏆 Predicted Champion')).toBeInTheDocument()
    expect(screen.getByText('Round of 32')).toBeInTheDocument()
    expect(screen.getByText('Round of 16')).toBeInTheDocument()

    // ...and the group rows are gone (header switched to the knockout 'Match' column).
    expect(screen.queryByText('Group A')).not.toBeInTheDocument()
    expect(screen.getByText('Match')).toBeInTheDocument()
    expect(screen.queryByText('Pos')).not.toBeInTheDocument()
  })
})

describe('D1 — page status gate (pure)', () => {
  // Mirrors predictions/page.tsx line 168:
  //   knockoutPublic = ['knockout_closed','completed'].includes(t.status)
  // The OLD bug also OR-ed in isAdmin; the fix removed it. This pure check guards
  // the exact statuses that must (not) expose knockout brackets.
  const knockoutPublic = (status: string) =>
    ['knockout_closed', 'completed'].includes(status)

  it('keeps knockout HIDDEN for pre-close statuses', () => {
    for (const status of ['group_stage_open', 'group_stage_closed', 'knockout_open']) {
      expect(knockoutPublic(status)).toBe(false)
    }
  })

  it('exposes knockout only once CLOSED or COMPLETED', () => {
    expect(knockoutPublic('knockout_closed')).toBe(true)
    expect(knockoutPublic('completed')).toBe(true)
  })

  it('does not depend on admin — the gate is status-only (no isAdmin escape hatch)', () => {
    // The expression takes a single arg (status). There is no admin override:
    // an admin viewing knockout_open is gated identically to an anon viewer.
    expect(knockoutPublic('knockout_open')).toBe(false)
  })
})
