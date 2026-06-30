import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getEliminationRoundByTeam,
  roundIndexOf,
  resolveParticipantIds,
  predictionsToRecord,
  type BracketMatchLike,
} from '@/lib/bracket'
import type { KnockoutMatchWithTeams } from '@/lib/types'

// ===========================================================================
// Live E2E for Tom's "Some minor tweaks" (29 Jun 2026). Drives the REAL
// time-machine on the wc-2026-test sandbox and re-derives, from raw DB data,
// the exact invariants the three UI changes depend on:
//
//   #1 Leaderboard TB column shows the KNOCKOUT goal-total tiebreaker
//      -> entries carry knockout_tiebreaker_goals/_diff, the diff is correct,
//         and the tournament_leaderboard VIEW (what the page reads) exposes
//         the knockout columns unmasked once the window has closed.
//
//   #2 Flipped knockout grid collapses COMPLETED rounds to points totals
//      -> round-completeness is detectable (all winners present), and each
//         player's per-round point totals sum to their knockout_points (the
//         aggregation the matrix renders).
//
//   #3 Bracket greys + strikes a predicted team that's really OUT but still
//      appears LATER in the player's bracket
//      -> getEliminationRoundByTeam (the real helper) maps every loser to its
//         round depth, and at least one seeded player has a "dead-and-later"
//         slot, proving the styling condition fires on real data.
//
// Only auth/email are stubbed. Run explicitly:
//   npx vitest run --config vitest.e2e.config.ts
// ===========================================================================

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
const ALL_ROUNDS = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final'] as const

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

async function status(admin: Admin): Promise<string> {
  const { data } = await admin.from('tournaments').select('status').eq('slug', SLUG).single()
  return data!.status as string
}

interface KoRow {
  id: string
  round: string
  match_number: number
  home_team_id: string | null
  away_team_id: string | null
  home_source: string | null
  away_source: string | null
  winner_team_id: string | null
  home_score: number | null
  away_score: number | null
}

async function knockoutMatches(admin: Admin, tid: string): Promise<KoRow[]> {
  const { data } = await admin
    .from('knockout_matches')
    .select('id, round, match_number, home_team_id, away_team_id, home_source, away_source, winner_team_id, home_score, away_score')
    .eq('tournament_id', tid)
    .order('sort_order')
  return (data ?? []) as KoRow[]
}

function decidedByRound(matches: KoRow[]): Record<string, { decided: number; total: number }> {
  const out: Record<string, { decided: number; total: number }> = {}
  for (const m of matches) {
    const r = (out[m.round] ??= { decided: 0, total: 0 })
    r.total++
    if (m.winner_team_id) r.decided++
  }
  return out
}

function totalKnockoutGoals(matches: KoRow[]): number {
  return matches.reduce((sum, m) => sum + (m.home_score ?? 0) + (m.away_score ?? 0), 0)
}

async function entriesWithPreds(admin: Admin, tid: string) {
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, knockout_points, knockout_tiebreaker_goals, knockout_tiebreaker_diff')
    .eq('tournament_id', tid)
  const entryIds = (entries ?? []).map((e) => e.id)
  const { data: preds } = await admin
    .from('knockout_predictions')
    .select('entry_id, match_id, predicted_winner_id, points_earned')
    .in('entry_id', entryIds)
  return { entries: entries ?? [], preds: preds ?? [] }
}

/** Count, across all seeded players, predicted slots that are "dead-and-later":
 *  a resolved participant is a team really eliminated BEFORE this slot's round. */
function deadAndLaterSlotCount(
  matches: KoRow[],
  predsByEntry: Map<string, { match_id: string; predicted_winner_id: string | null }[]>
): number {
  const elim = getEliminationRoundByTeam(matches as unknown as KnockoutMatchWithTeams[])
  // Mirror the component: keep R32 real slots, null the downstream actuals so the
  // bracket resolves from each player's OWN picks.
  const basis: BracketMatchLike[] = matches.map((m) => ({
    id: m.id,
    match_number: m.match_number,
    home_team_id: m.round === 'round_of_32' ? m.home_team_id : null,
    away_team_id: m.round === 'round_of_32' ? m.away_team_id : null,
    home_source: m.home_source,
    away_source: m.away_source,
  }))
  const roundById = new Map(matches.map((m) => [m.id, m.round]))

  let count = 0
  for (const [, preds] of predsByEntry) {
    const { participants } = resolveParticipantIds(basis, predictionsToRecord(preds))
    for (const m of matches) {
      const depth = roundIndexOf(roundById.get(m.id)!)
      const p = participants.get(m.id)
      for (const teamId of [p?.homeTeamId, p?.awayTeamId]) {
        if (!teamId) continue
        const exit = elim.get(teamId)
        if (exit != null && depth > exit) count++
      }
    }
  }
  return count
}

