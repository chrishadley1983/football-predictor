import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient } from '../helpers/fake-supabase'

// Control requireAdmin: resolve by default, or throw a Response to simulate auth failure.
let adminAuthError: Response | null = null
vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => {
    if (adminAuthError) throw adminAuthError
  },
  requireAuth: async () => ({ id: 'p1' }),
}))

let admin: FakeAdminClient
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/email/audit', () => ({ scheduleAuditEmail: vi.fn(), sendAuditEmail: vi.fn() }))

import { POST as timeMachine } from '@/app/api/admin/tournaments/[slug]/time-machine/route'
import { POST as resetTestData } from '@/app/api/admin/tournaments/[slug]/reset-test-data/route'
import { POST as seedEntries } from '@/app/api/admin/tournaments/[slug]/seed-entries/route'

// A test tournament slug (ends in -test) so the destructive routes' test-only
// guard passes and we can assert the downstream confirm/phase checks.
const params = { params: Promise.resolve({ slug: 'wc26-test' }) }
function req(body: unknown = {}): Request {
  return new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

beforeEach(() => {
  adminAuthError = null
  admin = makeFakeAdmin({ tournaments: [], groups: [] })
})
afterEach(() => vi.unstubAllEnvs())

describe('time-machine route guards', () => {
  it('401 when not an admin', async () => {
    adminAuthError = new Response(null, { status: 401 })
    const res = await timeMachine(req({ phase: 'completed', confirm: true }), params)
    expect(res.status).toBe(401)
  })

  it('403 when the test harness is disabled (production, no flag)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_TEST_HARNESS', '')
    const res = await timeMachine(req({ phase: 'completed', confirm: true }), params)
    expect(res.status).toBe(403)
  })

  it('400 when confirm is not passed (harness enabled)', async () => {
    const res = await timeMachine(req({ phase: 'completed' }), params)
    expect(res.status).toBe(400)
  })

  it('400 for an invalid phase', async () => {
    const res = await timeMachine(req({ phase: 'not-a-phase', confirm: true }), params)
    expect(res.status).toBe(400)
  })
})

describe('reset-test-data route guards', () => {
  it('403 when the harness is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_TEST_HARNESS', '')
    const res = await resetTestData(req({ confirm: true }), params)
    expect(res.status).toBe(403)
  })

  it('400 when confirm is not passed', async () => {
    const res = await resetTestData(req({}), params)
    expect(res.status).toBe(400)
  })
})

describe('seed-entries route guards', () => {
  it('403 when the harness is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_TEST_HARNESS', '')
    const res = await seedEntries(req(), params)
    expect(res.status).toBe(403)
  })
})
