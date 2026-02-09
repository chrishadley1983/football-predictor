import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KnockoutRound, BracketSide } from '@/lib/types'

// Standard FIFA R16 bracket structure (8 groups)
const R16_BRACKET: [number, string, string, BracketSide][] = [
  [1, '1A', '2B', 'left'],
  [2, '1C', '2D', 'left'],
  [3, '1E', '2F', 'left'],
  [4, '1G', '2H', 'left'],
  [5, '1B', '2A', 'right'],
  [6, '1D', '2C', 'right'],
  [7, '1F', '2E', 'right'],
  [8, '1H', '2G', 'right'],
]

const QF_BRACKET_8: [number, string, string, BracketSide][] = [
  [9, 'W1', 'W2', 'left'],
  [10, 'W3', 'W4', 'left'],
  [11, 'W5', 'W6', 'right'],
  [12, 'W7', 'W8', 'right'],
]

const SF_BRACKET_8: [number, string, string, BracketSide][] = [
  [13, 'W9', 'W10', 'left'],
  [14, 'W11', 'W12', 'right'],
]

const FINAL_BRACKET_8: [number, string, string] = [15, 'W13', 'W14']

// WC 2026 bracket structure (12 groups, 48 teams)
// Round of 32: 16 matches (group winners + runners-up + best 3rd-place teams)
const R32_BRACKET: [number, string, string, BracketSide][] = [
  [1, '1A', '3C/D/E', 'left'],
  [2, '2A', '2C', 'left'],
  [3, '1B', '3A/D/E', 'left'],
  [4, '2B', '2D', 'left'],
  [5, '1E', '3A/B/C', 'left'],
  [6, '2E', '2G', 'left'],
  [7, '1F', '3B/G/H', 'left'],
  [8, '2F', '2H', 'left'],
  [9, '1C', '3F/G/H', 'right'],
  [10, '2I', '2K', 'right'],
  [11, '1D', '3I/J/K', 'right'],
  [12, '2J', '2L', 'right'],
  [13, '1G', '3I/J/L', 'right'],
  [14, '1H', '3F/K/L', 'right'],
  [15, '1I', '1L', 'right'],
  [16, '1J', '1K', 'right'],
]

// R16 for 12-group: Winners of R32 matches
const R16_BRACKET_12: [number, string, string, BracketSide][] = [
  [17, 'W1', 'W2', 'left'],
  [18, 'W3', 'W4', 'left'],
  [19, 'W5', 'W6', 'left'],
  [20, 'W7', 'W8', 'left'],
  [21, 'W9', 'W10', 'right'],
  [22, 'W11', 'W12', 'right'],
  [23, 'W13', 'W14', 'right'],
  [24, 'W15', 'W16', 'right'],
]

const QF_BRACKET_12: [number, string, string, BracketSide][] = [
  [25, 'W17', 'W18', 'left'],
  [26, 'W19', 'W20', 'left'],
  [27, 'W21', 'W22', 'right'],
  [28, 'W23', 'W24', 'right'],
]

const SF_BRACKET_12: [number, string, string, BracketSide][] = [
  [29, 'W25', 'W26', 'left'],
  [30, 'W27', 'W28', 'right'],
]

const FINAL_BRACKET_12: [number, string, string] = [31, 'W29', 'W30']

interface TeamPayload {
  name: string
  code: string
  flag_emoji: string
}

interface MatchPayload {
  home: string
  away: string
  scheduled_at?: string
  venue?: string
}

interface GroupPayload {
  name: string
  teams: TeamPayload[]
  matches?: MatchPayload[]
}

interface KnockoutConfigPayload {
  round: string
  points_value: number
  match_count: number
}

interface KnockoutDatePayload {
  match_number: number
  scheduled_at?: string
  venue?: string
}

interface SetupPayload {
  groups: GroupPayload[]
  knockout_config: KnockoutConfigPayload[]
  knockout_dates?: KnockoutDatePayload[]
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    const body: SetupPayload = await request.json()

    if (!body.groups || body.groups.length === 0) {
      return NextResponse.json({ error: 'At least one group is required' }, { status: 400 })
    }

