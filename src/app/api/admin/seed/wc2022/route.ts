import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KnockoutRound, BracketSide } from '@/lib/types'

// All 32 WC 2022 teams, grouped
const WC2022_GROUPS: Record<string, { name: string; code: string; flag_emoji: string }[]> = {
  A: [
    { name: 'Qatar', code: 'QAT', flag_emoji: '\u{1F1F6}\u{1F1E6}' },
    { name: 'Ecuador', code: 'ECU', flag_emoji: '\u{1F1EA}\u{1F1E8}' },
    { name: 'Senegal', code: 'SEN', flag_emoji: '\u{1F1F8}\u{1F1F3}' },
    { name: 'Netherlands', code: 'NED', flag_emoji: '\u{1F1F3}\u{1F1F1}' },
  ],
  B: [
    { name: 'England', code: 'ENG', flag_emoji: '\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67\uDB40\uDC7F' },
    { name: 'Iran', code: 'IRN', flag_emoji: '\u{1F1EE}\u{1F1F7}' },
    { name: 'USA', code: 'USA', flag_emoji: '\u{1F1FA}\u{1F1F8}' },
    { name: 'Wales', code: 'WAL', flag_emoji: '\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73\uDB40\uDC7F' },
  ],
  C: [
    { name: 'Argentina', code: 'ARG', flag_emoji: '\u{1F1E6}\u{1F1F7}' },
    { name: 'Saudi Arabia', code: 'KSA', flag_emoji: '\u{1F1F8}\u{1F1E6}' },
    { name: 'Mexico', code: 'MEX', flag_emoji: '\u{1F1F2}\u{1F1FD}' },
    { name: 'Poland', code: 'POL', flag_emoji: '\u{1F1F5}\u{1F1F1}' },
  ],
  D: [
    { name: 'France', code: 'FRA', flag_emoji: '\u{1F1EB}\u{1F1F7}' },
    { name: 'Australia', code: 'AUS', flag_emoji: '\u{1F1E6}\u{1F1FA}' },
    { name: 'Denmark', code: 'DEN', flag_emoji: '\u{1F1E9}\u{1F1F0}' },
    { name: 'Tunisia', code: 'TUN', flag_emoji: '\u{1F1F9}\u{1F1F3}' },
  ],
  E: [
    { name: 'Spain', code: 'ESP', flag_emoji: '\u{1F1EA}\u{1F1F8}' },
    { name: 'Costa Rica', code: 'CRC', flag_emoji: '\u{1F1E8}\u{1F1F7}' },
    { name: 'Germany', code: 'GER', flag_emoji: '\u{1F1E9}\u{1F1EA}' },
    { name: 'Japan', code: 'JPN', flag_emoji: '\u{1F1EF}\u{1F1F5}' },
  ],
  F: [
    { name: 'Belgium', code: 'BEL', flag_emoji: '\u{1F1E7}\u{1F1EA}' },
    { name: 'Canada', code: 'CAN', flag_emoji: '\u{1F1E8}\u{1F1E6}' },
    { name: 'Morocco', code: 'MAR', flag_emoji: '\u{1F1F2}\u{1F1E6}' },
    { name: 'Croatia', code: 'CRO', flag_emoji: '\u{1F1ED}\u{1F1F7}' },
  ],
  G: [
    { name: 'Brazil', code: 'BRA', flag_emoji: '\u{1F1E7}\u{1F1F7}' },
    { name: 'Serbia', code: 'SRB', flag_emoji: '\u{1F1F7}\u{1F1F8}' },
    { name: 'Switzerland', code: 'SUI', flag_emoji: '\u{1F1E8}\u{1F1ED}' },
    { name: 'Cameroon', code: 'CMR', flag_emoji: '\u{1F1E8}\u{1F1F2}' },
  ],
  H: [
    { name: 'Portugal', code: 'POR', flag_emoji: '\u{1F1F5}\u{1F1F9}' },
    { name: 'Ghana', code: 'GHA', flag_emoji: '\u{1F1EC}\u{1F1ED}' },
    { name: 'Uruguay', code: 'URU', flag_emoji: '\u{1F1FA}\u{1F1FE}' },
    { name: 'South Korea', code: 'KOR', flag_emoji: '\u{1F1F0}\u{1F1F7}' },
  ],
}

