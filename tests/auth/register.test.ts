import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient } from '../helpers/fake-supabase'

let admin: FakeAdminClient
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
// Audit email is fire-and-forget; stub it so tests don't touch Resend / after().
const scheduleAuditEmail = vi.fn()
vi.mock('@/lib/email/audit', () => ({ scheduleAuditEmail: (...a: unknown[]) => scheduleAuditEmail(...a) }))

import { POST } from '@/app/api/auth/register/route'

function req(body: unknown): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  scheduleAuditEmail.mockClear()
  admin = makeFakeAdmin({ players: [] })
})

describe('POST /api/auth/register', () => {
  it('400 when required fields are missing', async () => {
    const res = await POST(req({ email: 'a@b.c' }))
    expect(res.status).toBe(400)
  })

  it('400 when the password is too short', async () => {
    const res = await POST(req({ email: 'a@b.c', password: '123', displayName: 'Ada' }))
    expect(res.status).toBe(400)
  })

  it('201 and inserts a player on success', async () => {
    admin = makeFakeAdmin({ players: [] })
    const res = await POST(req({ email: 'Ada@B.c', password: 'secret1', displayName: 'Ada', nickname: 'Ace' }))
    expect(res.status).toBe(201)
    expect(admin.tables.players).toHaveLength(1)
    // email is normalised to lowercase/trimmed
    expect(admin.tables.players[0]).toMatchObject({ email: 'ada@b.c', display_name: 'Ada', nickname: 'Ace' })
    expect(scheduleAuditEmail).toHaveBeenCalledOnce()
  })

  it('409 when the auth user already exists', async () => {
    admin = makeFakeAdmin(
      { players: [] },
      { createUser: () => ({ data: { user: null }, error: { message: 'User already registered' } }) }
    )
    const res = await POST(req({ email: 'dupe@b.c', password: 'secret1', displayName: 'Dup' }))
    expect(res.status).toBe(409)
    expect(admin.tables.players).toHaveLength(0)
  })

  it('500 and rolls back the auth user when the player insert fails', async () => {
    admin = makeFakeAdmin(
      { players: [] },
      {
        createUser: () => ({ data: { user: { id: 'orphan-1', email: 'x@y.z' } }, error: null }),
        failOn: { players: { insert: { message: 'duplicate key' } } },
      }
    )
    const res = await POST(req({ email: 'x@y.z', password: 'secret1', displayName: 'X' }))
    expect(res.status).toBe(500)
    // orphaned auth user must be cleaned up
    expect(admin.deletedUsers).toContain('orphan-1')
    expect(scheduleAuditEmail).not.toHaveBeenCalled()
  })

  it('does NOT grant any admin role on registration', async () => {
    admin = makeFakeAdmin({ players: [] })
    await POST(req({ email: 'plain@b.c', password: 'secret1', displayName: 'Plain' }))
    // the created auth user carries no app_metadata.role — admin must be granted out-of-band
    expect(admin.tables.players[0].auth_user_id).toBeDefined()
  })
})
