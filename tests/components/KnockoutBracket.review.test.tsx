// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KnockoutBracket } from '@/components/bracket/KnockoutBracket'
import type { KnockoutMatchWithTeams, KnockoutPrediction, Team } from '@/lib/types'

// ---------------------------------------------------------------------------
// D3 at the bracket level. The locked "review my picks" mode must:
//   1. render every round through the Final,
//   2. show the PLAYER'S predicted matchup/winner (resolved from their own
//      picks) — NOT the actual matchup, even though the real bracket has since
//      advanced to a different set of teams,
//   3. annotate each DECIDED slot with an "Actual:" footer + ✓/✗.
// And the Results-page path (readonly, NO reviewMode, NO predictions) must stay
// raw: the ACTUAL teams render, untouched.
// ---------------------------------------------------------------------------

function team(id: string, code: string): Team {
  return { id, name: code, code, flag_emoji: null, flag_url: null } as unknown as Team
}

// Eight teams so a full mini-bracket (4×R32 -> 2×R16 -> 1×Final) resolves.
const TEAMS: Record<string, Team> = {
  a: team('a', 'AAA'),
  b: team('b', 'BBB'),
  c: team('c', 'CCC'),
  d: team('d', 'DDD'),
  e: team('e', 'EEE'),
  f: team('f', 'FFF'),
  g: team('g', 'GGG'),
  h: team('h', 'HHH'),
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
  home_score?: number | null
  away_score?: number | null
}): KnockoutMatchWithTeams {
  const {
    id,
    round,
    match_number,
    sort_order,
    home,
    away,
    winner = null,
    home_source = null,
    away_source = null,
    home_score = null,
    away_score = null,
  } = opts
  return {
    id,
    tournament_id: 't1',
    round,
    match_number,
    sort_order,
    home_team_id: home,
    away_team_id: away,
    winner_team_id: winner,
    home_score,
    away_score,
    home_source,
    away_source,
    bracket_side: null,
    home_team: home ? TEAMS[home] : null,
    away_team: away ? TEAMS[away] : null,
    winner_team: winner ? TEAMS[winner] : null,
  } as unknown as KnockoutMatchWithTeams
}

// Mini bracket:
//   R32: m1 (a v b -> a), m2 (c v d -> c), m3 (e v f -> e), m4 (g v h -> g)
//   R16: m17 feeds W1/W2; m18 feeds W3/W4
//   FIN: m31 feeds W17/W18
//
// The REAL bracket has advanced to ACTUAL teams that DIFFER from the player's
// predicted winners — R16 m17 is actually b v d (winner b), and the Final is
// actually d v g. The player predicted a v c (-> a) for m17 and a v e (-> a) for
// the Final. Review mode must show the player's predicted matchup, not these.
function buildMatches(): KnockoutMatchWithTeams[] {
  return [
    ko({ id: 'm1', round: 'round_of_32', match_number: 1, sort_order: 1, home: 'a', away: 'b', winner: 'a', home_score: 2, away_score: 0 }),
    ko({ id: 'm2', round: 'round_of_32', match_number: 2, sort_order: 2, home: 'c', away: 'd', winner: 'c', home_score: 1, away_score: 0 }),
    ko({ id: 'm3', round: 'round_of_32', match_number: 3, sort_order: 3, home: 'e', away: 'f', winner: 'e', home_score: 3, away_score: 1 }),
    ko({ id: 'm4', round: 'round_of_32', match_number: 4, sort_order: 4, home: 'g', away: 'h', winner: 'g', home_score: 2, away_score: 1 }),
    // ACTUAL R16 — real teams that DIFFER from the player's predicted matchup.
    ko({ id: 'm17', round: 'round_of_16', match_number: 17, sort_order: 17, home: 'b', away: 'd', winner: 'b', home_score: 1, away_score: 0, home_source: 'W1', away_source: 'W2' }),
    ko({ id: 'm18', round: 'round_of_16', match_number: 18, sort_order: 18, home: 'f', away: 'h', winner: 'f', home_score: 2, away_score: 1, home_source: 'W3', away_source: 'W4' }),
    // ACTUAL Final — again different from the player's prediction.
    ko({ id: 'mf', round: 'final', match_number: 31, sort_order: 31, home: 'd', away: 'g', winner: 'd', home_score: 1, away_score: 0, home_source: 'W17', away_source: 'W18' }),
  ]
}

// Player's OWN picks — chalk: every favourite (home) team advances.
//   m1->a, m2->c, m3->e, m4->g
//   m17 (W1=a v W2=c) -> a ;  m18 (W3=e v W4=g) -> e
//   final (W17=a v W18=e) -> a
const predictions: KnockoutPrediction[] = [
  { match_id: 'm1', predicted_winner_id: 'a' },
  { match_id: 'm2', predicted_winner_id: 'c' },
  { match_id: 'm3', predicted_winner_id: 'e' },
  { match_id: 'm4', predicted_winner_id: 'g' },
  { match_id: 'm17', predicted_winner_id: 'a' },
  { match_id: 'm18', predicted_winner_id: 'e' },
  { match_id: 'mf', predicted_winner_id: 'a' },
].map((p) => p as unknown as KnockoutPrediction)

