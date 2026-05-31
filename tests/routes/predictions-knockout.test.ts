import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeServer, type FakeAdminClient, type Tables } from '../helpers/fake-supabase'

let server: FakeAdminClient
const player = { id: 'p1', display_name: 'Ada', nickname: null, email: 'a@b.c' }
vi.mock('@/lib/auth', () => ({ requireAuth: async () => player }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server }))
vi.mock('@/lib/email/audit', () => ({ scheduleAuditEmail: vi.fn(), sendAuditEmail: vi.fn() }))
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: () => {} }
})

import { POST } from '@/app/api/tournaments/[slug]/predictions/knockout/route'

const params = { params: Promise.resolve({ slug: 'wc' }) }
function req(body: unknown): Request {
  return new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
function seed(overrides: Partial<Tables> = {}): Tables {
  return {
    tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'knockout_open', knockout_stage_deadline: null }],
    tournament_entries: [{ id: 'e1', tournament_id: 't1', player_id: 'p1' }],
    knockout_matches: [{ id: 'm1', tournament_id: 't1', round: 'final', match_number: 1, home_team_id: 'A', away_team_id: 'B' }],
    knockout_predictions: [],
    teams: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }],
    ...overrides,
  }
}

beforeEach(() => {
  server = makeFakeServer(seed())
})

describe('POST predictions/knockout', () => {
  it('400 when the knockout stage is not open', async () => {
    server = makeFakeServer(seed({ tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'group_stage_open', knockout_stage_deadline: null }] }))
    expect((await POST(req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'A' }] }), params)).status).toBe(400)
  })

  it('400 when the predicted winner is not in the match', async () => {
    const res = await POST(req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'Z' }] }), params)
    expect(res.status).toBe(400)
  })

  it('400 when the match is not in this tournament', async () => {
    const res = await POST(req({ predictions: [{ match_id: 'ghost', predicted_winner_id: 'A' }] }), params)
    expect(res.status).toBe(400)
  })

  it('saves a valid winner pick', async () => {
    const res = await POST(req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'A' }] }), params)
    expect(res.status).toBe(200)
    expect(server.tables.knockout_predictions).toHaveLength(1)
    expect(server.tables.knockout_predictions[0]).toMatchObject({ entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'A' })
  })
})
