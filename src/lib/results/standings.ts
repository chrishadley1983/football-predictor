// Derive group final positions (1..n) and qualified flag from completed
// group_matches scores. Uses points -> goal-difference -> goals-for, falling
// back to team code alphabetical to stay deterministic. Head-to-head is NOT
// implemented — if FIFA's tiebreaker (H2H, fair-play, drawing of lots) gives a
// different order, an admin can override on /admin/tournaments/[slug]/results.

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

  const sorted = [...rows.values()].sort(compareTeamRows)

  return sorted.map((row, idx) => ({
    team_id: row.team_id,
    final_position: idx + 1,
    qualified_within_group: idx < 2,
    row,
  }))
}

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
