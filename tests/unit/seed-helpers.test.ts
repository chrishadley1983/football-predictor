import { describe, it, expect, vi } from 'vitest'
import { makeFakeAdmin } from '../helpers/fake-supabase'

let current: any
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => current,
}))

import {
  resolveGroupSource,
  generateGroupPrediction,
  generateKnockoutPrediction,
  generateTiebreakerGoals,
  matchThirdsToSlots,
  KNOCKOUT_ROUNDS_ORDER,
  getExistingKnockoutRounds,
  TEST_PLAYERS,
  TEST_EMAIL_DOMAIN,
} from '@/lib/testing/seed-helpers'

// The 8 "best 3rd" composite slots of the WC2026 (12-group) Round of 32.
const WC2026_THIRD_SLOTS = [
  ['C', 'D', 'E'],
  ['A', 'D', 'E'],
  ['A', 'B', 'C'],
  ['B', 'G', 'H'],
  ['F', 'G', 'H'],
  ['I', 'J', 'K'],
  ['I', 'J', 'L'],
  ['F', 'K', 'L'],
]

describe('matchThirdsToSlots', () => {
  function rank(letters: string[]): Map<string, number> {
    return new Map(letters.map((l, i) => [l, i]))
  }

  it('fills every composite slot (the previously-flaky case is now complete)', () => {
    const all = 'ABCDEFGHIJKL'.split('')
    const matched = matchThirdsToSlots(WC2026_THIRD_SLOTS, rank(all))
    expect(matched.size).toBe(8)
    // Slot 3F/K/L can only be served by F, K or L, so one of them must qualify.
    expect(['F', 'K', 'L'].some((l) => matched.has(l))).toBe(true)
  })

  it('rejects the unsolvable top-8-by-points set by choosing a coverable one', () => {
    // A,B,C,D,E,G,H,J were the "best" thirds but cannot cover 3F/K/L. The matcher
    // must instead pick a set that covers every slot.
    const ranked = ['A', 'B', 'C', 'D', 'E', 'G', 'H', 'J', 'F', 'I', 'K', 'L']
    const matched = matchThirdsToSlots(WC2026_THIRD_SLOTS, rank(ranked))
    expect(matched.size).toBe(8)
    for (const slot of WC2026_THIRD_SLOTS) {
      expect(slot.some((l) => matched.has(l))).toBe(true)
    }
  })

  it('prefers higher-ranked thirds when there is freedom', () => {
    const matched = matchThirdsToSlots([['C', 'D', 'E']], rank(['D', 'C', 'E']))
    expect([...matched]).toEqual(['D'])
  })
})

describe('resolveGroupSource', () => {
  const results = {
    A: { 1: 'teamA1', 2: 'teamA2', 3: 'teamA3' },
    C: { 1: 'teamC1', 2: 'teamC2' }, // no 3rd qualifier
    D: { 3: 'teamD3' },
    E: { 3: 'teamE3' },
  }

  it('resolves a simple source like "1A"', () => {
    expect(resolveGroupSource('1A', results)).toBe('teamA1')
    expect(resolveGroupSource('2A', results)).toBe('teamA2')
  })

  it('returns null when the simple source position is missing', () => {
    expect(resolveGroupSource('3C', results)).toBeNull()
  })

  it('resolves a composite "3C/D/E" to the first group that qualified at that position', () => {
    // C has no 3rd, D does -> teamD3
    expect(resolveGroupSource('3C/D/E', results)).toBe('teamD3')
  })

  it('returns null for a composite where no listed group qualified', () => {
    expect(resolveGroupSource('3C/F/G', results)).toBeNull()
  })

  it('returns null for an unrecognised format', () => {
    expect(resolveGroupSource('garbage', results)).toBeNull()
    expect(resolveGroupSource('', results)).toBeNull()
  })
})

describe('generateGroupPrediction', () => {
  const teams = ['t1', 't2', 't3', 't4']

  it('returns three distinct teams from the pool when includeThird=true', () => {
    for (let i = 0; i < 50; i++) {
      const p = generateGroupPrediction(teams, 'average', true)
      const picks = [p.predicted_1st, p.predicted_2nd, p.predicted_3rd]
      expect(new Set(picks).size).toBe(3) // no duplicates
      for (const pick of picks) expect(teams).toContain(pick)
    }
  })

  it('returns a null third when includeThird=false', () => {
    const p = generateGroupPrediction(teams, 'expert', false)
    expect(p.predicted_3rd).toBeNull()
    expect(p.predicted_1st).not.toBe(p.predicted_2nd)
  })
})

describe('generateKnockoutPrediction', () => {
  it('always returns one of the two supplied teams', () => {
    for (let i = 0; i < 50; i++) {
      const pick = generateKnockoutPrediction('home', 'away', 'wildcard')
      expect(['home', 'away']).toContain(pick)
    }
  })
})

describe('generateTiebreakerGoals', () => {
  it('stays within the archetype range', () => {
    const ranges: Record<string, [number, number]> = {
      expert: [100, 140],
      average: [80, 180],
      wildcard: [50, 250],
    }
    for (const [arch, [min, max]] of Object.entries(ranges)) {
      for (let i = 0; i < 100; i++) {
        const g = generateTiebreakerGoals(arch as any)
        expect(g).toBeGreaterThanOrEqual(min)
        expect(g).toBeLessThanOrEqual(max)
        expect(Number.isInteger(g)).toBe(true)
      }
    }
  })
})

describe('TEST_PLAYERS fixture', () => {
  it('has 10 players all under the test email domain with valid archetypes', () => {
    expect(TEST_PLAYERS).toHaveLength(10)
    for (const p of TEST_PLAYERS) {
      expect(p.email.endsWith(TEST_EMAIL_DOMAIN)).toBe(true)
      expect(['expert', 'average', 'wildcard']).toContain(p.archetype)
    }
    // unique emails
    expect(new Set(TEST_PLAYERS.map((p) => p.email)).size).toBe(10)
  })
})

describe('KNOCKOUT_ROUNDS_ORDER / getExistingKnockoutRounds', () => {
  it('lists the five rounds in bracket order', () => {
    expect(KNOCKOUT_ROUNDS_ORDER).toEqual([
      'round_of_32',
      'round_of_16',
      'quarter_final',
      'semi_final',
      'final',
    ])
  })

  it('returns only the present rounds, sorted into canonical order', async () => {
    current = makeFakeAdmin({
      knockout_matches: [
        { id: '1', tournament_id: 'T', round: 'final' },
        { id: '2', tournament_id: 'T', round: 'round_of_16' },
        { id: '3', tournament_id: 'T', round: 'quarter_final' },
        { id: '4', tournament_id: 'T', round: 'quarter_final' }, // duplicate round
      ],
    })
    const rounds = await getExistingKnockoutRounds(current, 'T')
    expect(rounds).toEqual(['round_of_16', 'quarter_final', 'final'])
  })

  it('returns an empty list when there are no matches', async () => {
    current = makeFakeAdmin({ knockout_matches: [] })
    const rounds = await getExistingKnockoutRounds(current, 'T')
    expect(rounds).toEqual([])
  })
})
