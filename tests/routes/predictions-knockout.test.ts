import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeServer, type FakeAdminClient, type Tables } from '../helpers/fake-supabase'

let server: FakeAdminClient
const player = {
  id: 'p1',
  display_name: 'Ada',
  nickname: null,
  email: 'a@b.c',
  unsubscribe_token: 'unsub-p1',
  email_notifications_enabled: true,
}
const scheduleUserEmail = vi.fn()
vi.mock('@/lib/auth', () => ({ requireAuth: async () => player }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => server }))
vi.mock('@/lib/email/audit', () => ({ scheduleAuditEmail: vi.fn(), sendAuditEmail: vi.fn() }))
vi.mock('@/lib/email/user', () => ({ scheduleUserEmail: (...a: unknown[]) => scheduleUserEmail(...a) }))

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
  scheduleUserEmail.mockClear()
})

describe('POST predictions/knockout', () => {
  it('400 when the knockout stage is not open', async () => {
    server = makeFakeServer(seed({ tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'group_stage_open', knockout_stage_deadline: null }] }))
    expect((await POST(req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'A' }] }), params)).status).toBe(400)
  })

  it('never persists a pick whose team is not in the match (prunes it)', async () => {
    const res = await POST(req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'Z' }] }), params)
    // The whole bracket is validated as one set; a non-participant pick is
    // dropped rather than failing the save, but it must NOT be persisted.
    expect(res.status).toBe(200)
    expect(server.tables.knockout_predictions).toHaveLength(0)
  })

  it('ignores an unknown match id without persisting anything', async () => {
    const res = await POST(req({ predictions: [{ match_id: 'ghost', predicted_winner_id: 'A' }] }), params)
    expect(res.status).toBe(200)
    expect(server.tables.knockout_predictions).toHaveLength(0)
  })

  it('saves the knockout goal-total tiebreaker on the entry', async () => {
    const res = await POST(
      req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'A' }], knockout_tiebreaker_goals: 88 }),
      params
    )
    expect(res.status).toBe(200)
    expect(server.tables.tournament_entries[0]).toMatchObject({ knockout_tiebreaker_goals: 88 })
  })

  it('rejects a negative knockout tiebreaker', async () => {
    const res = await POST(
      req({ predictions: [], knockout_tiebreaker_goals: -3 }),
      params
    )
    expect(res.status).toBe(400)
  })

  it('saves a valid winner pick', async () => {
    const res = await POST(req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'A' }] }), params)
    expect(res.status).toBe(200)
    expect(server.tables.knockout_predictions).toHaveLength(1)
    expect(server.tables.knockout_predictions[0]).toMatchObject({ entry_id: 'e1', match_id: 'm1', predicted_winner_id: 'A' })
  })

  it('schedules a knockout confirmation email to the player', async () => {
    await POST(req({ predictions: [{ match_id: 'm1', predicted_winner_id: 'A' }] }), params)
    expect(scheduleUserEmail).toHaveBeenCalledOnce()
    expect(scheduleUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'knockout_predictions_confirmation',
        isFirstSubmission: true,
        player: expect.objectContaining({
          email: 'a@b.c',
          unsubscribeToken: 'unsub-p1',
          notificationsEnabled: true,
        }),
      })
    )
  })
})
