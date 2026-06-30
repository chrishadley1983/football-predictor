// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KnockoutBracket } from '@/components/bracket/KnockoutBracket'
import type { KnockoutMatchWithTeams, KnockoutPrediction, Team } from '@/lib/types'

// ---------------------------------------------------------------------------
// Tom's tweak #3: in the locked "review my picks" bracket, a team the player
// predicted to advance that has ACTUALLY been knocked out must be greyed out and
// struck through wherever it survives in a LATER round of their bracket — but NOT
// in the round it actually exited (where the ✓/✗ colour already tells the story).
// ---------------------------------------------------------------------------

function team(id: string, code: string): Team {
  return { id, name: code, code, flag_emoji: null, flag_url: null } as unknown as Team
}

const TEAMS: Record<string, Team> = {
  a: team('a', 'AAA'),
  b: team('b', 'BBB'),
  c: team('c', 'CCC'),
  d: team('d', 'DDD'),
}

function ko(opts: {
  id: string
  round: KnockoutMatchWithTeams['round']
  match_number: number
  sort_order: number
  home: string | null
  away: string | null
  winner?: string | null
  home_source?: string | null
  away_source?: string | null
}): KnockoutMatchWithTeams {
  const { id, round, match_number, sort_order, home, away, winner = null, home_source = null, away_source = null } = opts
  return {
    id,
    tournament_id: 't1',
    round,
    match_number,
    sort_order,
    home_team_id: home,
    away_team_id: away,
    winner_team_id: winner,
    home_score: null,
    away_score: null,
    home_source,
    away_source,
    bracket_side: null,
    home_team: home ? TEAMS[home] : null,
    away_team: away ? TEAMS[away] : null,
    winner_team: winner ? TEAMS[winner] : null,
  } as unknown as KnockoutMatchWithTeams
}

// R32 m1 (a v b) actually won by b -> the player's pick 'a' is OUT at R32.
// R32 m2 (c v d) actually won by c -> 'c' survives.
// R16 m17 feeds W1/W2; the player's predicted matchup is a v c.
function buildMatches(): KnockoutMatchWithTeams[] {
  return [
    ko({ id: 'm1', round: 'round_of_32', match_number: 1, sort_order: 1, home: 'a', away: 'b', winner: 'b' }),
    ko({ id: 'm2', round: 'round_of_32', match_number: 2, sort_order: 2, home: 'c', away: 'd', winner: 'c' }),
    ko({ id: 'm17', round: 'round_of_16', match_number: 17, sort_order: 17, home: null, away: null, home_source: 'W1', away_source: 'W2' }),
  ]
}

// Player advanced 'a' (which actually lost) and 'c', then picked 'a' for R16.
const predictions: KnockoutPrediction[] = [
  { match_id: 'm1', predicted_winner_id: 'a' },
  { match_id: 'm2', predicted_winner_id: 'c' },
  { match_id: 'm17', predicted_winner_id: 'a' },
].map((p) => p as unknown as KnockoutPrediction)

describe('Tweak #3 — eliminated team greyed + struck in later bracket rounds', () => {
  it('strikes through an eliminated predicted team where it appears LATER', () => {
    render(
      <KnockoutBracket matches={buildMatches()} predictions={predictions} readonly reviewMode layout="columns" />
    )

    const r16Card = screen.getByText(/Round Of 16 #17/i).closest('div')!.parentElement as HTMLElement
    const r16 = within(r16Card)
    // 'a' is out (lost R32) yet appears in the player's predicted R16 -> struck.
    expect(r16.getByText('AAA')).toHaveClass('line-through')
    // 'c' is still alive -> NOT struck.
    expect(r16.getByText('CCC')).not.toHaveClass('line-through')
  })

  it('does NOT strike the team in the round it actually exited', () => {
    render(
      <KnockoutBracket matches={buildMatches()} predictions={predictions} readonly reviewMode layout="columns" />
    )
    // R32 #1 is where 'a' lost — it shows as a wrong pick, not struck through.
    const r32Card = screen.getByText(/Round Of 32 #1\b/i).closest('div')!.parentElement as HTMLElement
    expect(within(r32Card).getByText('AAA')).not.toHaveClass('line-through')
  })
})