describe('D3 — KnockoutBracket review mode (locked own-bracket review)', () => {
  it('renders the player\'s predicted bracket through the Final, with Actual ✓/✗ footers', () => {
    render(
      <KnockoutBracket
        matches={buildMatches()}
        predictions={predictions}
        readonly
        reviewMode
        layout="columns"
      />
    )

    // 1) Every round renders.
    expect(screen.getByText('Round of 32')).toBeInTheDocument()
    expect(screen.getByText('Round of 16')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()

    // 2) The R16 card shows the PLAYER'S predicted matchup (a v c) — NOT the
    //    actual one (b v d). The player's predicted winner of m1 is a, of m2 is c.
    //    So the resolved R16 slot must contain AAA and CCC as the two teams.
    //    The actual R16 matchup (b/d) must NOT be the rendered matchup teams.
    const r16Match = screen.getByText(/Round Of 16 #17/i).closest('div')!.parentElement as HTMLElement
    const r16 = within(r16Match)
    // Predicted matchup teams present:
    expect(r16.getAllByText('AAA').length).toBeGreaterThanOrEqual(1)
    expect(r16.getAllByText('CCC').length).toBeGreaterThanOrEqual(1)
    // The ACTUAL R16 matchup was b v d. Team d ('DDD') is a loser the player
    // never advanced, so it must NOT appear in this card at all (proving the
    // card shows the predicted matchup, not the real one).
    expect(r16.queryByText('DDD')).not.toBeInTheDocument()

    // 3) The Final renders the player's predicted finalists (a v e), and a
    //    decided 'Actual:' footer naming the real winner.
    const finalMatch = screen.getByText(/Final #31/i).closest('div')!.parentElement as HTMLElement
    const fin = within(finalMatch)
    expect(fin.getAllByText('AAA').length).toBeGreaterThanOrEqual(1) // predicted home
    expect(fin.getAllByText('EEE').length).toBeGreaterThanOrEqual(1) // predicted away
    expect(fin.getByText('Actual:')).toBeInTheDocument()

    // 4) Decided slots carry a ✓ or ✗ — the player's Final pick (a) is wrong
    //    (actual final winner d), so ✗. At least one ✗ must appear overall.
    expect(screen.getAllByText('✗').length).toBeGreaterThanOrEqual(1)

    // 5) Footers are present for played slots (R16/Final decided).
    expect(screen.getAllByText('Actual:').length).toBeGreaterThanOrEqual(2)
  })

  it('marks a CORRECT downstream pick with ✓ in the footer', () => {
    // R16 m17 is actually won by b; the player predicted a v c -> a. To get a ✓
    // somewhere downstream, also assert that at least one card matches. Here the
    // R32 m1 actual winner is a and the player picked a -> ✓.
    render(
      <KnockoutBracket
        matches={buildMatches()}
        predictions={predictions}
        readonly
        reviewMode
        layout="columns"
      />
    )
    // R32 #1: predicted a, actual winner a -> correct.
    const r32Match = screen.getByText(/Round Of 32 #1\b/i).closest('div')!.parentElement as HTMLElement
    const r32 = within(r32Match)
    expect(r32.getByText('Actual:')).toBeInTheDocument()
    expect(r32.getByText('✓')).toBeInTheDocument()
  })
})

describe('DO-NOT-BREAK — Results-page bracket (readonly, no reviewMode, no predictions)', () => {
  it('renders the RAW actual bracket (real teams + real winners, no review footer)', () => {
    render(
      <KnockoutBracket
        matches={buildMatches()}
        readonly
        layout="columns"
      />
    )

    // The ACTUAL R16 matchup is b v d — these must render as the real teams.
    const r16Match = screen.getByText(/Round Of 16 #17/i).closest('div')!.parentElement as HTMLElement
    const r16 = within(r16Match)
    expect(r16.getByText('BBB')).toBeInTheDocument()
    expect(r16.getByText('DDD')).toBeInTheDocument()
    // The player's predicted-only team (AAA/CCC) must NOT appear in this slot.
    expect(r16.queryByText('AAA')).not.toBeInTheDocument()
    expect(r16.queryByText('CCC')).not.toBeInTheDocument()

    // No review footer anywhere on the Results-page path.
    expect(screen.queryByText('Actual:')).not.toBeInTheDocument()
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
    expect(screen.queryByText('✗')).not.toBeInTheDocument()

    // The real winner of R16 m17 (b) is highlighted; the loser (d) is greyed —
    // raw result highlighting is intact (showResultHighlight = isDecided && !reviewMode).
    // The actual scoreline is shown on the raw path (1-0).
    expect(r16.getByText('1')).toBeInTheDocument()
  })
})
