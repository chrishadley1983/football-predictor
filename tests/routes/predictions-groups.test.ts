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

import { POST } from '@/app/api/tournaments/[slug]/predictions/groups/route'

const params = { params: Promise.resolve({ slug: 'wc' }) }
function req(body: unknown): Request {
  return new Request('http://localhost/x', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

function seed(overrides: Partial<Tables> = {}): Tables {
  return {
    tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'group_stage_open', group_stage_deadline: null, third_place_qualifiers_count: null }],
    tournament_entries: [{ id: 'e1', tournament_id: 't1', player_id: 'p1', tiebreaker_goals: null }],
    group_teams: [
      { group_id: 'g1', team_id: 'A' },
      { group_id: 'g1', team_id: 'B' },
      { group_id: 'g1', team_id: 'C' },
    ],
    group_predictions: [],
    teams: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' }],
    groups: [{ id: 'g1', name: 'Group A' }],
    ...overrides,
  }
}

const goodPred = { predictions: [{ group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C' }], tiebreaker_goals: 120 }

beforeEach(() => {
  server = makeFakeServer(seed())
  scheduleUserEmail.mockClear()
})

describe('POST predictions/groups — gating', () => {
  it('404 when the tournament does not exist', async () => {
    server = makeFakeServer(seed({ tournaments: [] }))
    expect((await POST(req(goodPred), params)).status).toBe(404)
  })

  it('400 when the group stage is not open', async () => {
    server = makeFakeServer(seed({ tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'group_stage_closed', group_stage_deadline: null, third_place_qualifiers_count: null }] }))
    expect((await POST(req(goodPred), params)).status).toBe(400)
  })

  it('400 when the deadline has passed', async () => {
    server = makeFakeServer(seed({ tournaments: [{ id: 't1', slug: 'wc', name: 'WC', year: 2026, status: 'group_stage_open', group_stage_deadline: '2020-01-01T00:00:00Z', third_place_qualifiers_count: null }] }))
    expect((await POST(req(goodPred), params)).status).toBe(400)
  })

  it('404 when the player has not entered', async () => {
    server = makeFakeServer(seed({ tournament_entries: [] }))
    expect((await POST(req(goodPred), params)).status).toBe(404)
  })
})

describe('POST predictions/groups — validation', () => {
  it('400 when predictions is not an array', async () => {
    expect((await POST(req({ predictions: 'nope' }), params)).status).toBe(400)
  })

  it('400 when 1st/2nd are missing', async () => {
    expect((await POST(req({ predictions: [{ group_id: 'g1', predicted_1st: 'A' }] }), params)).status).toBe(400)
  })

  it('400 when the same team is picked twice in a group', async () => {
    const res = await POST(req({ predictions: [{ group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'A', predicted_3rd: 'B' }] }), params)
    expect(res.status).toBe(400)
  })

  it('400 when a predicted team does not belong to the group', async () => {
    const res = await POST(req({ predictions: [{ group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'Z' }] }), params)
    expect(res.status).toBe(400)
  })

  it('400 when tiebreaker is out of range', async () => {
    const res = await POST(req({ predictions: [{ group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C' }], tiebreaker_goals: 5000 }), params)
    expect(res.status).toBe(400)
  })
})

describe('POST predictions/groups — success', () => {
  it('inserts the prediction and updates the tiebreaker', async () => {
    const res = await POST(req(goodPred), params)
    expect(res.status).toBe(200)
    expect(server.tables.group_predictions).toHaveLength(1)
    expect(server.tables.group_predictions[0]).toMatchObject({ entry_id: 'e1', group_id: 'g1', predicted_1st: 'A', predicted_2nd: 'B', predicted_3rd: 'C' })
    expect(server.tables.tournament_entries[0].tiebreaker_goals).toBe(120)
  })

  it('updates an existing prediction in place (no duplicate row)', async () => {
    server = makeFakeServer(seed({ group_predictions: [{ id: 'gp1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'B', predicted_2nd: 'A', predicted_3rd: 'C', points_earned: 3 }] }))
    const res = await POST(req(goodPred), params)
    expect(res.status).toBe(200)
    expect(server.tables.group_predictions).toHaveLength(1)
    expect(server.tables.group_predictions[0]).toMatchObject({ id: 'gp1', predicted_1st: 'A', predicted_2nd: 'B', points_earned: 3 })
  })

  it('schedules a confirmation email to the player with isFirstSubmission=true', async () => {
    await POST(req(goodPred), params)
    expect(scheduleUserEmail).toHaveBeenCalledOnce()
    expect(scheduleUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'group_predictions_confirmation',
        isFirstSubmission: true,
        tiebreaker: 120,
        player: expect.objectContaining({
          email: 'a@b.c',
          unsubscribeToken: 'unsub-p1',
          notificationsEnabled: true,
        }),
      })
    )
  })

  it('marks isFirstSubmission=false when a prediction already existed', async () => {
    server = makeFakeServer(seed({ group_predictions: [{ id: 'gp1', entry_id: 'e1', group_id: 'g1', predicted_1st: 'B', predicted_2nd: 'A', predicted_3rd: 'C', points_earned: 3 }] }))
    await POST(req(goodPred), params)
    expect(scheduleUserEmail).toHaveBeenCalledOnce()
    expect(scheduleUserEmail).toHaveBeenCalledWith(expect.objectContaining({ isFirstSubmission: false }))
  })
})
