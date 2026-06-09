import { describe, it, expect } from 'vitest'
import {
  parseScoreboard,
  normaliseAbbr,
  formatEspnDate,
  enumerateDays,
} from '@/lib/results/espn-source'
import {
  computeGroupStandings,
  selectBestThirdPlaced,
  type MatchScore,
} from '@/lib/results/standings'

describe('espn-source parser', () => {
  it('parses a scheduled (pre) event with no scores', () => {
    const raw = {
      events: [
        {
          id: '760415',
          date: '2026-06-11T19:00Z',
          status: { type: { state: 'pre', completed: false, name: 'STATUS_SCHEDULED' } },
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { abbreviation: 'MEX' }, score: '0' },
                { homeAway: 'away', team: { abbreviation: 'RSA' }, score: '0' },
              ],
            },
          ],
        },
      ],
    }
    const out = parseScoreboard(raw)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      externalId: '760415',
      state: 'pre',
      completed: false,
      homeCode: 'MEX',
      awayCode: 'RSA',
      homeScore: 0,
      awayScore: 0,
      isShootout: false,
      winnerCode: null,
    })
  })

  it('parses a finished (post) event with scores and winner flag', () => {
    const raw = {
      events: [
        {
          id: '999',
          date: '2026-06-12T19:00Z',
          status: { type: { state: 'post', completed: true, name: 'STATUS_FULL_TIME' } },
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { abbreviation: 'BRA' }, score: '2', winner: true },
                { homeAway: 'away', team: { abbreviation: 'MAR' }, score: '1', winner: false },
              ],
            },
          ],
        },
      ],
    }
    const out = parseScoreboard(raw)
    expect(out[0].homeScore).toBe(2)
    expect(out[0].awayScore).toBe(1)
    expect(out[0].winnerCode).toBe('BRA')
    expect(out[0].completed).toBe(true)
  })

  it('flags shootouts from the status description', () => {
    const raw = {
      events: [
        {
          id: '1',
          date: '2026-07-04T19:00Z',
          status: { type: { state: 'post', completed: true, description: 'FT - Pens' } },
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { abbreviation: 'ENG' }, score: '1', winner: false },
                { homeAway: 'away', team: { abbreviation: 'FRA' }, score: '1', winner: true },
              ],
            },
          ],
        },
      ],
    }
    const out = parseScoreboard(raw)
    expect(out[0].isShootout).toBe(true)
    expect(out[0].winnerCode).toBe('FRA')
  })

  it('aliases divergent ESPN abbreviations to our codes', () => {
    expect(normaliseAbbr('SAU')).toBe('KSA')
    expect(normaliseAbbr('IRI')).toBe('IRN')
    expect(normaliseAbbr('mex')).toBe('MEX')
    expect(normaliseAbbr(undefined)).toBeNull()
  })

  it('skips events with fewer than two competitors', () => {
    const raw = {
      events: [
        {
          id: '1',
          date: '2026-06-11T19:00Z',
          status: { type: { state: 'pre' } },
          competitions: [{ competitors: [{ team: { abbreviation: 'MEX' }, score: '0' }] }],
        },
      ],
    }
    expect(parseScoreboard(raw)).toHaveLength(0)
  })

  it('skips events whose state is not pre/in/post', () => {
    const raw = {
      events: [
        {
          id: '1',
          date: '2026-06-11T19:00Z',
          status: { type: { state: 'cancelled' } },
          competitions: [
            {
              competitors: [
                { homeAway: 'home', team: { abbreviation: 'MEX' }, score: '0' },
                { homeAway: 'away', team: { abbreviation: 'RSA' }, score: '0' },
              ],
            },
          ],
        },
      ],
    }
    expect(parseScoreboard(raw)).toHaveLength(0)
  })

  it('returns empty array for empty/malformed inputs', () => {
    expect(parseScoreboard(null)).toEqual([])
    expect(parseScoreboard({})).toEqual([])
    expect(parseScoreboard({ events: [] })).toEqual([])
  })

  it('formats and enumerates date windows', () => {
    expect(formatEspnDate('2026-06-11')).toBe('20260611')
    const days = enumerateDays('2026-06-09', '2026-06-11')
    expect(days).toEqual(['2026-06-09', '2026-06-10', '2026-06-11'])
    expect(enumerateDays('2026-06-12', '2026-06-09')).toEqual([])
    // Window cap at 14 days
    expect(enumerateDays('2026-06-01', '2026-07-01').length).toBeLessThanOrEqual(14)
  })
})

