import { describe, it, expect, vi } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient, type Tables } from '../helpers/fake-supabase'

let current: FakeAdminClient
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => current,
}))

import { calculateAchievements } from '@/lib/achievements'

const T = 'tournament-1'

function install(seed: Tables): FakeAdminClient {
  current = makeFakeAdmin(seed)
  return current
}

function badgesFor(admin: FakeAdminClient, entryId: string): string[] {
  return (admin.tables.player_achievements ?? [])
    .filter((b) => b.entry_id === entryId)
    .map((b) => b.badge_type)
}
function allBadgeTypes(admin: FakeAdminClient): string[] {
  return (admin.tables.player_achievements ?? []).map((b) => b.badge_type)
}

describe('calculateAchievements — submission-time badges', () => {
  it('awards early_bird to the earliest submitter and last_minute to the latest', async () => {
    const admin = install({
      tournaments: [{ id: T, status: 'group_stage_open', group_stage_deadline: null }],
      tournament_entries: [
        { id: 'e1', tournament_id: T, tiebreaker_goals: null },
        { id: 'e2', tournament_id: T, tiebreaker_goals: null },
      ],
      groups: [{ id: 'g1', tournament_id: T, name: 'Group A', sort_order: 1 }],
      group_predictions: [
        { id: 'p1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C', submitted_at: '2026-01-01T00:00:00Z' },
        { id: 'p2', entry_id: 'e2', group_id: 'g1', predicted_1st: 'D', predicted_2nd: 'E', predicted_3rd: 'F', submitted_at: '2026-02-01T00:00:00Z' },
      ],
      group_results: [],
      knockout_matches: [],
    })

    await calculateAchievements(T)
    expect(badgesFor(admin, 'e1')).toContain('early_bird')
    expect(badgesFor(admin, 'e2')).toContain('last_minute')
  })
})

describe('calculateAchievements — group result badges', () => {
  const base = (): Tables => ({
    tournaments: [{ id: T, status: 'group_stage_closed', group_stage_deadline: null }],
    tournament_entries: [
      { id: 'e1', tournament_id: T, tiebreaker_goals: null },
      { id: 'e2', tournament_id: T, tiebreaker_goals: null },
    ],
    groups: [{ id: 'g1', tournament_id: T, name: 'Group A', sort_order: 1 }],
    group_results: [
      { id: 'r1', group_id: 'g1', team_id: 'A', final_position: 1, qualified: true },
      { id: 'r2', group_id: 'g1', team_id: 'B', final_position: 2, qualified: true },
      { id: 'r3', group_id: 'g1', team_id: 'C', final_position: 3, qualified: false },
    ],
    group_predictions: [
      // e1 nails every position -> perfect_group; A@1 and B@2 are unique correct -> lone_wolf
      { id: 'p1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C', submitted_at: '2026-01-01T00:00:00Z' },
      // e2 gets only C@3 right (same as e1, so not unique)
      { id: 'p2', entry_id: 'e2', group_id: 'g1', predicted_1st: 'B', predicted_2nd: 'A', predicted_3rd: 'C', submitted_at: '2026-02-01T00:00:00Z' },
    ],
    knockout_matches: [],
  })

  it('awards perfect_group when all predicted positions are exact', async () => {
    const admin = install(base())
    await calculateAchievements(T)
    expect(badgesFor(admin, 'e1')).toContain('perfect_group')
    expect(badgesFor(admin, 'e2')).not.toContain('perfect_group')
  })

  it('awards lone_wolf for a uniquely-correct position pick', async () => {
    const admin = install(base())
    await calculateAchievements(T)
    expect(badgesFor(admin, 'e1')).toContain('lone_wolf')
    // e2 shares its only correct pick (C@3) with e1, so no lone_wolf
    expect(badgesFor(admin, 'e2')).not.toContain('lone_wolf')
  })

  it('awards hive_mind to the player matching the most popular picks', async () => {
    const admin = install(base())
    await calculateAchievements(T)
    // Tie-break in the engine makes e1 the consensus leader (matches all 3 modes)
    expect(badgesFor(admin, 'e1')).toContain('hive_mind')
  })
})

