import { describe, it, expect } from 'vitest'
import {
  resolveParticipantIds,
  predictionsToRecord,
  getEliminationRoundByTeam,
  roundIndexOf,
  type BracketMatchLike,
} from '@/lib/bracket'
import type { KnockoutMatchWithTeams } from '@/lib/types'

// A tiny 2-feeders-into-1 bracket:
//   m1 (R32 #1): A vs B
//   m2 (R32 #2): C vs D
//   m3 (R16 #17): W1 vs W2   (participants flow from the player's own picks)
const MATCHES: BracketMatchLike[] = [
  { id: 'm1', match_number: 1, home_team_id: 'A', away_team_id: 'B', home_source: '1X', away_source: '2Y' },
  { id: 'm2', match_number: 2, home_team_id: 'C', away_team_id: 'D', home_source: '1Y', away_source: '2X' },
  { id: 'm3', match_number: 17, home_team_id: null, away_team_id: null, home_source: 'W1', away_source: 'W2' },
]

describe('resolveParticipantIds', () => {
  it('uses the real slotted teams for the first round', () => {
    const { participants } = resolveParticipantIds(MATCHES, {})
    expect(participants.get('m1')).toEqual({ homeTeamId: 'A', awayTeamId: 'B' })
    expect(participants.get('m2')).toEqual({ homeTeamId: 'C', awayTeamId: 'D' })
  })

  it('flows a downstream match from the player\'s own predicted winners', () => {
    const { participants, validWinners } = resolveParticipantIds(MATCHES, { m1: 'A', m2: 'C' })
    // m3 is fed by the winners of m1 and m2 that the player picked.
    expect(participants.get('m3')).toEqual({ homeTeamId: 'A', awayTeamId: 'C' })
    expect(validWinners.get('m1')).toBe('A')
    expect(validWinners.get('m2')).toBe('C')
    // No m3 pick yet.
    expect(validWinners.get('m3')).toBe(null)
  })

  it('accepts a downstream pick that is one of the flowed participants', () => {
    const { validWinners } = resolveParticipantIds(MATCHES, { m1: 'A', m2: 'C', m3: 'A' })
    expect(validWinners.get('m3')).toBe('A')
  })

  it('prunes a downstream pick when the upstream winner changes', () => {
    // The player now backs B out of m1, so m3 is B vs C — their old m3 pick of A
    // is no longer a participant and must be dropped.
    const { participants, validWinners } = resolveParticipantIds(MATCHES, { m1: 'B', m2: 'C', m3: 'A' })
    expect(participants.get('m3')).toEqual({ homeTeamId: 'B', awayTeamId: 'C' })
    expect(validWinners.get('m3')).toBe(null)
  })

  it('treats a pick that is not in the match as no pick', () => {
    const { validWinners } = resolveParticipantIds(MATCHES, { m1: 'Z' })
    expect(validWinners.get('m1')).toBe(null)
  })

  it('leaves downstream TBD until both feeders are picked', () => {
    const { participants } = resolveParticipantIds(MATCHES, { m1: 'A' })
    expect(participants.get('m3')).toEqual({ homeTeamId: 'A', awayTeamId: null })
  })
})

describe('roundIndexOf', () => {
  it('orders the knockout rounds by depth', () => {
    expect(roundIndexOf('round_of_32')).toBe(0)
    expect(roundIndexOf('round_of_16')).toBe(1)
    expect(roundIndexOf('quarter_final')).toBe(2)
    expect(roundIndexOf('semi_final')).toBe(3)
    expect(roundIndexOf('final')).toBe(4)
    expect(roundIndexOf('nonsense')).toBe(-1)
  })
})

describe('getEliminationRoundByTeam', () => {
  // Minimal raw matches — only the fields the helper reads.
  const m = (
    round: string,
    home: string | null,
    away: string | null,
    winner: string | null
  ) =>
    ({ round, home_team_id: home, away_team_id: away, winner_team_id: winner } as unknown as KnockoutMatchWithTeams)

  it('records each loser at the depth of the round it lost in', () => {
    const elim = getEliminationRoundByTeam([
      m('round_of_32', 'A', 'B', 'A'), // B out at R32 (0)
      m('round_of_16', 'A', 'C', 'C'), // A out at R16 (1)
    ])
    expect(elim.get('B')).toBe(0)
    expect(elim.get('A')).toBe(1)
    expect(elim.has('C')).toBe(false) // C is still alive
  })

  it('ignores matches without a result and keeps winners out of the map', () => {
    const elim = getEliminationRoundByTeam([
      m('round_of_32', 'A', 'B', null), // not played yet
    ])
    expect(elim.size).toBe(0)
  })
})

describe('predictionsToRecord', () => {
  it('maps an array of predictions to a matchId -> winner record', () => {
    const rec = predictionsToRecord([
      { match_id: 'm1', predicted_winner_id: 'A' },
      { match_id: 'm2', predicted_winner_id: null },
    ])
    expect(rec).toEqual({ m1: 'A', m2: null })
  })
})
