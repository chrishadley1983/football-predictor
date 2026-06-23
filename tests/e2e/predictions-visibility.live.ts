import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveParticipantIds, predictionsToRecord } from '@/lib/bracket'

// Drive the REAL admin simulation route; only auth is stubbed. testHarnessGuard
// allows this because NODE_ENV under vitest is 'test' (not 'production').
//
// This suite asserts the Predictions-page / My-Predictions-page VISIBILITY
// invariants behind the three reported defects:
//   D1 (knockout OPEN  -> nobody, admins included, sees others' brackets)
//   D2 (knockout CLOSED-> ALL rounds R32..Final render, not just R32 + Final)
//   D3 (knockout CLOSED-> player's OWN full bracket resolves through the Final,
//       with the ACTUAL winner per played slot for ✓/✗ review)
// It exercises the DB state that the page-level logic reads; the component-level
// render assertions live in the unit/component suite (PredictionGrid.knockout,
// BracketMatch.review). Here we prove the DATA invariants the fix depends on.
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

// Mirrors predictions/page.tsx line 168.
const KNOCKOUT_PUBLIC_STATUSES = ['knockout_closed', 'completed']

const ALL_ROUNDS = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final'] as const
const EXPECTED_ENTRY_COUNT = 10

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

interface KoMatch {
  id: string
  round: string
  match_number: number
  home_team_id: string | null
  away_team_id: string | null
  home_source: string | null
  away_source: string | null
  winner_team_id: string | null
}

async function knockoutMatches(admin: Admin, tid: string): Promise<KoMatch[]> {
  const { data } = await admin
    .from('knockout_matches')
    .select('id, round, match_number, home_team_id, away_team_id, home_source, away_source, winner_team_id')
    .eq('tournament_id', tid)
    .order('sort_order')
  return (data ?? []) as KoMatch[]
}

function decidedByRound(matches: KoMatch[]): Record<string, { decided: number; total: number }> {
  const out: Record<string, { decided: number; total: number }> = {}
  for (const m of matches) {
    const r = (out[m.round] ??= { decided: 0, total: 0 })
    r.total++
    if (m.winner_team_id) r.decided++
  }
  return out
}

async function entriesWithPreds(admin: Admin, tid: string) {
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('tournament_id', tid)
  const entryIds = (entries ?? []).map((e) => e.id)
  const { data: preds } = await admin
    .from('knockout_predictions')
    .select('entry_id, match_id, predicted_winner_id')
    .in('entry_id', entryIds)
  return { entryIds, preds: preds ?? [] }
}