describe('calculateAchievements — knockout badges', () => {
  it('awards crystal_ball for predicting the final winner and giant_killer for a sole correct pick', async () => {
    const admin = install({
      tournaments: [{ id: T, status: 'knockout_closed', group_stage_deadline: null }],
      tournament_entries: [
        { id: 'e1', tournament_id: T, tiebreaker_goals: null },
        { id: 'e2', tournament_id: T, tiebreaker_goals: null },
      ],
      groups: [{ id: 'g1', tournament_id: T, name: 'Group A', sort_order: 1 }],
      group_results: [],
      group_predictions: [
        { id: 'p1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C', submitted_at: '2026-01-01T00:00:00Z' },
      ],
      knockout_matches: [
        { id: 'mf', tournament_id: T, round: 'final', match_number: 10, sort_order: 10, winner_team_id: 'A', home_source: 'W8', away_source: 'W9' },
      ],
      knockout_predictions: [
        { id: 'k1', entry_id: 'e1', match_id: 'mf', predicted_winner_id: 'A' }, // correct
        { id: 'k2', entry_id: 'e2', match_id: 'mf', predicted_winner_id: 'B' }, // wrong
      ],
      golden_tickets: [],
    })

    await calculateAchievements(T)
    expect(badgesFor(admin, 'e1')).toContain('crystal_ball')
    expect(badgesFor(admin, 'e1')).toContain('giant_killer') // sole correct predictor of the final
    expect(badgesFor(admin, 'e2')).not.toContain('crystal_ball')
  })

  it('awards hot_streak for 5+ consecutive correct knockout picks', async () => {
    const matches = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      tournament_id: T,
      round: 'round_of_16',
      match_number: i + 1,
      sort_order: i + 1,
      winner_team_id: 'A',
      home_source: null,
      away_source: null,
    }))
    const preds = matches.map((m, i) => ({
      id: `k${i}`,
      entry_id: 'e1',
      match_id: m.id,
      predicted_winner_id: 'A', // all correct
    }))

    const admin = install({
      tournaments: [{ id: T, status: 'knockout_closed', group_stage_deadline: null }],
      tournament_entries: [{ id: 'e1', tournament_id: T, tiebreaker_goals: null }],
      groups: [{ id: 'g1', tournament_id: T, name: 'Group A', sort_order: 1 }],
      group_results: [],
      group_predictions: [
        { id: 'p1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C', submitted_at: '2026-01-01T00:00:00Z' },
      ],
      knockout_matches: matches,
      knockout_predictions: preds,
      golden_tickets: [],
    })

    await calculateAchievements(T)
    const e1 = (admin.tables.player_achievements ?? []).find(
      (b) => b.entry_id === 'e1' && b.badge_type === 'hot_streak'
    )
    expect(e1).toBeDefined()
    expect(e1!.description).toMatch(/5 consecutive/)
  })
})

describe('calculateAchievements — end-of-tournament badges', () => {
  const base = (): Tables => ({
    tournaments: [{ id: T, status: 'completed', group_stage_deadline: null }],
    tournament_entries: [
      { id: 'e1', tournament_id: T, tiebreaker_goals: 98 }, // diff 2 -> dead_heat
      { id: 'e2', tournament_id: T, tiebreaker_goals: 200 }, // diff 100 -> no
    ],
    groups: [{ id: 'g1', tournament_id: T, name: 'Group A', sort_order: 1 }],
    group_results: [],
    group_predictions: [
      { id: 'p1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C', submitted_at: '2026-01-01T00:00:00Z' },
      { id: 'p2', entry_id: 'e2', group_id: 'g1', predicted_1st: 'D', predicted_2nd: 'E', predicted_3rd: 'F', submitted_at: '2026-02-01T00:00:00Z' },
    ],
    knockout_matches: [],
    tournament_stats: [{ id: 's1', tournament_id: T, total_group_stage_goals: 100 }],
  })

  it('awards dead_heat only to entries within 5 goals of the actual total', async () => {
    const admin = install(base())
    await calculateAchievements(T)
    expect(badgesFor(admin, 'e1')).toContain('dead_heat')
    expect(badgesFor(admin, 'e2')).not.toContain('dead_heat')
  })

  it('awards contrarian to the player with the fewest prediction overlaps', async () => {
    const admin = install(base())
    await calculateAchievements(T)
    expect(allBadgeTypes(admin)).toContain('contrarian')
  })
})

describe('calculateAchievements — idempotency', () => {
  it('does not duplicate badges when run multiple times', async () => {
    const seed: Tables = {
      tournaments: [{ id: T, status: 'group_stage_closed', group_stage_deadline: null }],
      tournament_entries: [{ id: 'e1', tournament_id: T, tiebreaker_goals: null }],
      groups: [{ id: 'g1', tournament_id: T, name: 'Group A', sort_order: 1 }],
      group_results: [
        { id: 'r1', group_id: 'g1', team_id: 'A', final_position: 1, qualified: true },
        { id: 'r2', group_id: 'g1', team_id: 'B', final_position: 2, qualified: true },
      ],
      group_predictions: [
        { id: 'p1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: null, submitted_at: '2026-01-01T00:00:00Z' },
      ],
      knockout_matches: [],
    }
    const admin = install(seed)
    await calculateAchievements(T)
    const firstCount = (admin.tables.player_achievements ?? []).length
    expect(firstCount).toBeGreaterThan(0)
    await calculateAchievements(T)
    const secondCount = (admin.tables.player_achievements ?? []).length
    expect(secondCount).toBe(firstCount)
  })
})
