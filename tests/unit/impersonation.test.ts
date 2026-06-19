import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeAdmin, type FakeAdminClient } from '../helpers/fake-supabase'

// Controllable mocks for the cookie, the authenticated user's role, and the admin client.
let cookieValue: string | undefined
let userRole: string | null
let adminClient: FakeAdminClient

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (_name: string) => (cookieValue !== undefined ? { value: cookieValue } : undefined),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { app_metadata: userRole ? { role: userRole } : {} } },
      }),
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))

import { getImpersonatedEntryId, resolveEffectiveEntry } from '@/lib/impersonation'

beforeEach(() => {
  cookieValue = undefined
  userRole = 'admin'
  adminClient = makeFakeAdmin({
    tournament_entries: [
      { id: 'e-imp', tournament_id: 't1', player_id: 'pX' },
      { id: 'e-own', tournament_id: 't1', player_id: 'pOwn' },
      { id: 'e-other-t', tournament_id: 't2', player_id: 'pY' },
    ],
  })
})

describe('getImpersonatedEntryId', () => {
  it('returns null when no cookie is set', async () => {
    cookieValue = undefined
    expect(await getImpersonatedEntryId()).toBeNull()
  })

  it('returns null for a NON-admin even with the cookie set (forged cookie)', async () => {
    cookieValue = 'e-imp'
    userRole = null
    expect(await getImpersonatedEntryId()).toBeNull()
  })

  it('returns the entry id for an admin with the cookie set', async () => {
    cookieValue = 'e-imp'
    userRole = 'admin'
    expect(await getImpersonatedEntryId()).toBe('e-imp')
  })
})

describe('resolveEffectiveEntry', () => {
  it('uses the impersonated entry for an admin', async () => {
    cookieValue = 'e-imp'
    userRole = 'admin'
    expect(await resolveEffectiveEntry('t1', 'pOwn')).toEqual({ entryId: 'e-imp', impersonating: true })
  })

  it('falls back to the own entry when the impersonated entry is in another tournament', async () => {
    cookieValue = 'e-other-t' // belongs to t2, not t1
    userRole = 'admin'
    expect(await resolveEffectiveEntry('t1', 'pOwn')).toEqual({ entryId: 'e-own', impersonating: false })
  })

  it('ignores a forged cookie from a non-admin and uses their own entry', async () => {
    cookieValue = 'e-imp'
    userRole = null
    expect(await resolveEffectiveEntry('t1', 'pOwn')).toEqual({ entryId: 'e-own', impersonating: false })
  })
})
