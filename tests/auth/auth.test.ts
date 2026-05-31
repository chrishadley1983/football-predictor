import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeServer, type FakeAdminClient } from '../helpers/fake-supabase'

// auth.ts resolves the session via createClient() from the server module.
let server: FakeAdminClient
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server }))

import { getCurrentPlayer, requireAuth, requireAdmin } from '@/lib/auth'

const PLAYER = { id: 'p1', auth_user_id: 'u1', display_name: 'Ada', email: 'a@b.c', nickname: null, avatar_url: null, created_at: '2026-01-01' }

beforeEach(() => {
  server = makeFakeServer()
})

describe('getCurrentPlayer', () => {
  it('returns null when there is no authenticated user', async () => {
    server = makeFakeServer({ players: [PLAYER] }, { user: null })
    expect(await getCurrentPlayer()).toBeNull()
  })

  it('returns the matching player row for the authenticated user', async () => {
    server = makeFakeServer({ players: [PLAYER] }, { user: { id: 'u1', app_metadata: {} } })
    const p = await getCurrentPlayer()
    expect(p?.id).toBe('p1')
    expect(p?.display_name).toBe('Ada')
  })

  it('returns null when the user has no player row', async () => {
    server = makeFakeServer({ players: [] }, { user: { id: 'ghost', app_metadata: {} } })
    expect(await getCurrentPlayer()).toBeNull()
  })
})

describe('requireAuth', () => {
  it('throws a 401 Response when unauthenticated', async () => {
    server = makeFakeServer({ players: [PLAYER] }, { user: null })
    await expect(requireAuth()).rejects.toSatisfy(
      (e) => e instanceof Response && (e as Response).status === 401
    )
  })

  it('returns the player when authenticated', async () => {
    server = makeFakeServer({ players: [PLAYER] }, { user: { id: 'u1', app_metadata: {} } })
    const p = await requireAuth()
    expect(p.id).toBe('p1')
  })
})

describe('requireAdmin', () => {
  it('throws 401 when there is no user', async () => {
    server = makeFakeServer({}, { user: null })
    await expect(requireAdmin()).rejects.toSatisfy(
      (e) => e instanceof Response && (e as Response).status === 401
    )
  })

  it('throws 403 when the user is not an admin', async () => {
    server = makeFakeServer({}, { user: { id: 'u1', app_metadata: { role: 'user' } } })
    await expect(requireAdmin()).rejects.toSatisfy(
      (e) => e instanceof Response && (e as Response).status === 403
    )
  })

  it('resolves for an admin (app_metadata.role === "admin")', async () => {
    server = makeFakeServer({}, { user: { id: 'u1', app_metadata: { role: 'admin' } } })
    await expect(requireAdmin()).resolves.toBeUndefined()
  })
})
