import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'

// Drive the REAL admin simulation route; only auth is stubbed. testHarnessGuard
// allows this because NODE_ENV under vitest is 'test' (not 'production').
vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({
    id: 'admin-e2e',
    display_name: 'Admin',
    nickname: 'Admin',
    email: 'admin@local',
    app_metadata: { role: 'admin' },
  }),
}))
vi.mock('@/lib/email/audit', () => ({ scheduleAuditEmail: vi.fn(), sendAuditEmail: vi.fn() }))
vi.mock('@/lib/email/user', () => ({ scheduleUserEmail: vi.fn() }))

import { POST as timeMachine } from '@/app/api/admin/tournaments/[slug]/time-machine/route'

const SLUG = 'wc-2026-test'
const ADMIN_EMAIL = 'admin@test.predictor.local'
const POINTS_BY_ROUND: Record<string, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarter_final: 4,
  semi_final: 8,
  final: 16,
}

function req(body: unknown): Request {
  return new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const params = { params: Promise.resolve({ slug: SLUG }) }

type Admin = ReturnType<typeof createAdminClient>

async function tournamentId(admin: Admin): Promise<string> {
  const { data } = await admin.from('tournaments').select('id, slug').eq('slug', SLUG).single()
  if (!data) throw new Error(`Tournament ${SLUG} not found`)
  // SAFETY: this suite must only ever touch the test tournament.
  expect(data.slug).toBe(SLUG)
  return data.id
}

interface ScoreReport {
  decidedByRound: Record<string, { decided: number; total: number }>
  entryCount: number
  ticketsPlayed: number
  adminPlayedSub: boolean
  totalKnockoutGoals: number
  standings: { name: string; group: number; ko: number; total: number; rank: number | null }[]
}

/** Re-derive every score from raw data and assert it matches what scoring stored. */
async function validateScoring(admin: Admin, tid: string): Promise<ScoreReport> {
  const { data: matches } = await admin
    .from('knockout_matches')
    .select('id, round, points_value, winner_team_id, home_score, away_score')
    .eq('tournament_id', tid)
  expect(matches && matches.length).toBeGreaterThan(0)

  const matchById = new Map(matches!.map((m) => [m.id, m]))

  // 1) Point values double each round exactly as specified.
  for (const m of matches!) {
    expect(m.points_value, `points_value for ${m.round}`).toBe(POINTS_BY_ROUND[m.round])
  }

  // Decided counts per round
  const decidedByRound: Record<string, { decided: number; total: number }> = {}
  let totalKnockoutGoals = 0
  for (const m of matches!) {
    const r = (decidedByRound[m.round] ??= { decided: 0, total: 0 })
    r.total++
    if (m.winner_team_id) r.decided++
    if (m.home_score !== null && m.away_score !== null) {
      totalKnockoutGoals += (m.home_score ?? 0) + (m.away_score ?? 0)
    }
  }

  const { data: entries } = await admin
    .from('tournament_entries')
    .select(
      'id, knockout_points, group_stage_points, total_points, overall_rank, knockout_tiebreaker_goals, knockout_tiebreaker_diff, player:players!tournament_entries_player_id_fkey ( email, display_name, nickname )'
    )
    .eq('tournament_id', tid)
  const entryIds = (entries ?? []).map((e) => e.id)

  const { data: preds } = await admin
    .from('knockout_predictions')
    .select('entry_id, match_id, predicted_winner_id')
    .in('entry_id', entryIds)
  const predsByEntry = new Map<string, { match_id: string; predicted_winner_id: string | null }[]>()
  for (const p of preds ?? []) {
    const arr = predsByEntry.get(p.entry_id) ?? []
    arr.push(p)
    predsByEntry.set(p.entry_id, arr)
  }

  const { data: tickets } = await admin
    .from('golden_tickets')
    .select('entry_id, original_match_id')
    .eq('tournament_id', tid)
  const ticketSet = new Set((tickets ?? []).map((t) => `${t.entry_id}:${t.original_match_id}`))
  const ticketEntrySet = new Set((tickets ?? []).map((t) => t.entry_id))

  let adminPlayedSub = false
  const standings: ScoreReport['standings'] = []

  for (const e of entries ?? []) {
    // 2) Re-derive knockout points: points_value for a correct pick, −6 on the
    //    Emergency Sub match itself, 0 otherwise.
    let expected = 0
    for (const p of predsByEntry.get(e.id) ?? []) {
      const m = matchById.get(p.match_id)
      if (!m || !m.winner_team_id) continue
      if (ticketSet.has(`${e.id}:${p.match_id}`)) expected += -6
      else if (p.predicted_winner_id === m.winner_team_id) expected += m.points_value
    }
    expect(e.knockout_points, `knockout_points for entry ${e.id}`).toBe(expected)

    // 3) total = group + knockout
    expect(e.total_points).toBe(e.group_stage_points + e.knockout_points)

    // 4) Knockout goal-total tiebreaker diff
    if (e.knockout_tiebreaker_goals !== null) {
      expect(e.knockout_tiebreaker_diff).toBe(Math.abs(e.knockout_tiebreaker_goals - totalKnockoutGoals))
    }

    const player = e.player as unknown as { email: string; display_name: string; nickname: string | null } | null
    if (player?.email === ADMIN_EMAIL && ticketEntrySet.has(e.id)) adminPlayedSub = true
    standings.push({
      name: player?.nickname ?? player?.display_name ?? '?',
      group: e.group_stage_points,
      ko: e.knockout_points,
      total: e.total_points,
      rank: e.overall_rank,
    })
  }

  standings.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))

  return {
    decidedByRound,
    entryCount: entries?.length ?? 0,
    ticketsPlayed: tickets?.length ?? 0,
    adminPlayedSub,
    totalKnockoutGoals,
    standings,
  }
}

