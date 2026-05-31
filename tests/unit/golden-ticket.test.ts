import { describe, it, expect, vi } from 'vitest'
import { makeFakeAdmin, type Tables } from '../helpers/fake-supabase'

// golden-ticket.ts takes the admin client as a parameter, but it imports
// getExistingKnockoutRounds from seed-helpers, which calls createAdminClient().
// Mock that module so the fake is used there too (defensive — getGoldenTicketWindow
// passes its own admin through, but seed-helpers is server-only).
let current: any
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => current,
}))

import {
  getGoldenTicketWindow,
  getEligibleSwaps,
  applyGoldenTicket,
} from '@/lib/golden-ticket'

const T = 'tournament-1'

function team(id: string) {
  return { id, name: id, code: id, flag_emoji: null, flag_url: null }
}

describe('getGoldenTicketWindow', () => {
  it('is open when a round is fully decided and the next round is untouched', async () => {
    current = makeFakeAdmin({
      knockout_matches: [
        { id: 'r16-1', tournament_id: T, round: 'round_of_16', winner_team_id: 'A' },
        { id: 'r16-2', tournament_id: T, round: 'round_of_16', winner_team_id: 'B' },
        { id: 'qf-1', tournament_id: T, round: 'quarter_final', winner_team_id: null },
      ],
    })
    const win = await getGoldenTicketWindow(current, T)
    expect(win).toEqual({ isOpen: true, completedRound: 'round_of_16', nextRound: 'quarter_final' })
  })

  it('is closed when the next round already has a result', async () => {
    current = makeFakeAdmin({
      knockout_matches: [
        { id: 'r16-1', tournament_id: T, round: 'round_of_16', winner_team_id: 'A' },
        { id: 'qf-1', tournament_id: T, round: 'quarter_final', winner_team_id: 'A' },
      ],
    })
    const win = await getGoldenTicketWindow(current, T)
    expect(win.isOpen).toBe(false)
  })

  it('is closed when the completed round is not fully decided', async () => {
    current = makeFakeAdmin({
      knockout_matches: [
        { id: 'r16-1', tournament_id: T, round: 'round_of_16', winner_team_id: 'A' },
        { id: 'r16-2', tournament_id: T, round: 'round_of_16', winner_team_id: null },
        { id: 'qf-1', tournament_id: T, round: 'quarter_final', winner_team_id: null },
      ],
    })
    const win = await getGoldenTicketWindow(current, T)
    expect(win.isOpen).toBe(false)
  })

  it('is closed when there are no knockout matches', async () => {
    current = makeFakeAdmin({ knockout_matches: [] })
    const win = await getGoldenTicketWindow(current, T)
    expect(win).toEqual({ isOpen: false, completedRound: null, nextRound: null })
  })
})

describe('getEligibleSwaps', () => {
  it('returns matches in the completed round where the player picked the loser', async () => {
    // The fake ignores the select projection and returns whole rows, so we
    // store the joined team objects directly under home_team/away_team.
    current = makeFakeAdmin({
      knockout_matches: [
        {
          id: 'm1',
          tournament_id: T,
          round: 'round_of_16',
          sort_order: 1,
          winner_team_id: 'A',
          home_team: team('A'),
          away_team: team('B'),
        },
        {
          id: 'm2',
          tournament_id: T,
          round: 'round_of_16',
          sort_order: 2,
          winner_team_id: 'C',
          home_team: team('C'),
          away_team: team('D'),
        },
      ],
      knockout_predictions: [
        // Wrong on m1 (picked B, A won) -> eligible
        { id: 'kp1', entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'B' },
        // Correct on m2 (picked C, C won) -> not eligible
        { id: 'kp2', entry_id: 'e1', match_id: 'm2', predicted_winner_id: 'C' },
      ],
    })

    const swaps = await getEligibleSwaps(current, T, 'e1', 'round_of_16')
    expect(swaps).toHaveLength(1)
    expect(swaps[0]).toMatchObject({
      match_id: 'm1',
      wrong_team_id: 'B',
      winner_team_id: 'A',
    })
    expect(swaps[0].wrong_team.id).toBe('B')
    expect(swaps[0].winner_team.id).toBe('A')
  })

  it('returns nothing when the player has no predictions for the round', async () => {
    current = makeFakeAdmin({
      knockout_matches: [
        {
          id: 'm1',
          tournament_id: T,
          round: 'round_of_16',
          sort_order: 1,
          winner_team_id: 'A',
          home_team: team('A'),
          away_team: team('B'),
        },
      ],
      knockout_predictions: [],
    })
    const swaps = await getEligibleSwaps(current, T, 'e1', 'round_of_16')
    expect(swaps).toEqual([])
  })
})

describe('applyGoldenTicket', () => {
  it('swaps the pick to the new team, cascades downstream, and records the ticket', async () => {
    // Bracket: m1 (match_number 1) feeds m2 (home_source "W1"), m2 feeds m3 ("W2").
    current = makeFakeAdmin({
      knockout_matches: [
        { id: 'm1', tournament_id: T, match_number: 1, home_source: '1A', away_source: '2B' },
        { id: 'm2', tournament_id: T, match_number: 2, home_source: 'W1', away_source: '1C' },
        { id: 'm3', tournament_id: T, match_number: 3, home_source: 'W2', away_source: '1D' },
      ],
      knockout_predictions: [
        // Player originally predicted "B" through the whole branch
        { id: 'kp1', entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'B' },
        { id: 'kp2', entry_id: 'e1', match_id: 'm2', predicted_winner_id: 'B' },
        { id: 'kp3', entry_id: 'e1', match_id: 'm3', predicted_winner_id: 'B' },
      ],
      golden_tickets: [],
    })

    await applyGoldenTicket(current, T, 'e1', 'm1', 'A', 'round_of_16')

    const preds = Object.fromEntries(
      current.tables.knockout_predictions.map((p: any) => [p.id, p.predicted_winner_id])
    )
    // The ticket match AND all downstream picks now carry the new team "A".
    expect(preds.kp1).toBe('A')
    expect(preds.kp2).toBe('A')
    expect(preds.kp3).toBe('A')

    // Audit row recorded with old/new team and the round.
    expect(current.tables.golden_tickets).toHaveLength(1)
    expect(current.tables.golden_tickets[0]).toMatchObject({
      entry_id: 'e1',
      tournament_id: T,
      original_match_id: 'm1',
      original_team_id: 'B',
      new_team_id: 'A',
      played_after_round: 'round_of_16',
    })
  })

  it('throws when there is no existing prediction for the match', async () => {
    current = makeFakeAdmin({
      knockout_matches: [{ id: 'm1', tournament_id: T, match_number: 1 }],
      knockout_predictions: [],
      golden_tickets: [],
    })
    await expect(applyGoldenTicket(current, T, 'e1', 'm1', 'A', 'round_of_16')).rejects.toThrow(
      /No existing prediction/
    )
  })
})
