import { describe, it, expect } from 'vitest'
import { computeGroupStageCertainty, type GroupInput } from '@/lib/results/group-certainty'
import type { MatchScore } from '@/lib/results/standings'

// Codes == ids for these tests.
function codes(ids: string[]): Map<string, string> {
  return new Map(ids.map((id) => [id, id]))
}
const m = (h: string, hs: number | null, as: number | null, a: string): MatchScore => ({
  home_team_id: h,
  home_score: hs,
  away_score: as,
  away_team_id: a,
})

describe('computeGroupStageCertainty — live Group A (wc-2026)', () => {
  // MEX 2-0 RSA, KOR 2-1 CZE, CZE 1-1 RSA, MEX 1-0 KOR; CZE-MEX and RSA-KOR unplayed.
  const teamIds = ['MEX', 'KOR', 'CZE', 'RSA']
  const group: GroupInput = {
    group_id: 'A',
    team_ids: teamIds,
    matches: [
      m('MEX', 2, 0, 'RSA'),
      m('KOR', 2, 1, 'CZE'),
      m('CZE', 1, 1, 'RSA'),
      m('MEX', 1, 0, 'KOR'),
      m('CZE', null, null, 'MEX'),
      m('RSA', null, null, 'KOR'),
    ],
  }
  const cert = computeGroupStageCertainty([group], codes(teamIds), 8)

  it('Mexico (6 pts) has CLINCHED qualification', () => {
    expect(cert.get('MEX')!.qualified).toBe(true)
    expect(cert.get('MEX')!.eliminated).toBe(false)
  })

  it("but Mexico's exact 1st place is NOT yet locked (could be caught on GD)", () => {
    expect(cert.get('MEX')!.position_certain).toBe(false)
  })

  it('no other team is decided yet (still all to play for)', () => {
    for (const id of ['KOR', 'CZE', 'RSA']) {
      expect(cert.get(id)!.qualified, `${id} qualified`).toBe(false)
      expect(cert.get(id)!.eliminated, `${id} eliminated`).toBe(false)
    }
  })
})

describe('computeGroupStageCertainty — completed group', () => {
  const teamIds = ['A', 'B', 'C', 'D']
  // A wins all, B beats C&D, C beats D, D loses all -> 9/6/3/0.
  const group: GroupInput = {
    group_id: 'G',
    team_ids: teamIds,
    matches: [
      m('A', 1, 0, 'B'),
      m('A', 1, 0, 'C'),
      m('A', 1, 0, 'D'),
      m('B', 1, 0, 'C'),
      m('B', 1, 0, 'D'),
      m('C', 1, 0, 'D'),
    ],
  }

  it('top 2 are qualified with their exact position locked; 3rd/4th out when no thirds qualify', () => {
    const cert = computeGroupStageCertainty([group], codes(teamIds), 0)
    expect(cert.get('A')).toMatchObject({ qualified: true, position_certain: true, eliminated: false, current_position: 1 })
    expect(cert.get('B')).toMatchObject({ qualified: true, position_certain: true, eliminated: false, current_position: 2 })
    expect(cert.get('C')).toMatchObject({ qualified: false, position_certain: true, eliminated: true, current_position: 3 })
    expect(cert.get('D')).toMatchObject({ qualified: false, position_certain: true, eliminated: true, current_position: 4 })
  })
})

describe('computeGroupStageCertainty — best-3rd across complete groups', () => {
  const g1 = ['A1', 'B1', 'C1', 'D1']
  const g2 = ['A2', 'B2', 'C2', 'D2']
  // Group 1: C1 finishes 3rd on 3 pts. Group 2: C2 finishes 3rd on 1 pt.
  const group1: GroupInput = {
    group_id: 'G1',
    team_ids: g1,
    matches: [m('A1', 1, 0, 'B1'), m('A1', 1, 0, 'C1'), m('A1', 1, 0, 'D1'), m('B1', 1, 0, 'C1'), m('B1', 1, 0, 'D1'), m('C1', 1, 0, 'D1')],
  }
  // Group 2: A2 9, B2 6; C2 & D2 both 1 pt (0-0), C2 takes 3rd on code.
  const group2: GroupInput = {
    group_id: 'G2',
    team_ids: g2,
    matches: [m('A2', 1, 0, 'B2'), m('A2', 1, 0, 'C2'), m('A2', 1, 0, 'D2'), m('B2', 1, 0, 'C2'), m('B2', 1, 0, 'D2'), m('C2', 0, 0, 'D2')],
  }

  it('promotes only the better 3rd-placed team when one best-third spot exists', () => {
    const cert = computeGroupStageCertainty([group1, group2], codes([...g1, ...g2]), 1)
    // C1 (3 pts, 3rd) qualifies as the best third; C2 (1 pt, 3rd) is eliminated.
    expect(cert.get('C1')).toMatchObject({ qualified: true, eliminated: false, position_certain: true })
    expect(cert.get('C2')).toMatchObject({ qualified: false, eliminated: true, position_certain: true })
  })
})
