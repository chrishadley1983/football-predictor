import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient } from '../helpers/fake-supabase'

let admin: FakeAdminClient
const requireAdmin = vi.fn(async () => undefined)
const scheduleAuditEmail = vi.fn()
vi.mock('@/lib/auth', () => ({ requireAdmin: () => requireAdmin() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/email/audit', () => ({ scheduleAuditEmail: (...a: unknown[]) => scheduleAuditEmail(...a), sendAuditEmail: vi.fn() }))

import { DELETE as deleteEntry } from '@/app/api/admin/entries/[id]/route'
import { DELETE as deletePredictions } from '@/app/api/admin/entries/[id]/predictions/route'

function req(): Request {
  return new Request('http://localhost/x', { method: 'DELETE' })
}

function fullSeed() {
  return {
    tournament_entries: [
      { id: 'e1', tournament_id: 't1', player_id: 'p1', payment_status: 'paid', group_stage_points: 12, knockout_points: 4 },
      { id: 'e2', tournament_id: 't1', player_id: 'p2', payment_status: 'paid', group_stage_points: 8, knockout_points: 2 },
    ],
    tournaments: [{ id: 't1', name: 'WC', slug: 'wc', year: 2026, entry_fee_gbp: 10, prize_pool_gbp: 20 }],
    players: [
      { id: 'p1', display_name: 'Ada', nickname: null, email: 'a@b.c' },
      { id: 'p2', display_name: 'Bea', nickname: null, email: 'b@b.c' },
    ],
    group_predictions: [
      { id: 'gp1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'A' },
      { id: 'gp2', entry_id: 'e1', group_id: 'g2', predicted_1st: 'B' },
      { id: 'gp3', entry_id: 'e2', group_id: 'g1', predicted_1st: 'C' },
    ],
    knockout_predictions: [
      { id: 'kp1', entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'A' },
    ],
    player_achievements: [{ id: 'a1', entry_id: 'e1', badge_type: 'perfect_group' }],
    golden_tickets: [{ id: 'gt1', entry_id: 'e1' }],
  }
}

beforeEach(() => {
  scheduleAuditEmail.mockClear()
  admin = makeFakeAdmin(fullSeed())
})

describe('DELETE /api/admin/entries/[id] — remove from tournament', () => {
  it('404 when the entry does not exist', async () => {
    const res = await deleteEntry(req(), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('removes the entry and (in production) cascades dependent rows', async () => {
    // Note: the fake-supabase does NOT enforce ON DELETE CASCADE — the test
    // only confirms the entry row is gone. The real DB cascade is enforced by
    // the migration; this test verifies the route does its part of the work.
    const res = await deleteEntry(req(), { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(200)
    expect(admin.tables.tournament_entries.find((e) => e.id === 'e1')).toBeUndefined()
    // The remaining e2 (paid) is still there → prize pool = 1 × £10
    expect(admin.tables.tournaments[0].prize_pool_gbp).toBe(10)
  })

  it('fires an audit email with the player, tournament, and cascade counts', async () => {
    await deleteEntry(req(), { params: Promise.resolve({ id: 'e1' }) })
    expect(scheduleAuditEmail).toHaveBeenCalledOnce()
    expect(scheduleAuditEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin_action',
        action: 'entry_removed',
        tournament: expect.objectContaining({ slug: 'wc' }),
        details: expect.objectContaining({
          entry_id: 'e1',
          player_id: 'p1',
          player_email: 'a@b.c',
          payment_status_at_deletion: 'paid',
          group_predictions_deleted: 2,
          knockout_predictions_deleted: 1,
          achievements_deleted: 1,
          golden_tickets_deleted: 1,
        }),
      })
    )
  })
})

describe('DELETE /api/admin/entries/[id]/predictions — reset only', () => {
  it('404 when the entry does not exist', async () => {
    const res = await deletePredictions(req(), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('wipes the entry-owned predictions/achievements/tickets but keeps the entry row', async () => {
    const res = await deletePredictions(req(), { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(200)
    // Entry row survives
    const entry = admin.tables.tournament_entries.find((e) => e.id === 'e1')
    expect(entry).toBeDefined()
    expect(entry!.payment_status).toBe('paid')
    // Cached scores reset
    expect(entry!.group_stage_points).toBe(0)
    expect(entry!.knockout_points).toBe(0)
    // Dependent rows for e1 are gone, e2's stay
    expect(admin.tables.group_predictions.map((p) => p.id).sort()).toEqual(['gp3'])
    expect(admin.tables.knockout_predictions).toHaveLength(0)
    expect(admin.tables.player_achievements).toHaveLength(0)
    expect(admin.tables.golden_tickets).toHaveLength(0)
  })

  it('fires an audit email with cascade counts', async () => {
    await deletePredictions(req(), { params: Promise.resolve({ id: 'e1' }) })
    expect(scheduleAuditEmail).toHaveBeenCalledOnce()
    expect(scheduleAuditEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin_action',
        action: 'entry_predictions_reset',
        details: expect.objectContaining({
          entry_id: 'e1',
          player_id: 'p1',
          group_predictions_deleted: 2,
          knockout_predictions_deleted: 1,
          achievements_deleted: 1,
          golden_tickets_deleted: 1,
        }),
      })
    )
  })
})
