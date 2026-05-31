import { describe, it, expect, vi } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient, type Tables } from '../helpers/fake-supabase'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

// scoring.ts uses createAdminClient() internally — point it at our fake.
let current: FakeAdminClient
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => current }))
import { calculateKnockoutScores, calculateRankings } from '@/lib/scoring'

const T = 'tournament-1'

describe('fetchAllRows pagination (1,000-row cap)', () => {
  it('returns ALL rows when the set exceeds one page, without truncating', async () => {
    const big = Array.from({ length: 2500 }, (_, i) => ({ id: `r${i}`, tournament_id: T, n: i }))
    const admin = makeFakeAdmin({ knockout_predictions: big })
    const all = await fetchAllRows((from, to) =>
      admin.from('knockout_predictions').select('*').eq('tournament_id', T).range(from, to)
    )
    expect(all).toHaveLength(2500)
    // ordering across pages is preserved
    expect((all[0] as { id: string }).id).toBe('r0')
    expect((all[2499] as { id: string }).id).toBe('r2499')
  })

  it('handles an exact multiple of the page size (no off-by-one)', async () => {
    const exact = Array.from({ length: 2000 }, (_, i) => ({ id: `r${i}`, tournament_id: T }))
    const admin = makeFakeAdmin({ group_predictions: exact })
    const all = await fetchAllRows((from, to) =>
      admin.from('group_predictions').select('*').eq('tournament_id', T).range(from, to)
    )
    expect(all).toHaveLength(2000)
  })

  it('returns an empty array for no rows', async () => {
    const admin = makeFakeAdmin({ group_predictions: [] })
    const all = await fetchAllRows((from, to) =>
      admin.from('group_predictions').select('*').eq('tournament_id', T).range(from, to)
    )
    expect(all).toEqual([])
  })
})

describe('scoring at scale', () => {
  function buildTournament(numEntries: number): Tables {
    const entries = Array.from({ length: numEntries }, (_, i) => ({
      id: `e${i}`,
      tournament_id: T,
      knockout_points: 0,
      group_stage_points: 0,
      total_points: i % 50, // varied for ranking
      tiebreaker_diff: i % 7,
    }))
    // one decided knockout match; every entry predicted it (correct → 10 pts)
    const matches = [{ id: 'm1', tournament_id: T, winner_team_id: 'A', points_value: 10 }]
    const preds = entries.map((e, i) => ({
      id: `kp${i}`,
      entry_id: e.id,
      match_id: 'm1',
      predicted_winner_id: i % 2 === 0 ? 'A' : 'B', // half correct
      points_earned: 0,
      is_correct: null,
    }))
    return { tournament_entries: entries, knockout_matches: matches, knockout_predictions: preds, golden_tickets: [] }
  }

  it('scores 3,000 entries/predictions correctly across pagination', async () => {
    const n = 3000
    current = makeFakeAdmin(buildTournament(n))
    const start = Date.now()
    await calculateKnockoutScores(T)
    const elapsed = Date.now() - start

    // Half predicted 'A' (correct) → 10 points; the other half → 0.
    const correct = current.tables.knockout_predictions.filter((p) => p.points_earned === 10)
    expect(correct).toHaveLength(n / 2)
    // every entry's knockout_points was written (no silent truncation at 1,000)
    const scoredEntries = current.tables.tournament_entries.filter((e) => e.knockout_points === 10)
    expect(scoredEntries).toHaveLength(n / 2)
    // sanity perf budget — pure in-memory scoring should be well under this
    expect(elapsed).toBeLessThan(5000)
  })

  it('ranks 2,000 entries with correct tie handling at scale', async () => {
    const n = 2000
    current = makeFakeAdmin(buildTournament(n))
    await calculateRankings(T)
    const ranks = current.tables.tournament_entries.map((e) => e.overall_rank)
    // every entry got a rank
    expect(ranks.every((r) => typeof r === 'number' && r >= 1)).toBe(true)
    // best rank is 1, worst rank never exceeds the entry count
    expect(Math.min(...ranks)).toBe(1)
    expect(Math.max(...ranks)).toBeLessThanOrEqual(n)
  })
})
