// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BracketMatch } from '@/components/bracket/BracketMatch'
import type { KnockoutMatchWithTeams, KnockoutPrediction, Team } from '@/lib/types'

function team(id: string, code: string): Team {
  return { id, name: code, code, flag_emoji: null, flag_url: null } as unknown as Team
}

const A = team('a', 'AAA')
const B = team('b', 'BBB')

// A decided slot whose real winner is B (1-0). The card shows the player's
// predicted matchup; reviewMode adds the "Actual" footer for comparison.
const decidedMatch: KnockoutMatchWithTeams = {
  id: 'm1',
  tournament_id: 't1',
  round: 'round_of_16',
  match_number: 17,
  sort_order: 17,
  home_team_id: 'a',
  away_team_id: 'b',
  winner_team_id: 'b',
  home_score: 0,
  away_score: 1,
  home_source: null,
  away_source: null,
  bracket_side: null,
  home_team: A,
  away_team: B,
  winner_team: B,
} as unknown as KnockoutMatchWithTeams

function pick(winnerId: string): KnockoutPrediction {
  return { match_id: 'm1', predicted_winner_id: winnerId } as unknown as KnockoutPrediction
}

describe('<BracketMatch> review mode', () => {
  it('names the actual winner and marks a wrong pick with ✗', () => {
    render(<BracketMatch match={decidedMatch} prediction={pick('a')} readonly reviewMode />)

    expect(screen.getByText('Actual:')).toBeInTheDocument()
    // BBB shows twice: as the away team in the matchup, and in the Actual footer.
    expect(screen.getAllByText('BBB').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('(0-1)')).toBeInTheDocument()
    expect(screen.getByText('✗')).toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  it('marks a correct pick with ✓', () => {
    render(<BracketMatch match={decidedMatch} prediction={pick('b')} readonly reviewMode />)

    expect(screen.getByText('✓')).toBeInTheDocument()
    expect(screen.queryByText('✗')).not.toBeInTheDocument()
  })

  it('does not show the actual-winner footer outside review mode', () => {
    render(<BracketMatch match={decidedMatch} prediction={pick('a')} readonly />)
    expect(screen.queryByText('Actual:')).not.toBeInTheDocument()
  })
})
