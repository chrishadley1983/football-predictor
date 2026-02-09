import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KnockoutRound, BracketSide } from '@/lib/types'

// Standard FIFA R16 bracket structure
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

const QF_BRACKET: [number, string, string, BracketSide][] = [
  [9, 'W1', 'W2', 'left'],
  [10, 'W3', 'W4', 'left'],
  [11, 'W5', 'W6', 'right'],
  [12, 'W7', 'W8', 'right'],
]

const SF_BRACKET: [number, string, string, BracketSide][] = [
  [13, 'W9', 'W10', 'left'],
  [14, 'W11', 'W12', 'right'],
]

const FINAL_BRACKET: [number, string, string] = [15, 'W13', 'W14']

interface TeamPayload {
  name: string
  code: string
  flag_emoji: string
}

interface GroupPayload {
  name: string
  teams: TeamPayload[]
}

interface KnockoutConfigPayload {
  round: string
  points_value: number
  match_count: number
}

interface SetupPayload {
  groups: GroupPayload[]
  knockout_config: KnockoutConfigPayload[]
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
    for (const team of teams) {
      teamIdByCode[team.code] = team.id
    }

    // Step 2: Delete existing groups/group_teams for this tournament
    const { data: existingGroups } = await admin
      .from('groups')
      .select('id')
      .eq('tournament_id', tournamentId)

    if (existingGroups && existingGroups.length > 0) {
      const groupIds = existingGroups.map((g) => g.id)
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
    // Build group letter lookup from created groups
    const groupLetterByIndex: Record<number, string> = {}
    for (let i = 0; i < createdGroups.length; i++) {
      // Extract letter from "Group A" -> "A" or use index-based letter
      const name = createdGroups[i].name
      const match = name.match(/Group\s+([A-Z])/i)
      groupLetterByIndex[i] = match ? match[1].toUpperCase() : String.fromCharCode(65 + i)
    }

    // For standard 8-group WC: use the predefined bracket
    // For other configurations: generate dynamically
    const knockoutMatches: {
      tournament_id: string
      round: KnockoutRound
      match_number: number
      bracket_side: BracketSide | null
      home_source: string
      away_source: string
      points_value: number
      sort_order: number
    }[] = []

    const pointsByRound: Record<string, number> = {}
    for (const kc of knockoutConfig) {
      pointsByRound[kc.round] = kc.points_value
    }

    if (body.groups.length === 8) {
      // Standard WC bracket
      for (const [matchNum, homeSrc, awaySrc, side] of R16_BRACKET) {
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'round_of_16',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['round_of_16'] ?? 2,
          sort_order: matchNum,
        })
      }

      for (const [matchNum, homeSrc, awaySrc, side] of QF_BRACKET) {
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'quarter_final',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['quarter_final'] ?? 4,
          sort_order: matchNum,
        })
      }

      for (const [matchNum, homeSrc, awaySrc, side] of SF_BRACKET) {
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'semi_final',
          match_number: matchNum,
          bracket_side: side,
          home_source: homeSrc,
          away_source: awaySrc,
          points_value: pointsByRound['semi_final'] ?? 8,
          sort_order: matchNum,
        })
      }

      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'final',
        match_number: FINAL_BRACKET[0],
        bracket_side: null,
        home_source: FINAL_BRACKET[1],
        away_source: FINAL_BRACKET[2],
        points_value: pointsByRound['final'] ?? 16,
        sort_order: FINAL_BRACKET[0],
      })
    } else if (body.groups.length === 6) {
      // Euros-style bracket (simplified: 16 teams qualify, best 3rd place teams)
      // For now, generate a simpler bracket with QF through Final
      let matchNum = 1
      const qfCount = knockoutConfig.find((k) => k.round === 'quarter_final')?.match_count ?? 4
      for (let i = 0; i < qfCount; i++) {
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'quarter_final',
          match_number: matchNum,
          bracket_side: i < qfCount / 2 ? 'left' : 'right',
          home_source: `QF${matchNum}H`,
          away_source: `QF${matchNum}A`,
          points_value: pointsByRound['quarter_final'] ?? 4,
          sort_order: matchNum,
        })
        matchNum++
      }
      for (let i = 0; i < 2; i++) {
        knockoutMatches.push({
          tournament_id: tournamentId,
          round: 'semi_final',
          match_number: matchNum,
          bracket_side: i === 0 ? 'left' : 'right',
          home_source: `W${i * 2 + 1}`,
          away_source: `W${i * 2 + 2}`,
          points_value: pointsByRound['semi_final'] ?? 8,
          sort_order: matchNum,
        })
        matchNum++
      }
      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'final',
        match_number: matchNum,
        bracket_side: null,
        home_source: `W${matchNum - 2}`,
        away_source: `W${matchNum - 1}`,
        points_value: pointsByRound['final'] ?? 16,
        sort_order: matchNum,
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
        knockout_matches: createdMatches?.length ?? 0,
        knockout_round_configs: knockoutConfig.length,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
