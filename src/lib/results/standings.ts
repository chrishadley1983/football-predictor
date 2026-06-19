// Derive group final positions (1..n) from group_matches scores using the
// OFFICIAL 2026 FIFA World Cup tiebreaker order: points, then — among teams
// level on points — head-to-head (points, goal difference, goals scored in the
// matches between them), then overall goal difference, overall goals scored,
// and finally team code (a deterministic stand-in for fair play / FIFA ranking).
// NB: 2026 puts head-to-head BEFORE overall goal difference (a change from
// previous World Cups).

export interface MatchScore {
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
}

export interface TeamRow {
  team_id: string
  code: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
}

export interface GroupStanding {
  team_id: string
  final_position: number
  /** Per-group qualified: true for top 2 (and possibly 3rd if best-thirds promoted). */
  qualified_within_group: boolean
  /** Snapshot for cross-group "best 3rd-placed" comparisons. */
  row: TeamRow
}

export function computeGroupStandings(
  teamIds: string[],
  teamCodeById: Map<string, string>,
  matches: MatchScore[]
): GroupStanding[] {
  const rows = new Map<string, TeamRow>()
  for (const id of teamIds) {
    rows.set(id, {
      team_id: id,
      code: teamCodeById.get(id) ?? '',
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    })
  }

  for (const m of matches) {
    if (m.home_score == null || m.away_score == null) continue
    const home = rows.get(m.home_team_id)
    const away = rows.get(m.away_team_id)
    if (!home || !away) continue

    home.played++
    away.played++
    home.gf += m.home_score
    home.ga += m.away_score
    away.gf += m.away_score
    away.ga += m.home_score

    if (m.home_score > m.away_score) {
      home.won++
      away.lost++
      home.points += 3
    } else if (m.home_score < m.away_score) {
      away.won++
      home.lost++
      away.points += 3
    } else {
      home.drawn++
      away.drawn++
      home.points += 1
      away.points += 1
    }
  }

  for (const r of rows.values()) r.gd = r.gf - r.ga

  const sorted = orderWithinGroup([...rows.values()], matches)

  return sorted.map((row, idx) => ({
    team_id: row.team_id,
    final_position: idx + 1,
    qualified_within_group: idx < 2,
    row,
  }))
}

/** Head-to-head points/GD/GF among a specific set of teams (matches between them). */
function headToHead(teamIds: string[], matches: MatchScore[]): Map<string, { pts: number; gd: number; gf: number }> {
  const set = new Set(teamIds)
  const stats = new Map(teamIds.map((id) => [id, { pts: 0, gd: 0, gf: 0 }]))
  for (const m of matches) {
    if (m.home_score == null || m.away_score == null) continue
    if (!set.has(m.home_team_id) || !set.has(m.away_team_id)) continue
    const h = stats.get(m.home_team_id)!
    const a = stats.get(m.away_team_id)!
    h.gf += m.home_score
    h.gd += m.home_score - m.away_score
    a.gf += m.away_score
    a.gd += m.away_score - m.home_score
    if (m.home_score > m.away_score) h.pts += 3
    else if (m.home_score < m.away_score) a.pts += 3
    else {
      h.pts += 1
      a.pts += 1
    }
  }
  return stats
}

/**
 * Order teams within a group by the 2026 tiebreakers. Teams level on points are
 * separated by a head-to-head mini-table FIRST, then overall GD/GF, then code.
 */
function orderWithinGroup(rows: TeamRow[], matches: MatchScore[]): TeamRow[] {
  const byPoints = new Map<number, TeamRow[]>()
  for (const r of rows) {
    const arr = byPoints.get(r.points) ?? []
    arr.push(r)
    byPoints.set(r.points, arr)
  }
  const result: TeamRow[] = []
  for (const pts of [...byPoints.keys()].sort((a, b) => b - a)) {
    const grp = byPoints.get(pts)!
    if (grp.length === 1) {
      result.push(grp[0])
      continue
    }
    const h2h = headToHead(grp.map((r) => r.team_id), matches)
    grp.sort((a, b) => {
      const ha = h2h.get(a.team_id)!
      const hb = h2h.get(b.team_id)!
      if (hb.pts !== ha.pts) return hb.pts - ha.pts
      if (hb.gd !== ha.gd) return hb.gd - ha.gd
      if (hb.gf !== ha.gf) return hb.gf - ha.gf
      if (b.gd !== a.gd) return b.gd - a.gd
      if (b.gf !== a.gf) return b.gf - a.gf
      return a.code.localeCompare(b.code)
    })
    result.push(...grp)
  }
  return result
}

/** Cross-group comparison (e.g. best 3rd-placed). FIFA uses overall points, GD,
 *  GF (no head-to-head — the teams are in different groups). */
export function compareTeamRows(a: TeamRow, b: TeamRow): number {
  if (b.points !== a.points) return b.points - a.points
  if (b.gd !== a.gd) return b.gd - a.gd
  if (b.gf !== a.gf) return b.gf - a.gf
  return a.code.localeCompare(b.code)
}

/** Across the third-placed teams of all groups, mark the top N as qualified.
 *  Uses the same comparator as within-group ordering. */
export function selectBestThirdPlaced(
  thirdPlacedRows: TeamRow[],
  qualifiersCount: number
): Set<string> {
  if (qualifiersCount <= 0) return new Set()
  const sorted = [...thirdPlacedRows].sort(compareTeamRows)
  return new Set(sorted.slice(0, qualifiersCount).map((r) => r.team_id))
}