describe('group standings derivation', () => {
  // 4-team group: A, B, C, D
  const teamIds = ['A', 'B', 'C', 'D']
  const codes = new Map<string, string>([
    ['A', 'AAA'],
    ['B', 'BBB'],
    ['C', 'CCC'],
    ['D', 'DDD'],
  ])

  function ms(h: string, a: string, hs: number | null, as_: number | null): MatchScore {
    return { home_team_id: h, away_team_id: a, home_score: hs, away_score: as_ }
  }

  it('returns position 1 with most points, then GD, then GF', () => {
    // A beats B 2-0, A beats C 3-1, A draws D 1-1 -> 7pts, +5
    // B beats C 4-0, B draws D 0-0 -> 4pts, +3
    // C beats D 2-1 -> 3pts, -6 (now 0+1+4 in)
    // Recompute below
    const matches: MatchScore[] = [
      ms('A', 'B', 2, 0),
      ms('A', 'C', 3, 1),
      ms('A', 'D', 1, 1),
      ms('B', 'C', 4, 0),
      ms('B', 'D', 0, 0),
      ms('C', 'D', 2, 1),
    ]
    const out = computeGroupStandings(teamIds, codes, matches)
    expect(out.map((s) => s.team_id)).toEqual(['A', 'B', 'C', 'D'])
    expect(out[0].qualified_within_group).toBe(true)
    expect(out[1].qualified_within_group).toBe(true)
    expect(out[2].qualified_within_group).toBe(false)
  })

  it('falls back to team code alphabetical to stay deterministic on full ties', () => {
    // Two teams (A and B) end identical on all stats; A should win on code.
    const matches: MatchScore[] = [
      ms('A', 'C', 1, 0), // A: +1
      ms('B', 'D', 1, 0), // B: +1
      ms('C', 'B', 0, 0), // 0-0
      ms('D', 'A', 0, 0), // 0-0
      ms('A', 'B', 0, 0), // 0-0
      ms('C', 'D', 0, 0), // 0-0
    ]
    const out = computeGroupStandings(teamIds, codes, matches)
    // A: P3 W1 D2 L0 = 5pts +1 / B: P3 W1 D2 L0 = 5pts +1 — tied. A < B by code.
    expect(out[0].team_id).toBe('A')
    expect(out[1].team_id).toBe('B')
  })

  it('handles partial data — uncompleted matches do not flip positions', () => {
    const matches: MatchScore[] = [
      ms('A', 'B', 3, 0),
      ms('C', 'D', null, null), // not played yet
    ]
    const out = computeGroupStandings(teamIds, codes, matches)
    expect(out[0].team_id).toBe('A')
    expect(out[0].row.played).toBe(1)
    // C and D haven't played anyone yet — fall to bottom by tiebreakers
    expect(out.find((s) => s.team_id === 'C')?.row.played).toBe(0)
  })

  it('selectBestThirdPlaced takes the top N by the same comparator', () => {
    const rows = [
      { team_id: 'X', code: 'XXX', played: 3, won: 1, drawn: 1, lost: 1, gf: 4, ga: 3, gd: 1, points: 4 },
      { team_id: 'Y', code: 'YYY', played: 3, won: 1, drawn: 1, lost: 1, gf: 4, ga: 3, gd: 1, points: 4 },
      { team_id: 'Z', code: 'ZZZ', played: 3, won: 0, drawn: 3, lost: 0, gf: 1, ga: 1, gd: 0, points: 3 },
    ]
    const picked = selectBestThirdPlaced(rows, 2)
    expect(picked.has('X')).toBe(true)
    expect(picked.has('Y')).toBe(true)
    expect(picked.has('Z')).toBe(false)
    expect(selectBestThirdPlaced(rows, 0).size).toBe(0)
  })
})
