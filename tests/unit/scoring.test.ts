import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient, type Tables } from '../helpers/fake-supabase'

// The scoring module calls createAdminClient() internally with no args, so we
// mock the module to return our in-memory fake. A module-level `current` lets
// each test install its own seeded client.
let current: FakeAdminClient
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => current,
}))

import {
  calculateGroupStageScores,
  calculateKnockoutScores,
  calculateTiebreakers,
  calculateTotalKnockoutGoals,
  calculateRankings,
} from '@/lib/scoring'

function install(seed: Tables): FakeAdminClient {
  current = makeFakeAdmin(seed)
  return current
}

const T = 'tournament-1'

describe('calculateGroupStageScores', () => {
  it('awards +1 for a qualified team and +1 bonus for an exact position', () => {
    // Group with teams A (1st, qualified), B (2nd, qualified), C (3rd, not qualified)
    const admin = install({
      tournament_entries: [{ id: 'e1', tournament_id: T, group_stage_points: 0 }],
      groups: [{ id: 'g1', tournament_id: T }],
      group_results: [
        { id: 'r1', group_id: 'g1', team_id: 'A', final_position: 1, qualified: true },
        { id: 'r2', group_id: 'g1', team_id: 'B', final_position: 2, qualified: true },
        { id: 'r3', group_id: 'g1', team_id: 'C', final_position: 3, qualified: false },
      ],
      group_predictions: [
        // Predict A 1st (exact -> 2), B 2nd (exact -> 2), C 3rd (not qualified -> 0)
        {
          id: 'p1',
          entry_id: 'e1',
          group_id: 'g1',
          predicted_1st: 'A',
          predicted_2nd: 'B',
          predicted_3rd: 'C',
          points_earned: 0,
        },
      ],
    })

    return calculateGroupStageScores(T).then(() => {
      const pred = admin.tables.group_predictions[0]
      expect(pred.points_earned).toBe(4) // 2 + 2 + 0
      expect(admin.tables.tournament_entries[0].group_stage_points).toBe(4)
    })
  })

  it('awards +1 (no bonus) when a team qualifies but in the wrong position', () => {
    const admin = install({
      tournament_entries: [{ id: 'e1', tournament_id: T, group_stage_points: 0 }],
      groups: [{ id: 'g1', tournament_id: T }],
      group_results: [
        { id: 'r1', group_id: 'g1', team_id: 'A', final_position: 2, qualified: true },
        { id: 'r2', group_id: 'g1', team_id: 'B', final_position: 1, qualified: true },
      ],
      group_predictions: [
        {
          id: 'p1',
          entry_id: 'e1',
          group_id: 'g1',
          predicted_1st: 'A', // A actually came 2nd but qualified -> +1
          predicted_2nd: 'B', // B actually came 1st but qualified -> +1
          predicted_3rd: null,
          points_earned: 0,
        },
      ],
    })

    return calculateGroupStageScores(T).then(() => {
      expect(admin.tables.group_predictions[0].points_earned).toBe(2)
      expect(admin.tables.tournament_entries[0].group_stage_points).toBe(2)
    })
  })

  it('ignores null prediction slots and unknown teams', async () => {
    const admin = install({
      tournament_entries: [{ id: 'e1', tournament_id: T, group_stage_points: 0 }],
      groups: [{ id: 'g1', tournament_id: T }],
      group_results: [
        { id: 'r1', group_id: 'g1', team_id: 'A', final_position: 1, qualified: true },
      ],
      group_predictions: [
        {
          id: 'p1',
          entry_id: 'e1',
          group_id: 'g1',
          predicted_1st: 'A', // exact -> 2
          predicted_2nd: 'ZZ', // unknown team -> 0
          predicted_3rd: null, // null -> skipped
          points_earned: 0,
        },
      ],
    })
    await calculateGroupStageScores(T)
    expect(admin.tables.group_predictions[0].points_earned).toBe(2)
  })

  it('is a no-op when there are no entries', async () => {
    const admin = install({ tournament_entries: [], groups: [], group_results: [], group_predictions: [] })
    await expect(calculateGroupStageScores(T)).resolves.toBeUndefined()
    expect(admin.tables.group_predictions.length).toBe(0)
  })
})