    // Look up the tournament
    const { data: tournament, error: tournamentErr } = await admin
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (tournamentErr || !tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const tournamentId = tournament.id

    // Step 1: Upsert all teams by code
    const allTeams = body.groups.flatMap((g) => g.teams)
    const { data: teams, error: teamsErr } = await admin
      .from('teams')
      .upsert(
        allTeams.map((t) => ({
          name: t.name,
          code: t.code,
          flag_emoji: t.flag_emoji,
        })),
        { onConflict: 'code' }
      )
      .select()

    if (teamsErr || !teams) {
      return NextResponse.json(
        { error: `Failed to upsert teams: ${teamsErr?.message}` },
        { status: 500 }
      )
    }

    const teamIdByCode: Record<string, string> = {}
    const teamIdByName: Record<string, string> = {}
    for (const team of teams) {
      teamIdByCode[team.code] = team.id
      teamIdByName[team.name] = team.id
    }

    // Step 2: Delete existing groups/group_teams/group_matches for this tournament
    const { data: existingGroups } = await admin
      .from('groups')
      .select('id')
      .eq('tournament_id', tournamentId)

    if (existingGroups && existingGroups.length > 0) {
      const groupIds = existingGroups.map((g) => g.id)
      await admin.from('group_matches').delete().in('group_id', groupIds)
      await admin.from('group_teams').delete().in('group_id', groupIds)
      await admin.from('group_results').delete().in('group_id', groupIds)
      await admin.from('groups').delete().eq('tournament_id', tournamentId)
    }

    // Step 3: Create groups
    const { data: createdGroups, error: groupsErr } = await admin
      .from('groups')
      .insert(
        body.groups.map((g, index) => ({
          tournament_id: tournamentId,
          name: g.name,
          sort_order: index + 1,
        }))
      )
      .select()

    if (groupsErr || !createdGroups) {
      return NextResponse.json(
        { error: `Failed to create groups: ${groupsErr?.message}` },
        { status: 500 }
      )
    }

    // Step 4: Create group_teams assignments
    const groupTeamRecords: { group_id: string; team_id: string; seed_position: number }[] = []
    for (let i = 0; i < body.groups.length; i++) {
      const groupData = body.groups[i]
      const createdGroup = createdGroups[i]
      for (let j = 0; j < groupData.teams.length; j++) {
        const teamId = teamIdByCode[groupData.teams[j].code]
        if (teamId) {
          groupTeamRecords.push({
            group_id: createdGroup.id,
            team_id: teamId,
            seed_position: j + 1,
          })
        }
      }
    }

    const { error: groupTeamsErr } = await admin
      .from('group_teams')
      .insert(groupTeamRecords)

    if (groupTeamsErr) {
      return NextResponse.json(
        { error: `Failed to create group_teams: ${groupTeamsErr.message}` },
        { status: 500 }
      )
    }

    // Step 4b: Create group_matches from each group's match list
    const groupMatchRecords: {
      group_id: string
      home_team_id: string | null
      away_team_id: string | null
      match_number: number
      scheduled_at: string | null
      venue: string | null
      sort_order: number
    }[] = []

    for (let i = 0; i < body.groups.length; i++) {
      const groupData = body.groups[i]
      const createdGroup = createdGroups[i]
      if (groupData.matches && groupData.matches.length > 0) {
        for (let j = 0; j < groupData.matches.length; j++) {
          const m = groupData.matches[j]
          const homeTeamId = teamIdByCode[m.home] || teamIdByName[m.home] || null
          const awayTeamId = teamIdByCode[m.away] || teamIdByName[m.away] || null
          groupMatchRecords.push({
            group_id: createdGroup.id,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            match_number: j + 1,
            scheduled_at: m.scheduled_at || null,
            venue: m.venue || null,
            sort_order: j + 1,
          })
        }
      }
    }

    if (groupMatchRecords.length > 0) {
      const { error: groupMatchesErr } = await admin
        .from('group_matches')
        .insert(groupMatchRecords)

      if (groupMatchesErr) {
        return NextResponse.json(
          { error: `Failed to create group_matches: ${groupMatchesErr.message}` },
          { status: 500 }
        )
      }
    }

    // Step 5: Delete existing knockout matches and config
    await admin.from('knockout_matches').delete().eq('tournament_id', tournamentId)
    await admin.from('knockout_round_config').delete().eq('tournament_id', tournamentId)

    // Step 6: Build knockout bracket based on group count
    const knockoutConfig = body.knockout_config || [
      { round: 'round_of_16', points_value: 2, match_count: 8 },
      { round: 'quarter_final', points_value: 4, match_count: 4 },
      { round: 'semi_final', points_value: 8, match_count: 2 },
      { round: 'final', points_value: 16, match_count: 1 },
    ]

    // Create knockout_round_config
    const { error: configErr } = await admin
      .from('knockout_round_config')
      .insert(
        knockoutConfig.map((kc, i) => ({
          tournament_id: tournamentId,
          round: kc.round,
          points_value: kc.points_value,
          match_count: kc.match_count,
          sort_order: i + 1,
        }))
      )

    if (configErr) {
      return NextResponse.json(
        { error: `Failed to create knockout config: ${configErr.message}` },
        { status: 500 }
      )
    }

    // Step 7: Generate knockout matches
    const knockoutMatches: {
      tournament_id: string
      round: KnockoutRound
      match_number: number
      bracket_side: BracketSide | null
      home_source: string
      away_source: string
      points_value: number
      sort_order: number
      scheduled_at?: string | null
      venue?: string | null
    }[] = []

    const pointsByRound: Record<string, number> = {}
    for (const kc of knockoutConfig) {
      pointsByRound[kc.round] = kc.points_value
    }

    // Build knockout date lookup
    const knockoutDateLookup: Record<number, { scheduled_at?: string; venue?: string }> = {}
    if (body.knockout_dates) {
      for (const kd of body.knockout_dates) {
        knockoutDateLookup[kd.match_number] = {
          scheduled_at: kd.scheduled_at,
          venue: kd.venue,
        }
      }
    }

    if (body.groups.length === 8) {
      // Standard WC bracket (32 teams, 8 groups)
      for (const [matchNum, homeSrc, awaySrc, side] of R16_BRACKET) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'round_of_16',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['round_of_16'] ?? 2,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
      }

      for (const [matchNum, homeSrc, awaySrc, side] of QF_BRACKET_8) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'quarter_final',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['quarter_final'] ?? 4,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
      }