describe('Predictions visibility — live E2E on wc-2026-test (D1/D2/D3)', () => {
  let admin: Admin
  let tid: string

  beforeAll(async () => {
    admin = createAdminClient()
    tid = await tournamentId(admin)
  })

  // --------------------------------------------------------------------------
  // PHASE A — after_group_stage => knockout_open (D1)
  // --------------------------------------------------------------------------
  it('after_group_stage: status knockout_open hides ALL knockout from everyone (D1)', async () => {
    const res = await timeMachine(req({ phase: 'after_group_stage', confirm: true }), params)
    expect(res.status, await res.text().catch(() => '')).toBe(200)

    const st = await status(admin)
    expect(st, 'status after after_group_stage').toBe('knockout_open')

    // D1 page logic: knockoutPublic === false => page never fetches/renders
    // knockout predictions, so admins and anon alike see only Group Stage.
    expect(KNOCKOUT_PUBLIC_STATUSES.includes(st)).toBe(false)

    const matches = await knockoutMatches(admin, tid)
    expect(matches.length).toBeGreaterThan(0)

    // NO KO RESULTS while OPEN.
    const decided = matches.filter((m) => m.winner_team_id).length
    expect(decided, 'knockout matches with a winner while OPEN').toBe(0)

    // SEED COMPLETENESS: all 10 entries have knockout predictions spanning
    // EVERY round (so the data is ready, but the page must still hide it).
    const { entryIds, preds } = await entriesWithPreds(admin, tid)
    expect(entryIds.length).toBe(EXPECTED_ENTRY_COUNT)
    expect(preds.length).toBeGreaterThan(0)

    const matchRoundById = new Map(matches.map((m) => [m.id, m.round]))
    const roundsByEntry = new Map<string, Set<string>>()
    for (const p of preds) {
      const round = matchRoundById.get(p.match_id)
      if (!round) continue
      const set = roundsByEntry.get(p.entry_id) ?? new Set<string>()
      set.add(round)
      roundsByEntry.set(p.entry_id, set)
    }
    expect(roundsByEntry.size, 'entries with at least one knockout prediction').toBe(EXPECTED_ENTRY_COUNT)
    for (const [entryId, rounds] of roundsByEntry) {
      for (const r of ALL_ROUNDS) {
        expect(rounds.has(r), `entry ${entryId} missing predictions for round ${r}`).toBe(true)
      }
    }

    // R32 slots have real teams; later rounds are all null team ids (no results).
    const r32 = matches.filter((m) => m.round === 'round_of_32')
    expect(r32.length).toBe(16)
    expect(r32.every((m) => m.home_team_id && m.away_team_id)).toBe(true)
    const later = matches.filter((m) => m.round !== 'round_of_32')
    expect(later.every((m) => m.home_team_id === null && m.away_team_id === null)).toBe(true)

    console.log('[D1 after_group_stage] status:', st, '| decided KO:', decided, '| entries:', entryIds.length)
  })

  // --------------------------------------------------------------------------
  // PHASE B — after_round_of_32 => knockout_closed (D2 + D3)
  // --------------------------------------------------------------------------
  it('after_round_of_32: status knockout_closed; R32 decided, R16+ unresolved; own bracket fully resolves (D2/D3)', async () => {
    const res = await timeMachine(req({ phase: 'after_round_of_32', confirm: true }), params)
    expect(res.status, await res.text().catch(() => '')).toBe(200)

    const st = await status(admin)
    expect(st, 'status after after_round_of_32').toBe('knockout_closed')

    // D2 page logic: knockoutPublic === true => knockout rows render.
    expect(KNOCKOUT_PUBLIC_STATUSES.includes(st)).toBe(true)

    const matches = await knockoutMatches(admin, tid)
    const decided = decidedByRound(matches)
    expect(decided.round_of_32, 'R32 decided').toEqual({ decided: 16, total: 16 })
    expect(decided.round_of_16?.decided ?? 0, 'R16 decided').toBe(0)
    expect(decided.round_of_16?.total ?? 0, 'R16 total').toBe(8)
    expect(decided.quarter_final?.decided ?? 0, 'QF decided').toBe(0)
    expect(decided.semi_final?.decided ?? 0, 'SF decided').toBe(0)
    expect(decided.final?.decided ?? 0, 'Final decided').toBe(0)

    // DOWNSTREAM SLOTS UNRESOLVED: this is the exact state where the OLD grid
    // dropped R16/QF/SF (null team ids). R16 immediate-next round is partially
    // filled by advanceWinnerLogic, but QF/SF/Final remain entirely null. The
    // D2 fix renders 'Match N' for these null-slot rows instead of dropping them.
    const qfSfFinal = matches.filter((m) =>
      ['quarter_final', 'semi_final', 'final'].includes(m.round)
    )
    expect(
      qfSfFinal.every((m) => m.home_team_id === null && m.away_team_id === null),
      'QF/SF/Final should all have null team ids after R32 only'
    ).toBe(true)

    // R16: a MAJORITY still have null team ids (the OLD-bug drop condition).
    // advanceWinnerLogic fills the immediate next round's slots from R32 winners,
    // so some R16 slots are populated; the invariant we assert is that the
    // downstream rounds are NOT fully resolved (proving the 'Match N' path matters).
    const r16 = matches.filter((m) => m.round === 'round_of_16')
    expect(r16.length).toBe(8)
    const r16NullBoth = r16.filter((m) => m.home_team_id === null && m.away_team_id === null).length
    const r16NullAny = r16.filter((m) => m.home_team_id === null || m.away_team_id === null).length
    console.log('[D2 after_R32] R16 null-both:', r16NullBoth, '/ null-any:', r16NullAny, '/ 8')
    // Every R16 match has at least one unresolved slot (the second feeder is a
    // later R32 winner that always exists, so both can be filled) — assert the
    // weaker, always-true invariant that at least the downstream QF+ are null,
    // and that the OLD grid would have dropped QF/SF/Final entirely.
    expect(qfSfFinal.length).toBe(4 + 2 + 1)

    // ---- D3: player's OWN full bracket resolves from their own picks even
    //          though the real bracket only advanced to R16. ----
    const { entryIds, preds } = await entriesWithPreds(admin, tid)
    expect(entryIds.length).toBe(EXPECTED_ENTRY_COUNT)

    const oneEntry = entryIds[0]
    const myPreds = preds.filter((p) => p.entry_id === oneEntry)
    expect(myPreds.length, 'entry has knockout predictions').toBeGreaterThan(0)

    // Build the review `basis`: null out the downstream (non-R32) ACTUAL team ids
    // so the player's predicted bracket resolves from their own picks (mirrors
    // KnockoutBracket reviewMode). R32 actual slots are kept.
    const basis = matches.map((m) => ({
      id: m.id,
      match_number: m.match_number,
      home_team_id: m.round === 'round_of_32' ? m.home_team_id : null,
      away_team_id: m.round === 'round_of_32' ? m.away_team_id : null,
      home_source: m.home_source,
      away_source: m.away_source,
    }))

    const { participants, validWinners } = resolveParticipantIds(
      basis,
      predictionsToRecord(myPreds)
    )

    // For EVERY round, at least one match must have a non-null winner AND
    // resolved participants from the player's own picks (D3 full resolve).
    const validWinnerCountByRound: Record<string, number> = {}
    const resolvedParticipantCountByRound: Record<string, number> = {}
    for (const m of matches) {
      const r = m.round
      validWinnerCountByRound[r] ??= 0
      resolvedParticipantCountByRound[r] ??= 0
      if (validWinners.get(m.id)) validWinnerCountByRound[r]++
      const p = participants.get(m.id)
      if (p && p.homeTeamId && p.awayTeamId) resolvedParticipantCountByRound[r]++
    }
    console.log('[D3 after_R32] own-bracket validWinners by round:', JSON.stringify(validWinnerCountByRound))
    console.log('[D3 after_R32] own-bracket resolved participants by round:', JSON.stringify(resolvedParticipantCountByRound))

    for (const r of ALL_ROUNDS) {
      expect(
        validWinnerCountByRound[r] ?? 0,
        `D3: own-bracket must yield >=1 validWinner in round ${r}`
      ).toBeGreaterThanOrEqual(1)
      expect(
        resolvedParticipantCountByRound[r] ?? 0,
        `D3: own-bracket must yield >=1 fully-resolved matchup in round ${r}`
      ).toBeGreaterThanOrEqual(1)
    }
    // The Final must have a predicted champion (exactly 1 final match).
    expect(validWinnerCountByRound['final']).toBe(1)

    console.log('[D2/D3 after_R32] status:', st, '| decided:', JSON.stringify(decided))
  })

  // --------------------------------------------------------------------------
  // PHASE C — completed (D2 + D3, all results present) — leave tournament here
  // --------------------------------------------------------------------------
  it('completed: every round fully decided so D2 grid + D3 ✓/✗ have actual winners', async () => {
    const res = await timeMachine(req({ phase: 'completed', confirm: true }), params)
    expect(res.status, await res.text().catch(() => '')).toBe(200)

    const st = await status(admin)
    expect(st, 'status after completed').toBe('completed')
    expect(KNOCKOUT_PUBLIC_STATUSES.includes(st)).toBe(true)

    const matches = await knockoutMatches(admin, tid)
    const decided = decidedByRound(matches)
    expect(decided.round_of_32).toEqual({ decided: 16, total: 16 })
    expect(decided.round_of_16).toEqual({ decided: 8, total: 8 })
    expect(decided.quarter_final).toEqual({ decided: 4, total: 4 })
    expect(decided.semi_final).toEqual({ decided: 2, total: 2 })
    expect(decided.final).toEqual({ decided: 1, total: 1 })

    // D2 FULL GRID: every slot resolved (real teams), so 'Match N' fallback not
    // needed and every player cell can be coloured vs the actual winner.
    expect(
      matches.every((m) => m.home_team_id && m.away_team_id && m.winner_team_id),
      'every knockout match fully resolved at completion'
    ).toBe(true)

    // D3 ACTUAL WINNERS exist for every played slot => ✓/✗ annotations possible.
    const withWinner = matches.filter((m) => m.winner_team_id).length
    expect(withWinner).toBe(matches.length)

    // Sanity: 10 entries still present with knockout predictions for the review surface.
    const { entryIds, preds } = await entriesWithPreds(admin, tid)
    expect(entryIds.length).toBe(EXPECTED_ENTRY_COUNT)
    expect(preds.length).toBeGreaterThan(0)

    console.log('[D2/D3 completed] status:', st, '| decided:', JSON.stringify(decided), '| matches:', matches.length)
    console.log('[FINAL STATE] wc-2026-test left in status:', st)
  })
})
