import type { KnockoutMatchWithTeams, Team } from '@/lib/types'

// ============================================================================
// Bracket resolver
// ----------------------------------------------------------------------------
// A player fills out their whole bracket before the knockout stage starts, but
// only the Round of 32 slots hold real (admin-placed) teams. Every later round
// references its feeders with a "W{matchNumber}" source. To let a player pick a
// winner for every match through to the Final, each downstream match's two
// participants must flow from the player's OWN predicted winners.
//
// These helpers are pure so the same logic runs client-side (to render the
// fillable bracket) and server-side (to validate + prune a submitted bracket).
// ============================================================================

/** Minimal shape needed to resolve a bracket (server passes the raw row). */
export interface BracketMatchLike {
  id: string
  match_number: number
  home_team_id: string | null
  away_team_id: string | null
  home_source: string | null
  away_source: string | null
}

export interface ParticipantIds {
  homeTeamId: string | null
  awayTeamId: string | null
}

const W_SOURCE = /^W(\d+)$/

/**
 * Resolve the effective participants of every match and the *validated*
 * predicted winner per match.
 *
 * - A real `home_team_id`/`away_team_id` (admin-placed R32 slot, or an actual
 *   result) is always used as-is.
 * - Otherwise a `W{n}` source resolves to the player's predicted winner of
 *   match n (null/TBD until they pick it).
 * - A prediction only counts as a valid winner when it is actually one of that
 *   match's two effective participants. Downstream `W` sources read these
 *   validated winners, so changing an upstream pick automatically invalidates
 *   (prunes) any downstream pick that depended on the team that was dropped.
 *
 * Matches are processed in `match_number` order, which is also feeder order
 * (R32 = 1..16, R16 = 17..24, …), so a single forward pass resolves everything.
 */
export function resolveParticipantIds(
  matches: BracketMatchLike[],
  predictions: Record<string, string | null>
): {
  participants: Map<string, ParticipantIds>
  validWinners: Map<string, string | null>
} {
  const byNumber = new Map<number, BracketMatchLike>()
  for (const m of matches) byNumber.set(m.match_number, m)

  const participants = new Map<string, ParticipantIds>()
  const validWinners = new Map<string, string | null>()

  const ordered = [...matches].sort((a, b) => a.match_number - b.match_number)

  const resolveSlot = (teamId: string | null, source: string | null): string | null => {
    if (teamId) return teamId
    if (!source) return null
    const w = source.match(W_SOURCE)
    if (w) {
      const feeder = byNumber.get(parseInt(w[1], 10))
      if (feeder) return validWinners.get(feeder.id) ?? null
    }
    // A group source (e.g. "1A", "3C/D/E") that hasn't been resolved to an
    // actual team_id yet is not selectable.
    return null
  }

  for (const m of ordered) {
    const homeTeamId = resolveSlot(m.home_team_id, m.home_source)
    const awayTeamId = resolveSlot(m.away_team_id, m.away_source)
    participants.set(m.id, { homeTeamId, awayTeamId })

    const pick = predictions[m.id] ?? null
    validWinners.set(m.id, pick && (pick === homeTeamId || pick === awayTeamId) ? pick : null)
  }

  return { participants, validWinners }
}

export interface ResolvedMatch {
  homeTeamId: string | null
  awayTeamId: string | null
  homeTeam: Team | null
  awayTeam: Team | null
  /** The player's validated predicted winner for this match (null = unpicked). */
  predictedWinnerId: string | null
}

/**
 * Client-facing wrapper: resolves effective participants AND attaches the `Team`
 * objects for rendering. Every team in the bracket appears in some R32 slot, so
 * the team lookup is built from the matches' joined `home_team`/`away_team`.
 */
export function resolveBracket(
  matches: KnockoutMatchWithTeams[],
  predictions: Record<string, string | null>
): Map<string, ResolvedMatch> {
  const teamById = new Map<string, Team>()
  for (const m of matches) {
    if (m.home_team) teamById.set(m.home_team.id, m.home_team)
    if (m.away_team) teamById.set(m.away_team.id, m.away_team)
    if (m.winner_team) teamById.set(m.winner_team.id, m.winner_team)
  }

  const { participants, validWinners } = resolveParticipantIds(matches, predictions)

  const result = new Map<string, ResolvedMatch>()
  for (const m of matches) {
    const p = participants.get(m.id) ?? { homeTeamId: null, awayTeamId: null }
    result.set(m.id, {
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      homeTeam: p.homeTeamId ? teamById.get(p.homeTeamId) ?? null : null,
      awayTeam: p.awayTeamId ? teamById.get(p.awayTeamId) ?? null : null,
      predictedWinnerId: validWinners.get(m.id) ?? null,
    })
  }
  return result
}

/** Convert a predictions array into the `matchId -> winnerId` record the resolver expects. */
export function predictionsToRecord(
  predictions: { match_id: string; predicted_winner_id: string | null }[]
): Record<string, string | null> {
  const rec: Record<string, string | null> = {}
  for (const p of predictions) rec[p.match_id] = p.predicted_winner_id
  return rec
}