describe("Tom's tweaks — live E2E on wc-2026-test", () => {
  let admin: Admin
  let tid: string

  beforeAll(async () => {
    admin = createAdminClient()
    tid = await tournamentId(admin)
  })

  // -------------------------------------------------------------------------
  // PARTIAL state (after R32): the most interesting one — R32 collapsible,
  // R16+ still in progress, and lots of R32 losers stranded in later picks.
  // -------------------------------------------------------------------------
  it('after_round_of_32: KO tiebreaker, round-collapse data, and dead-and-later slots', async () => {
    const res = await timeMachine(req({ phase: 'after_round_of_32', confirm: true }), params)
    expect(res.status, await res.text().catch(() => '')).toBe(200)

    const st = await status(admin)
    expect(st).toBe('knockout_closed') // -> leaderboard showKnockoutTiebreaker === true

    const matches = await knockoutMatches(admin, tid)
    const decided = decidedByRound(matches)

    // --- #2: round-completeness drives the collapse. R32 complete; R16+ not. ---
    expect(decided.round_of_32, 'R32 fully decided -> collapsible').toEqual({ decided: 16, total: 16 })
    expect(decided.round_of_16?.decided ?? 0, 'R16 still open -> not collapsible').toBe(0)
    const r32Complete = matches.filter((m) => m.round === 'round_of_32').every((m) => m.winner_team_id != null)
    const r16Complete = matches.filter((m) => m.round === 'round_of_16').every((m) => m.winner_team_id != null)
    expect(r32Complete).toBe(true)
    expect(r16Complete).toBe(false)

    const { entries, preds } = await entriesWithPreds(admin, tid)
    expect(entries.length).toBe(10)

    // --- #2: per-player R32 points sum to a slice of knockout_points (matrix totals). ---
    const r32MatchIds = new Set(matches.filter((m) => m.round === 'round_of_32').map((m) => m.id))
    const predsByEntry = new Map<string, { match_id: string; predicted_winner_id: string | null; points_earned: number }[]>()
    for (const p of preds) {
      const arr = predsByEntry.get(p.entry_id) ?? []
      arr.push(p)
      predsByEntry.set(p.entry_id, arr)
    }
    for (const e of entries) {
      const mine = predsByEntry.get(e.id) ?? []
      const r32Pts = mine.filter((p) => r32MatchIds.has(p.match_id)).reduce((s, p) => s + p.points_earned, 0)
      const allPts = mine.reduce((s, p) => s + p.points_earned, 0)
      // Only R32 is decided, so the R32 round total IS the whole knockout total here.
      expect(r32Pts).toBe(allPts)
      expect(allPts).toBe(e.knockout_points)
    }

    // --- #1: knockout tiebreaker populated + diff correct + exposed by the view. ---
    const actualKoGoals = totalKnockoutGoals(matches)
    for (const e of entries) {
      if (e.knockout_tiebreaker_goals !== null) {
        expect(e.knockout_tiebreaker_diff).toBe(Math.abs(e.knockout_tiebreaker_goals - actualKoGoals))
      }
    }
    const { data: viewRows } = await admin
      .from('tournament_leaderboard')
      .select('entry_id, knockout_tiebreaker_goals, knockout_tiebreaker_diff, tournament_status')
      .eq('tournament_id', tid)
    expect(viewRows && viewRows.length).toBe(10)
    expect(viewRows!.every((r) => r.tournament_status === 'knockout_closed')).toBe(true)
    // Unmasked once closed: at least one player's knockout guess is visible.
    expect(viewRows!.some((r) => r.knockout_tiebreaker_goals !== null)).toBe(true)

    // --- #3: real losers map to their exit depth, and dead-and-later slots exist. ---
    const elim = getEliminationRoundByTeam(matches as unknown as KnockoutMatchWithTeams[])
    const r32Losers = matches
      .filter((m) => m.round === 'round_of_32' && m.winner_team_id)
      .map((m) => (m.home_team_id === m.winner_team_id ? m.away_team_id : m.home_team_id))
      .filter((x): x is string => !!x)
    expect(r32Losers.length).toBe(16)
    for (const loser of r32Losers) expect(elim.get(loser)).toBe(0)

    const deadLater = deadAndLaterSlotCount(matches, predsByEntry)
    // Chalk/realistic seeded brackets always strand some R32 losers in later picks.
    expect(deadLater, 'at least one predicted team is out yet appears later').toBeGreaterThan(0)

    console.log('[after_R32] status:', st, '| dead-and-later slots:', deadLater, '| actual KO goals:', actualKoGoals)
  })

  // -------------------------------------------------------------------------
  // FULL state (completed): every round collapsible, full elimination coverage.
  // -------------------------------------------------------------------------
  it('completed: every round collapsible and the elimination map covers all losers', async () => {
    const res = await timeMachine(req({ phase: 'completed', confirm: true }), params)
    expect(res.status, await res.text().catch(() => '')).toBe(200)

    const st = await status(admin)
    expect(st).toBe('completed')

    const matches = await knockoutMatches(admin, tid)
    const decided = decidedByRound(matches)
    // #2: every round complete -> all collapsible to points totals.
    for (const r of ALL_ROUNDS) {
      expect(decided[r].decided, `${r} fully decided`).toBe(decided[r].total)
    }

    // #3: every match (except the Final) produces exactly one new eliminated team,
    // each at its own round depth.
    const elim = getEliminationRoundByTeam(matches as unknown as KnockoutMatchWithTeams[])
    for (const m of matches) {
      if (!m.winner_team_id) continue
      const loser = m.home_team_id === m.winner_team_id ? m.away_team_id : m.home_team_id
      if (loser) expect(elim.get(loser)).toBe(roundIndexOf(m.round))
    }
    // 31 matches -> 31 losers eliminated across the bracket (champion never loses).
    expect(elim.size).toBe(31)

    // #1: knockout tiebreaker diff correct against the final actual KO goal total.
    const actualKoGoals = totalKnockoutGoals(matches)
    const { entries } = await entriesWithPreds(admin, tid)
    for (const e of entries) {
      if (e.knockout_tiebreaker_goals !== null) {
        expect(e.knockout_tiebreaker_diff).toBe(Math.abs(e.knockout_tiebreaker_goals - actualKoGoals))
      }
    }

    console.log('[completed] eliminated teams:', elim.size, '| actual KO goals:', actualKoGoals)
  })
})