describe('calculateKnockoutScores', () => {
  it('awards the match points_value only for a correct pick', async () => {
    const admin = install({
      tournament_entries: [{ id: 'e1', tournament_id: T, knockout_points: 0 }],
      knockout_matches: [
        { id: 'm1', tournament_id: T, winner_team_id: 'A', points_value: 5 },
        { id: 'm2', tournament_id: T, winner_team_id: 'B', points_value: 10 },
      ],
      knockout_predictions: [
        { id: 'kp1', entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'A', points_earned: 0, is_correct: null },
        { id: 'kp2', entry_id: 'e1', match_id: 'm2', predicted_winner_id: 'X', points_earned: 0, is_correct: null },
      ],
      golden_tickets: [],
    })

    await calculateKnockoutScores(T)
    const kp1 = admin.tables.knockout_predictions.find((p) => p.id === 'kp1')!
    const kp2 = admin.tables.knockout_predictions.find((p) => p.id === 'kp2')!
    expect(kp1).toMatchObject({ is_correct: true, points_earned: 5 })
    expect(kp2).toMatchObject({ is_correct: false, points_earned: 0 })
    expect(admin.tables.tournament_entries[0].knockout_points).toBe(5)
  })

  it('applies the Emergency Sub (golden ticket) -6 penalty on the ticket match, even when "correct"', async () => {
    // Behaviour changed in origin/main: the Emergency Sub match now carries a
    // -6 point penalty (previously it scored 0). subsequent rounds score normally.
    const admin = install({
      tournament_entries: [{ id: 'e1', tournament_id: T, knockout_points: 0 }],
      knockout_matches: [{ id: 'm1', tournament_id: T, winner_team_id: 'A', points_value: 5 }],
      knockout_predictions: [
        { id: 'kp1', entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'A', points_earned: 0, is_correct: null },
      ],
      // The golden ticket / Emergency Sub was played ON match m1 for entry e1
      golden_tickets: [{ entry_id: 'e1', tournament_id: T, original_match_id: 'm1' }],
    })

    await calculateKnockoutScores(T)
    const kp1 = admin.tables.knockout_predictions[0]
    // is_correct still reflects the pick, but points are forced to the -6 penalty
    expect(kp1.is_correct).toBe(true)
    expect(kp1.points_earned).toBe(-6)
    expect(admin.tables.tournament_entries[0].knockout_points).toBe(-6)
  })

  it('skips matches that are not yet decided', async () => {
    const admin = install({
      tournament_entries: [{ id: 'e1', tournament_id: T, knockout_points: 0 }],
      knockout_matches: [{ id: 'm1', tournament_id: T, winner_team_id: null, points_value: 5 }],
      knockout_predictions: [
        { id: 'kp1', entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'A', points_earned: 0, is_correct: null },
      ],
      golden_tickets: [],
    })
    await calculateKnockoutScores(T)
    // Untouched
    expect(admin.tables.knockout_predictions[0].is_correct).toBeNull()
    expect(admin.tables.knockout_predictions[0].points_earned).toBe(0)
  })
})

describe('calculateTiebreakers', () => {
  it('sets tiebreaker_diff = |predicted - actual|', async () => {
    const admin = install({
      tournament_stats: [{ id: 's1', tournament_id: T, total_group_stage_goals: 100 }],
      tournament_entries: [
        { id: 'e1', tournament_id: T, tiebreaker_goals: 90, tiebreaker_diff: null },
        { id: 'e2', tournament_id: T, tiebreaker_goals: 130, tiebreaker_diff: null },
        { id: 'e3', tournament_id: T, tiebreaker_goals: null, tiebreaker_diff: null },
      ],
    })
    await calculateTiebreakers(T)
    const byId = Object.fromEntries(admin.tables.tournament_entries.map((e) => [e.id, e.tiebreaker_diff]))
    expect(byId.e1).toBe(10)
    expect(byId.e2).toBe(30)
    expect(byId.e3).toBeNull() // null prediction stays null
  })

  it('is a no-op when actual goals are unknown', async () => {
    const admin = install({
      tournament_stats: [{ id: 's1', tournament_id: T, total_group_stage_goals: null }],
      tournament_entries: [{ id: 'e1', tournament_id: T, tiebreaker_goals: 90, tiebreaker_diff: 999 }],
      knockout_matches: [],
    })
    await calculateTiebreakers(T)
    expect(admin.tables.tournament_entries[0].tiebreaker_diff).toBe(999) // untouched
  })

  it('also sets knockout_tiebreaker_diff against summed knockout goals', async () => {
    const admin = install({
      tournament_stats: [{ id: 's1', tournament_id: T, total_group_stage_goals: 100, total_knockout_goals: null }],
      knockout_matches: [
        { id: 'm1', tournament_id: T, home_score: 2, away_score: 1 },
        { id: 'm2', tournament_id: T, home_score: 0, away_score: 0 },
        { id: 'm3', tournament_id: T, home_score: null, away_score: null }, // unplayed -> ignored
      ],
      tournament_entries: [
        { id: 'e1', tournament_id: T, tiebreaker_goals: 90, knockout_tiebreaker_goals: 5, tiebreaker_diff: null, knockout_tiebreaker_diff: null },
        { id: 'e2', tournament_id: T, tiebreaker_goals: 110, knockout_tiebreaker_goals: null, tiebreaker_diff: null, knockout_tiebreaker_diff: null },
      ],
    })
    await calculateTiebreakers(T)
    const byId = Object.fromEntries(admin.tables.tournament_entries.map((e) => [e.id, e]))
    // Actual knockout goals = 2+1+0+0 = 3, persisted to stats
    expect(admin.tables.tournament_stats[0].total_knockout_goals).toBe(3)
    expect(byId.e1.knockout_tiebreaker_diff).toBe(2) // |5 - 3|
    expect(byId.e1.tiebreaker_diff).toBe(10) // |90 - 100|
    expect(byId.e2.knockout_tiebreaker_diff).toBeNull() // null guess stays null
  })
})