      for (const [matchNum, homeSrc, awaySrc, side] of SF_BRACKET_8) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'semi_final',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['semi_final'] ?? 8,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
      }

      const finalDates = knockoutDateLookup[FINAL_BRACKET_8[0]]
      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'final',
        match_number: FINAL_BRACKET_8[0],
        bracket_side: null,
        home_source: FINAL_BRACKET_8[1],
        away_source: FINAL_BRACKET_8[2],
        points_value: pointsByRound['final'] ?? 16,
        sort_order: FINAL_BRACKET_8[0],
        scheduled_at: finalDates?.scheduled_at || null,
        venue: finalDates?.venue || null,
      })
    } else if (body.groups.length === 12) {
      // WC 2026 bracket (48 teams, 12 groups)
      // Round of 32: 16 matches
      for (const [matchNum, homeSrc, awaySrc, side] of R32_BRACKET) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'round_of_32',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['round_of_32'] ?? 1,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
      }

      // Round of 16: 8 matches
      for (const [matchNum, homeSrc, awaySrc, side] of R16_BRACKET_12) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'round_of_16',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['round_of_16'] ?? 2,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
      }

      // Quarter-finals: 4 matches
      for (const [matchNum, homeSrc, awaySrc, side] of QF_BRACKET_12) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'quarter_final',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['quarter_final'] ?? 4,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
      }

      // Semi-finals: 2 matches
      for (const [matchNum, homeSrc, awaySrc, side] of SF_BRACKET_12) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'semi_final',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['semi_final'] ?? 8,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
      }

      // Final: 1 match
      const finalDates = knockoutDateLookup[FINAL_BRACKET_12[0]]
      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'final',
        match_number: FINAL_BRACKET_12[0],
        bracket_side: null,
        home_source: FINAL_BRACKET_12[1],
        away_source: FINAL_BRACKET_12[2],
        points_value: pointsByRound['final'] ?? 16,
        sort_order: FINAL_BRACKET_12[0],
        scheduled_at: finalDates?.scheduled_at || null,
        venue: finalDates?.venue || null,
      })
    } else if (body.groups.length === 6) {
      // Euros-style bracket (simplified: 16 teams qualify, best 3rd place teams)
      let matchNum = 1
      const qfCount = knockoutConfig.find((k) => k.round === 'quarter_final')?.match_count ?? 4
      for (let i = 0; i < qfCount; i++) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'quarter_final',
          match_number: matchNum,
          bracket_side: i < qfCount / 2 ? 'left' : 'right',
          home_source: `QF${matchNum}H`,
          away_source: `QF${matchNum}A`,
          points_value: pointsByRound['quarter_final'] ?? 4,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
        matchNum++
      }
      for (let i = 0; i < 2; i++) {
        const dates = knockoutDateLookup[matchNum]
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'semi_final',
          match_number: matchNum,
          bracket_side: i === 0 ? 'left' : 'right',
          home_source: `W${i * 2 + 1}`,
          away_source: `W${i * 2 + 2}`,
          points_value: pointsByRound['semi_final'] ?? 8,
          sort_order: matchNum,
          scheduled_at: dates?.scheduled_at || null,
          venue: dates?.venue || null,
        })
        matchNum++
      }
      const finalDates = knockoutDateLookup[matchNum]
      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'final',
        match_number: matchNum,
        bracket_side: null,
        home_source: `W${matchNum - 2}`,
        away_source: `W${matchNum - 1}`,
        points_value: pointsByRound['final'] ?? 16,
        sort_order: matchNum,
        scheduled_at: finalDates?.scheduled_at || null,
        venue: finalDates?.venue || null,
      })
    }

    const { data: createdMatches, error: matchesErr } = await admin
      .from('knockout_matches')
      .insert(knockoutMatches)
      .select()

    if (matchesErr) {
      return NextResponse.json(
        { error: `Failed to create knockout matches: ${matchesErr.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
      },
      counts: {
        teams: teams.length,
        groups: createdGroups.length,
        group_teams: groupTeamRecords.length,
        group_matches: groupMatchRecords.length,
        knockout_matches: createdMatches?.length ?? 0,
        knockout_round_configs: knockoutConfig.length,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