describe('Knockout Stage — live E2E on wc-2026-test', () => {
  let admin: Admin
  let tid: string

  beforeAll(async () => {
    admin = createAdminClient()
    tid = await tournamentId(admin)
  })

  it('after Round of 32: 1 point per correct winner, Emergency Subs offered', async () => {
    const res = await timeMachine(req({ phase: 'after_round_of_32', confirm: true }), params)
    expect(res.status, await res.text().catch(() => '')).toBe(200)

    const report = await validateScoring(admin, tid)
    expect(report.entryCount).toBe(10)
    expect(report.decidedByRound.round_of_32).toEqual({ decided: 16, total: 16 })
    // Later rounds not yet played
    expect(report.decidedByRound.round_of_16?.decided ?? 0).toBe(0)
    console.log('[R32] standings:', JSON.stringify(report.standings, null, 2))
    console.log('[R32] subs played:', report.ticketsPlayed)
  })

  it('full tournament to completion: scoring + tiebreaker + Emergency Subs all correct', async () => {
    const res = await timeMachine(req({ phase: 'completed', confirm: true }), params)
    expect(res.status, await res.text().catch(() => '')).toBe(200)

    const report = await validateScoring(admin, tid)

    // Every knockout round fully decided
    expect(report.decidedByRound.round_of_32).toEqual({ decided: 16, total: 16 })
    expect(report.decidedByRound.round_of_16).toEqual({ decided: 8, total: 8 })
    expect(report.decidedByRound.quarter_final).toEqual({ decided: 4, total: 4 })
    expect(report.decidedByRound.semi_final).toEqual({ decided: 2, total: 2 })
    expect(report.decidedByRound.final).toEqual({ decided: 1, total: 1 })

    expect(report.entryCount).toBe(10)
    // The admin reliably plays their Emergency Sub at some point
    expect(report.adminPlayedSub).toBe(true)
    // At least one sub played overall (validates the AI sub flow end-to-end)
    expect(report.ticketsPlayed).toBeGreaterThanOrEqual(1)
    // Not everyone is forced to play (some "consider" and decline)
    expect(report.ticketsPlayed).toBeLessThanOrEqual(10)

    console.log('[FINAL] total knockout goals:', report.totalKnockoutGoals)
    console.log('[FINAL] subs played:', report.ticketsPlayed, '| admin played:', report.adminPlayedSub)
    console.log('[FINAL] standings:', JSON.stringify(report.standings, null, 2))
  })
})