describe('calculateTotalKnockoutGoals', () => {
  it('sums scored knockout fixtures and returns null when none are scored', async () => {
    const admin = install({
      tournament_stats: [{ id: 's1', tournament_id: T, total_knockout_goals: null }],
      knockout_matches: [
        { id: 'm1', tournament_id: T, home_score: 3, away_score: 2 },
        { id: 'm2', tournament_id: T, home_score: null, away_score: null },
      ],
    })
    const total = await calculateTotalKnockoutGoals(T)
    expect(total).toBe(5)
    expect(admin.tables.tournament_stats[0].total_knockout_goals).toBe(5)

    const empty = install({ tournament_stats: [], knockout_matches: [] })
    expect(await calculateTotalKnockoutGoals(T)).toBeNull()
    expect(empty.tables.tournament_stats.length).toBe(0)
  })
})

describe('calculateRankings', () => {
  beforeEach(() => {
    // deterministic
  })

  it('ranks by total_points desc, then tiebreaker_diff asc (nulls last), then knockout desc', async () => {
    const admin = install({
      tournament_entries: [
        { id: 'a', tournament_id: T, total_points: 20, knockout_points: 10, group_stage_points: 10, tiebreaker_diff: 5 },
        { id: 'b', tournament_id: T, total_points: 20, knockout_points: 10, group_stage_points: 10, tiebreaker_diff: 2 },
        { id: 'c', tournament_id: T, total_points: 30, knockout_points: 15, group_stage_points: 15, tiebreaker_diff: null },
        { id: 'd', tournament_id: T, total_points: 10, knockout_points: 0, group_stage_points: 10, tiebreaker_diff: null },
      ],
    })
    await calculateRankings(T)
    const rank = Object.fromEntries(admin.tables.tournament_entries.map((e) => [e.id, e.overall_rank]))
    // c (30) first; then b and a tie on 20 -> b has smaller diff (2 < 5) so b=2, a=3; d last=4
    expect(rank.c).toBe(1)
    expect(rank.b).toBe(2)
    expect(rank.a).toBe(3)
    expect(rank.d).toBe(4)
  })

  it('assigns equal ranks to fully-tied entries and skips the next rank', async () => {
    const admin = install({
      tournament_entries: [
        { id: 'a', tournament_id: T, total_points: 20, knockout_points: 10, group_stage_points: 10, tiebreaker_diff: 5 },
        { id: 'b', tournament_id: T, total_points: 20, knockout_points: 10, group_stage_points: 10, tiebreaker_diff: 5 },
        { id: 'c', tournament_id: T, total_points: 5, knockout_points: 0, group_stage_points: 5, tiebreaker_diff: 1 },
      ],
    })
    await calculateRankings(T)
    const rank = Object.fromEntries(admin.tables.tournament_entries.map((e) => [e.id, e.overall_rank]))
    // a and b identical on every criterion -> both rank 1, c -> rank 3
    expect(rank.a).toBe(1)
    expect(rank.b).toBe(1)
    expect(rank.c).toBe(3)
  })

  it('breaks an otherwise-exact tie by knockout_tiebreaker_diff (asc)', async () => {
    const admin = install({
      tournament_entries: [
        { id: 'a', tournament_id: T, total_points: 20, knockout_points: 10, group_stage_points: 10, tiebreaker_diff: 5, knockout_tiebreaker_diff: 8 },
        { id: 'b', tournament_id: T, total_points: 20, knockout_points: 10, group_stage_points: 10, tiebreaker_diff: 5, knockout_tiebreaker_diff: 3 },
      ],
    })
    await calculateRankings(T)
    const rank = Object.fromEntries(admin.tables.tournament_entries.map((e) => [e.id, e.overall_rank]))
    expect(rank.b).toBe(1) // smaller knockout tiebreaker diff wins
    expect(rank.a).toBe(2)
  })

  it('computes a separate group_stage_rank by group_stage_points', async () => {
    const admin = install({
      tournament_entries: [
        { id: 'a', tournament_id: T, total_points: 5, knockout_points: 5, group_stage_points: 0, tiebreaker_diff: 1 },
        { id: 'b', tournament_id: T, total_points: 3, knockout_points: 0, group_stage_points: 3, tiebreaker_diff: 2 },
      ],
    })
    await calculateRankings(T)
    const e = Object.fromEntries(admin.tables.tournament_entries.map((x) => [x.id, x]))
    // Overall: a (5) > b (3)
    expect(e.a.overall_rank).toBe(1)
    expect(e.b.overall_rank).toBe(2)
    // Group stage: b (3) > a (0)
    expect(e.b.group_stage_rank).toBe(1)
    expect(e.a.group_stage_rank).toBe(2)
  })
})
