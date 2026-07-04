import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { secureEquals } from '@/lib/secure-compare'
import { fetchEspnMatches, type EspnMatch } from '@/lib/results/espn-source'
import { type MatchScore } from '@/lib/results/standings'
import { computeGroupStageCertainty, type GroupInput } from '@/lib/results/group-certainty'
import { calculateAllScores } from '@/lib/scoring'

// Pulls completed scores from ESPN's WC scoreboard and writes them into our
// fixtures tables. Then derives per-group standings (and best-thirds where
// applicable) so the existing scoring pipeline keeps working.
//
// Two auth paths:
//   - x-cron-secret header matches CRON_SECRET  (used by pg_cron)
//   - Logged-in admin user                     (used by the manual button)

interface SyncSummary {
  source: 'espn'
  window: { start: string; end: string }
  fetched: number
  groupMatchesUpdated: number
  knockoutMatchesUpdated: number
  knockoutSlotsAdvanced: number
  groupResultsWritten: number
  unmappedAbbrevs: string[]
  groupsWithDerivedStandings: number
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET
  const cronAuthed =
    !!cronSecret && !!expectedSecret && secureEquals(cronSecret, expectedSecret)

  if (!cronAuthed) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()

  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name, slug, third_place_qualifiers_count')
    .eq('slug', slug)
    .single()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }

  // Default window: 3 days back through 1 day forward, in UTC. Hourly cron
  // calls will re-sync the same window — upserts are idempotent.
  const url = new URL(request.url)
  const start =
    url.searchParams.get('start') ?? isoDay(new Date(Date.now() - 3 * 86_400_000))
  const end =
    url.searchParams.get('end') ?? isoDay(new Date(Date.now() + 1 * 86_400_000))

  const espnMatches = await fetchEspnMatches({ startDate: start, endDate: end })

  // Build code -> team_id map across all teams in this tournament's groups
  // (so we don't accidentally apply scores to teams from other tournaments).
  const { data: groupTeamRows } = await admin
    .from('group_teams')
    .select('team_id, group_id, group:groups!inner(tournament_id), team:teams(id, code)')
    .eq('group.tournament_id', tournament.id)

  type GTRow = {
    team_id: string
    group_id: string
    team: { id: string; code: string } | null
  }
  const groupTeamList = (groupTeamRows ?? []) as unknown as GTRow[]

  const codeToTeamId = new Map<string, string>()
  const teamIdToCode = new Map<string, string>()
  const teamGroupId = new Map<string, string>()
  for (const gt of groupTeamList) {
    if (!gt.team) continue
    codeToTeamId.set(gt.team.code, gt.team.id)
    teamIdToCode.set(gt.team.id, gt.team.code)
    teamGroupId.set(gt.team.id, gt.group_id)
  }

  // KO teams may not appear in group_teams (e.g. via advancement). Map any
  // additional team codes used by knockout_matches that we haven't seen yet.
  const { data: koMatches } = await admin
    .from('knockout_matches')
    .select('id, match_number, scheduled_at, home_team_id, away_team_id, winner_team_id, home_score, away_score')
    .eq('tournament_id', tournament.id)

  const koTeamIds = new Set<string>()
  for (const m of koMatches ?? []) {
    if (m.home_team_id) koTeamIds.add(m.home_team_id)
    if (m.away_team_id) koTeamIds.add(m.away_team_id)
  }
  const missingKoTeamIds = [...koTeamIds].filter((id) => !teamIdToCode.has(id))
  if (missingKoTeamIds.length > 0) {
    const { data: extra } = await admin
      .from('teams')
      .select('id, code')
      .in('id', missingKoTeamIds)
    for (const t of extra ?? []) {
      codeToTeamId.set(t.code, t.id)
      teamIdToCode.set(t.id, t.code)
    }
  }

  // Index our fixtures by sorted team-id pair so we can match ESPN events.
  const { data: groupMatches } = await admin
    .from('group_matches')
    .select('id, group_id, home_team_id, away_team_id, scheduled_at, home_score, away_score, group:groups!inner(tournament_id)')
    .eq('group.tournament_id', tournament.id)

  type DbGroupMatch = {
    id: string
    group_id: string
    home_team_id: string | null
    away_team_id: string | null
    scheduled_at: string | null
    home_score: number | null
    away_score: number | null
  }
  const dbGroupMatches = (groupMatches ?? []) as unknown as DbGroupMatch[]

  const pairKey = (a: string, b: string) => [a, b].sort().join(':')
  const groupMatchByPair = new Map<string, DbGroupMatch>()
  for (const m of dbGroupMatches) {
    if (m.home_team_id && m.away_team_id) {
      groupMatchByPair.set(pairKey(m.home_team_id, m.away_team_id), m)
    }
  }
  const koMatchByPair = new Map<string, NonNullable<typeof koMatches>[number]>()
  for (const m of koMatches ?? []) {
    if (m.home_team_id && m.away_team_id) {
      koMatchByPair.set(pairKey(m.home_team_id, m.away_team_id), m)
    }
  }

  const unmapped = new Set<string>()
  const touchedGroupIds = new Set<string>()
  let groupUpdated = 0
  let koUpdated = 0

  for (const ev of espnMatches) {
    if (ev.state !== 'post') continue // Only write finals.
    if (!ev.completed) continue

    const homeId = codeToTeamId.get(ev.homeCode)
    const awayId = codeToTeamId.get(ev.awayCode)
    if (!homeId) unmapped.add(ev.homeCode)
    if (!awayId) unmapped.add(ev.awayCode)
    if (!homeId || !awayId) continue

    const key = pairKey(homeId, awayId)

    const gm = groupMatchByPair.get(key)
    if (gm) {
      const ours = orientScores(gm.home_team_id!, homeId, ev)
      if (gm.home_score !== ours.home || gm.away_score !== ours.away) {
        const { error } = await admin
          .from('group_matches')
          .update({ home_score: ours.home, away_score: ours.away })
          .eq('id', gm.id)
        if (error) {
          console.error(`[sync-results] group_matches update failed: ${error.message}`)
        } else {
          groupUpdated++
          touchedGroupIds.add(gm.group_id)
        }
      }
      continue
    }

    const km = koMatchByPair.get(key)
    if (km) {
      const ours = orientScores(km.home_team_id!, homeId, ev)
      const derivedWinner = pickKoWinner(
        km.home_team_id!,
        km.away_team_id!,
        ours,
        ev,
        codeToTeamId
      )
      // Never overwrite an existing winner with null (admin may have set it).
      const winnerId = derivedWinner ?? km.winner_team_id
      if (
        km.home_score !== ours.home ||
        km.away_score !== ours.away ||
        km.winner_team_id !== winnerId
      ) {
        const { error } = await admin
          .from('knockout_matches')
          .update({
            home_score: ours.home,
            away_score: ours.away,
            winner_team_id: winnerId,
          })
          .eq('id', km.id)
        if (error) {
          console.error(`[sync-results] knockout_matches update failed: ${error.message}`)
        } else {
          koUpdated++
        }
      }
      continue
    }
  }

  // Propagate every decided knockout winner into the next round's slot. The
  // manual game-result path does this inline via advanceWinner(); the cron path
  // MUST do it too, or later rounds never populate — their home/away stay null
  // and the fixtures/bracket UI shows "TBC". We re-read winners from the DB
  // (not just this run's updates) so historically-decided rounds self-heal, and
  // the cascade climbs one round per run as each round completes. Idempotent:
  // advanceWinner only writes when the target slot differs.
  let koSlotsAdvanced = 0
  const { data: decidedKo } = await admin
    .from('knockout_matches')
    .select('match_number, winner_team_id')
    .eq('tournament_id', tournament.id)
    .not('winner_team_id', 'is', null)
  for (const m of decidedKo ?? []) {
    if (!m.winner_team_id) continue
    koSlotsAdvanced += await advanceWinner(admin, tournament.id, m.match_number, m.winner_team_id)
  }

  // Re-derive standings only for the groups whose matches we just touched.
  // (This is also safe to run for unchanged groups; we limit purely for speed.)
  let groupResultsWritten = 0
  let groupsWithDerivedStandings = 0
  const thirdPlaceCount = tournament.third_place_qualifiers_count ?? 0

  const matchesByGroup = new Map<string, DbGroupMatch[]>()
  for (const m of dbGroupMatches) {
    const arr = matchesByGroup.get(m.group_id) ?? []
    arr.push(m)
    matchesByGroup.set(m.group_id, arr)
  }
  const teamIdsByGroup = new Map<string, string[]>()
  for (const gt of groupTeamList) {
    const arr = teamIdsByGroup.get(gt.group_id) ?? []
    arr.push(gt.team_id)
    teamIdsByGroup.set(gt.group_id, arr)
  }

  const isGroupComplete = (gid: string) => {
    const ms = matchesByGroup.get(gid) ?? []
    return ms.length > 0 && ms.every((m) => m.home_score != null && m.away_score != null)
  }
  // Best-N thirds depend on every group's final table, so we always hand the
  // certainty solver ALL groups; we only WRITE rows for groups touched this run
  // (or every group once they're all complete, so 3rd place resolves).
  const allGroupsComplete = [...teamIdsByGroup.keys()].every(isGroupComplete)
  const groupIdsToProcess =
    allGroupsComplete || touchedGroupIds.size === 0
      ? [...teamIdsByGroup.keys()]
      : [...touchedGroupIds]

  const groupInputs: GroupInput[] = []
  for (const [gid, teamIds] of teamIdsByGroup.entries()) {
    if (teamIds.length === 0) continue
    const ms = matchesByGroup.get(gid) ?? []
    groupInputs.push({
      group_id: gid,
      team_ids: teamIds,
      matches: ms.map<MatchScore>((m) => ({
        home_team_id: m.home_team_id!,
        away_team_id: m.away_team_id!,
        home_score: m.home_score,
        away_score: m.away_score,
      })),
    })
  }

  // What is GUARANTEED so far — qualified / eliminated / exact position locked.
  const certainty = computeGroupStageCertainty(groupInputs, teamIdToCode, thirdPlaceCount)

  for (const gid of groupIdsToProcess) {
    const teamIds = teamIdsByGroup.get(gid) ?? []
    if (teamIds.length === 0) continue
    const ms = matchesByGroup.get(gid) ?? []
    const finishedCount = ms.filter((m) => m.home_score != null && m.away_score != null).length
    if (finishedCount === 0) continue // group not kicked off yet — no running table
    groupsWithDerivedStandings++

    for (const teamId of teamIds) {
      const c = certainty.get(teamId)
      if (!c) continue
      const next = {
        final_position: c.current_position,
        qualified: c.qualified,
        position_certain: c.position_certain,
        eliminated: c.eliminated,
      }

      const { data: existing } = await admin
        .from('group_results')
        .select('id, final_position, qualified, position_certain, eliminated')
        .eq('group_id', gid)
        .eq('team_id', teamId)
        .maybeSingle()

      if (existing) {
        if (
          existing.final_position !== next.final_position ||
          existing.qualified !== next.qualified ||
          existing.position_certain !== next.position_certain ||
          existing.eliminated !== next.eliminated
        ) {
          const { error } = await admin.from('group_results').update(next).eq('id', existing.id)
          if (error) console.error(`[sync-results] group_results update failed: ${error.message}`)
          else groupResultsWritten++
        }
      } else {
        const { error } = await admin
          .from('group_results')
          .insert({ group_id: gid, team_id: teamId, ...next })
        if (error) console.error(`[sync-results] group_results insert failed: ${error.message}`)
        else groupResultsWritten++
      }
    }
  }

  const summary: SyncSummary = {
    source: 'espn',
    window: { start, end },
    fetched: espnMatches.length,
    groupMatchesUpdated: groupUpdated,
    knockoutMatchesUpdated: koUpdated,
    knockoutSlotsAdvanced: koSlotsAdvanced,
    groupResultsWritten,
    unmappedAbbrevs: [...unmapped].sort(),
    groupsWithDerivedStandings,
  }

  // Whenever results changed, re-score so points + leaderboard stay in lockstep
  // with the certainty/colour we just wrote (the colour reads group_results; the
  // points/ranks read tournament_entries — they must not drift apart).
  if (groupUpdated > 0 || koUpdated > 0 || koSlotsAdvanced > 0 || groupResultsWritten > 0) {
    try {
      await calculateAllScores(tournament.id)
    } catch (err) {
      console.error(`[sync-results] re-score failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  return NextResponse.json(summary)
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function orientScores(
  ourHomeTeamId: string,
  espnHomeTeamId: string,
  ev: EspnMatch
): { home: number; away: number } {
  if (ourHomeTeamId === espnHomeTeamId) {
    return { home: ev.homeScore, away: ev.awayScore }
  }
  return { home: ev.awayScore, away: ev.homeScore }
}

// Mirror of game-result's advanceWinner, but idempotent + returns a write count.
// Writes this match's winner into any next-round slot fed by "W{matchNumber}",
// skipping slots that already hold the right team so re-running the hourly cron
// is cheap and non-clobbering.
async function advanceWinner(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  matchNumber: number,
  winnerTeamId: string
): Promise<number> {
  const winnerSource = `W${matchNumber}`

  const { data: nextMatches } = await admin
    .from('knockout_matches')
    .select('id, home_source, away_source, home_team_id, away_team_id')
    .eq('tournament_id', tournamentId)
    .or(`home_source.eq.${winnerSource},away_source.eq.${winnerSource}`)

  if (!nextMatches || nextMatches.length === 0) return 0

  let written = 0
  for (const nm of nextMatches) {
    if (nm.home_source === winnerSource && nm.home_team_id !== winnerTeamId) {
      const { error } = await admin
        .from('knockout_matches')
        .update({ home_team_id: winnerTeamId })
        .eq('id', nm.id)
      if (error) console.error(`[sync-results] advance home_team_id failed: ${error.message}`)
      else written++
    }
    if (nm.away_source === winnerSource && nm.away_team_id !== winnerTeamId) {
      const { error } = await admin
        .from('knockout_matches')
        .update({ away_team_id: winnerTeamId })
        .eq('id', nm.id)
      if (error) console.error(`[sync-results] advance away_team_id failed: ${error.message}`)
      else written++
    }
  }
  return written
}

function pickKoWinner(
  ourHomeTeamId: string,
  ourAwayTeamId: string,
  orientedScores: { home: number; away: number },
  ev: EspnMatch,
  codeToTeamId: Map<string, string>
): string | null {
  // Prefer ESPN's explicit winner flag (handles ET/PEN cleanly).
  if (ev.winnerCode) {
    const id = codeToTeamId.get(ev.winnerCode)
    if (id === ourHomeTeamId || id === ourAwayTeamId) return id ?? null
  }
  if (orientedScores.home > orientedScores.away) return ourHomeTeamId
  if (orientedScores.away > orientedScores.home) return ourAwayTeamId
  return null
}
