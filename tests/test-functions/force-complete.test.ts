import { describe, it, expect } from 'vitest'
import { makeFakeAdmin } from '../helpers/fake-supabase'
import { advanceWinnerLogic, forceCompleteKnockoutRoundLogic } from '@/lib/testing/seed-helpers'

const T = 'tournament-1'

// The helpers take a real SupabaseClient; the in-memory fake stands in for it.
type Admin = Parameters<typeof advanceWinnerLogic>[0]
const asAdmin = (c: { tables: unknown }) => c as unknown as Admin

describe('advanceWinnerLogic', () => {
  it('populates the downstream match home/away from W{matchNumber} sources', async () => {
    const admin = makeFakeAdmin({
      knockout_matches: [
        { id: 'sf1', tournament_id: T, match_number: 1, round: 'semi_final' },
        { id: 'sf2', tournament_id: T, match_number: 2, round: 'semi_final' },
        { id: 'final', tournament_id: T, match_number: 3, round: 'final', home_source: 'W1', away_source: 'W2', home_team_id: null, away_team_id: null },
      ],
    })

    await advanceWinnerLogic(asAdmin(admin), T, 1, 'TeamA')
    await advanceWinnerLogic(asAdmin(admin), T, 2, 'TeamB')

    const final = admin.tables.knockout_matches.find((m) => m.id === 'final')!
    expect(final.home_team_id).toBe('TeamA')
    expect(final.away_team_id).toBe('TeamB')
  })

  it('does nothing when no downstream match references the winner', async () => {
    const admin = makeFakeAdmin({
      knockout_matches: [{ id: 'final', tournament_id: T, match_number: 7, round: 'final' }],
    })
    await expect(advanceWinnerLogic(asAdmin(admin), T, 7, 'TeamX')).resolves.toBeUndefined()
  })
})

describe('forceCompleteKnockoutRoundLogic', () => {
  it('decides every match in the round and advances winners downstream', async () => {
    const admin = makeFakeAdmin({
      knockout_matches: [
        { id: 'sf1', tournament_id: T, match_number: 1, round: 'semi_final', home_team_id: 'A', away_team_id: 'B', winner_team_id: null, home_score: null, away_score: null },
        { id: 'sf2', tournament_id: T, match_number: 2, round: 'semi_final', home_team_id: 'C', away_team_id: 'D', winner_team_id: null, home_score: null, away_score: null },
        { id: 'final', tournament_id: T, match_number: 3, round: 'final', home_source: 'W1', away_source: 'W2', home_team_id: null, away_team_id: null, winner_team_id: null },
      ],
    })

    const result = await forceCompleteKnockoutRoundLogic(asAdmin(admin), T, 'semi_final')

    expect(result.decidedCount).toBe(2)
    const sf1 = admin.tables.knockout_matches.find((m) => m.id === 'sf1')!
    const sf2 = admin.tables.knockout_matches.find((m) => m.id === 'sf2')!
    const final = admin.tables.knockout_matches.find((m) => m.id === 'final')!

    // Winners are one of the two competing teams
    expect(['A', 'B']).toContain(sf1.winner_team_id)
    expect(['C', 'D']).toContain(sf2.winner_team_id)
    // Winner's score is >= loser's (draws go to penalties)
    expect(Math.max(sf1.home_score, sf1.away_score)).toBeGreaterThanOrEqual(Math.min(sf1.home_score, sf1.away_score))

    // Winners advanced into the final
    expect(final.home_team_id).toBe(sf1.winner_team_id)
    expect(final.away_team_id).toBe(sf2.winner_team_id)

    // Final is still undecided → tournament not complete
    expect(result.allKnockoutComplete).toBe(false)
  })

  it('reports allKnockoutComplete when the final round is decided', async () => {
    const admin = makeFakeAdmin({
      knockout_matches: [
        { id: 'final', tournament_id: T, match_number: 3, round: 'final', home_team_id: 'A', away_team_id: 'B', winner_team_id: null },
      ],
    })
    const result = await forceCompleteKnockoutRoundLogic(asAdmin(admin), T, 'final')
    expect(result.decidedCount).toBe(1)
    expect(result.allKnockoutComplete).toBe(true)
  })

  it('throws when the round has no matches', async () => {
    const admin = makeFakeAdmin({ knockout_matches: [] })
    await expect(forceCompleteKnockoutRoundLogic(asAdmin(admin), T, 'final')).rejects.toThrow(/No matches/)
  })
})