// R16 bracket: [match_number, home_source, away_source, bracket_side]
const R16_MATCHES: [number, string, string, BracketSide][] = [
  [1, '1A', '2B', 'left'],
  [2, '1C', '2D', 'left'],
  [3, '1B', '2A', 'right'],
  [4, '1D', '2C', 'right'],
  [5, '1E', '2F', 'left'],
  [6, '1G', '2H', 'left'],
  [7, '1F', '2E', 'right'],
  [8, '1H', '2G', 'right'],
]

const QF_MATCHES: [number, string, string, BracketSide][] = [
  [9, 'W1', 'W2', 'left'],
  [10, 'W5', 'W6', 'left'],
  [11, 'W3', 'W4', 'right'],
  [12, 'W7', 'W8', 'right'],
]

const SF_MATCHES: [number, string, string, BracketSide][] = [
  [13, 'W9', 'W10', 'left'],
  [14, 'W11', 'W12', 'right'],
]

const FINAL_MATCH: [number, string, string] = [15, 'W13', 'W14']

export async function POST() {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    // Step 1: Upsert tournament
    const { data: tournament, error: tournamentError } = await admin
      .from('tournaments')
      .upsert(
        {
          name: 'World Cup 2022 (Test)',
          slug: 'wc-2022-test',
          type: 'world_cup' as const,
          year: 2022,
          entry_fee_gbp: 10.0,
          group_stage_prize_pct: 25,
          overall_prize_pct: 75,
          group_stage_deadline: '2026-06-11T15:00:00Z',
          knockout_stage_deadline: '2026-07-01T15:00:00Z',
          status: 'group_stage_open' as const,
        },
        { onConflict: 'slug' }
      )
      .select()
      .single()

    if (tournamentError || !tournament) {
      return NextResponse.json(
        { error: `Failed to create tournament: ${tournamentError?.message}` },
        { status: 500 }
      )
    }

    const tournamentId = tournament.id

    // Step 2: Upsert all 32 teams (by code)
    const allTeams = Object.values(WC2022_GROUPS).flat()
    const { data: teams, error: teamsError } = await admin
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

    if (teamsError || !teams) {
      return NextResponse.json(
        { error: `Failed to create teams: ${teamsError?.message}` },
        { status: 500 }
      )
    }

    // Build a lookup from team code to id
    const teamIdByCode: Record<string, string> = {}
    for (const team of teams) {
      teamIdByCode[team.code] = team.id
    }

    // Step 3: Delete existing groups (cascades to group_teams) then create fresh
    // First delete group_teams for this tournament's groups
    const { data: existingGroups } = await admin
      .from('groups')
      .select('id')
      .eq('tournament_id', tournamentId)

    if (existingGroups && existingGroups.length > 0) {
      const groupIds = existingGroups.map((g) => g.id)
      await admin.from('group_teams').delete().in('group_id', groupIds)
      await admin.from('groups').delete().eq('tournament_id', tournamentId)
    }

    // Create 8 groups
    const groupNames = Object.keys(WC2022_GROUPS) // A, B, C, ... H
    const { data: createdGroups, error: groupsError } = await admin
      .from('groups')
      .insert(
        groupNames.map((name, index) => ({
          tournament_id: tournamentId,
          name: `Group ${name}`,
          sort_order: index + 1,
        }))
      )
      .select()

    if (groupsError || !createdGroups) {
      return NextResponse.json(
        { error: `Failed to create groups: ${groupsError?.message}` },
        { status: 500 }
      )
    }

    // Build group name -> id lookup
    const groupIdByLetter: Record<string, string> = {}
    for (const g of createdGroups) {
      const letter = g.name.replace('Group ', '')
      groupIdByLetter[letter] = g.id
    }

    // Create group_teams records
    const groupTeamRecords: { group_id: string; team_id: string; seed_position: number }[] = []
    for (const [letter, teamsInGroup] of Object.entries(WC2022_GROUPS)) {
      for (let i = 0; i < teamsInGroup.length; i++) {
        groupTeamRecords.push({
          group_id: groupIdByLetter[letter],
          team_id: teamIdByCode[teamsInGroup[i].code],
          seed_position: i + 1,
        })
      }
    }

    const { error: groupTeamsError } = await admin
      .from('group_teams')
      .insert(groupTeamRecords)

    if (groupTeamsError) {
      return NextResponse.json(
        { error: `Failed to create group_teams: ${groupTeamsError.message}` },
        { status: 500 }
      )
    }

    // Step 4: Delete existing knockout matches, then create 15 new ones
    await admin.from('knockout_matches').delete().eq('tournament_id', tournamentId)

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

    // R16
    for (const [matchNum, homeSrc, awaySrc, side] of R16_MATCHES) {
      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'round_of_16',
        match_number: matchNum,
        bracket_side: side,
        home_source: homeSrc,
        away_source: awaySrc,
        points_value: 2,
        sort_order: matchNum,
      })
    }

    // QF
    for (const [matchNum, homeSrc, awaySrc, side] of QF_MATCHES) {
      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'quarter_final',
        match_number: matchNum,
        bracket_side: side,
        home_source: homeSrc,
        away_source: awaySrc,
        points_value: 4,
        sort_order: matchNum,
      })
    }

    // SF
    for (const [matchNum, homeSrc, awaySrc, side] of SF_MATCHES) {
      knockoutMatches.push({
        tournament_id: tournamentId,
        round: 'semi_final',
        match_number: matchNum,
        bracket_side: side,
        home_source: homeSrc,
        away_source: awaySrc,
        points_value: 8,
        sort_order: matchNum,
      })
    }

    // Final
    knockoutMatches.push({
      tournament_id: tournamentId,
      round: 'final',
      match_number: FINAL_MATCH[0],
      bracket_side: null,
      home_source: FINAL_MATCH[1],
      away_source: FINAL_MATCH[2],
      points_value: 16,
      sort_order: FINAL_MATCH[0],
    })

    const { data: createdMatches, error: matchesError } = await admin
      .from('knockout_matches')
      .insert(knockoutMatches)
      .select()

    if (matchesError || !createdMatches) {
      return NextResponse.json(
        { error: `Failed to create knockout matches: ${matchesError?.message}` },
        { status: 500 }
      )
    }

    // Step 5: Upsert knockout round config
    await admin
      .from('knockout_round_config')
      .delete()
      .eq('tournament_id', tournamentId)

    const { error: roundConfigError } = await admin
      .from('knockout_round_config')
      .insert([
        { tournament_id: tournamentId, round: 'round_of_16', points_value: 2, match_count: 8, sort_order: 1 },
        { tournament_id: tournamentId, round: 'quarter_final', points_value: 4, match_count: 4, sort_order: 2 },
        { tournament_id: tournamentId, round: 'semi_final', points_value: 8, match_count: 2, sort_order: 3 },
        { tournament_id: tournamentId, round: 'final', points_value: 16, match_count: 1, sort_order: 4 },
      ])

    if (roundConfigError) {
      return NextResponse.json(
        { error: `Failed to create knockout round config: ${roundConfigError.message}` },
        { status: 500 }
      )
    }

    // Step 6: Upsert tournament_stats
    const { error: statsError } = await admin
      .from('tournament_stats')
      .upsert(
        {
          tournament_id: tournamentId,
          total_group_stage_goals: null,
        },
        { onConflict: 'tournament_id' }
      )

    if (statsError) {
      return NextResponse.json(
        { error: `Failed to create tournament_stats: ${statsError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        status: tournament.status,
      },
      counts: {
        teams: teams.length,
        groups: createdGroups.length,
        group_teams: groupTeamRecords.length,
        knockout_matches: createdMatches.length,
        knockout_round_configs: 4,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
