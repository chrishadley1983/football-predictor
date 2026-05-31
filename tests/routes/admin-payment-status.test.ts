import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient } from '../helpers/fake-supabase'

let admin: FakeAdminClient
vi.mock('@/lib/auth', () => ({ requireAdmin: async () => undefined }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/email/audit', () => ({ scheduleAuditEmail: vi.fn(), sendAuditEmail: vi.fn() }))

import { PATCH as patchPayment } from '@/app/api/admin/entries/[id]/payment/route'
import { PATCH as patchStatus } from '@/app/api/admin/tournaments/[slug]/status/route'

function req(body: unknown): Request {
  return new Request('http://localhost/x', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('PATCH payment', () => {
  beforeEach(() => {
    admin = makeFakeAdmin({
      tournament_entries: [
        { id: 'e1', tournament_id: 't1', player_id: 'p1', payment_status: 'pending' },
        { id: 'e2', tournament_id: 't1', player_id: 'p2', payment_status: 'paid' },
      ],
      tournaments: [{ id: 't1', name: 'WC', slug: 'wc', year: 2026, entry_fee_gbp: 10, prize_pool_gbp: null }],
      players: [{ id: 'p1', display_name: 'Ada', nickname: null, email: 'a@b.c' }],
    })
  })

  it('400 for an invalid payment_status', async () => {
    const res = await patchPayment(req({ payment_status: 'bogus' }), { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(400)
  })

  it('marks an entry paid and recomputes the prize pool', async () => {
    const res = await patchPayment(req({ payment_status: 'paid' }), { params: Promise.resolve({ id: 'e1' }) })
    expect(res.status).toBe(200)
    expect(admin.tables.tournament_entries.find((e) => e.id === 'e1')!.payment_status).toBe('paid')
    // Two paid entries × £10 = £20
    expect(admin.tables.tournaments[0].prize_pool_gbp).toBe(20)
  })
})

describe('PATCH status (state machine)', () => {
  beforeEach(() => {
    admin = makeFakeAdmin({ tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'draft' }] })
  })

  it('400 for an unknown status value', async () => {
    const res = await patchStatus(req({ status: 'banana' }), { params: Promise.resolve({ slug: 'wc' }) })
    expect(res.status).toBe(400)
  })

  it('allows the next valid transition (draft → group_stage_open)', async () => {
    const res = await patchStatus(req({ status: 'group_stage_open' }), { params: Promise.resolve({ slug: 'wc' }) })
    expect(res.status).toBe(200)
    expect(admin.tables.tournaments[0].status).toBe('group_stage_open')
  })

  it('rejects skipping ahead (draft → completed)', async () => {
    const res = await patchStatus(req({ status: 'completed' }), { params: Promise.resolve({ slug: 'wc' }) })
    expect(res.status).toBe(400)
    expect(admin.tables.tournaments[0].status).toBe('draft')
  })

  it('rejects going backwards (set status to draft from group_stage_open)', async () => {
    admin = makeFakeAdmin({ tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'group_stage_open' }] })
    const res = await patchStatus(req({ status: 'draft' }), { params: Promise.resolve({ slug: 'wc' }) })
    expect(res.status).toBe(400)
  })

  it('404 when the tournament does not exist', async () => {
    admin = makeFakeAdmin({ tournaments: [] })
    const res = await patchStatus(req({ status: 'group_stage_open' }), { params: Promise.resolve({ slug: 'nope' }) })
    expect(res.status).toBe(404)
  })
})
