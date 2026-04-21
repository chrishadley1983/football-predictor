import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAuditEmail } from '@/lib/email/audit'
import type { KnockoutRound, BracketSide } from '@/lib/types'

// All 48 WC 2026 teams, grouped per the final draw (5 Dec 2025, Washington DC)
const WC2026_GROUPS: Record<string, { name: string; code: string; flag_emoji: string }[]> = {
  A: [
    { name: 'Mexico', code: 'MEX', flag_emoji: '\u{1F1F2}\u{1F1FD}' },
    { name: 'South Korea', code: 'KOR', flag_emoji: '\u{1F1F0}\u{1F1F7}' },
    { name: 'South Africa', code: 'RSA', flag_emoji: '\u{1F1FF}\u{1F1E6}' },
    { name: 'Czech Republic', code: 'CZE', flag_emoji: '\u{1F1E8}\u{1F1FF}' },
  ],
  B: [
    { name: 'Canada', code: 'CAN', flag_emoji: '\u{1F1E8}\u{1F1E6}' },
    { name: 'Switzerland', code: 'SUI', flag_emoji: '\u{1F1E8}\u{1F1ED}' },
    { name: 'Qatar', code: 'QAT', flag_emoji: '\u{1F1F6}\u{1F1E6}' },
    { name: 'Bosnia and Herzegovina', code: 'BIH', flag_emoji: '\u{1F1E7}\u{1F1E6}' },
  ],
  C: [
    { name: 'Brazil', code: 'BRA', flag_emoji: '\u{1F1E7}\u{1F1F7}' },
    { name: 'Morocco', code: 'MAR', flag_emoji: '\u{1F1F2}\u{1F1E6}' },
    { name: 'Scotland', code: 'SCO', flag_emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    { name: 'Haiti', code: 'HAI', flag_emoji: '\u{1F1ED}\u{1F1F9}' },
  ],
  D: [
    { name: 'USA', code: 'USA', flag_emoji: '\u{1F1FA}\u{1F1F8}' },
    { name: 'Paraguay', code: 'PAR', flag_emoji: '\u{1F1F5}\u{1F1FE}' },
    { name: 'Australia', code: 'AUS', flag_emoji: '\u{1F1E6}\u{1F1FA}' },
    { name: 'Turkey', code: 'TUR', flag_emoji: '\u{1F1F9}\u{1F1F7}' },
  ],
  E: [
    { name: 'Germany', code: 'GER', flag_emoji: '\u{1F1E9}\u{1F1EA}' },
    { name: 'Ecuador', code: 'ECU', flag_emoji: '\u{1F1EA}\u{1F1E8}' },
    { name: 'Ivory Coast', code: 'CIV', flag_emoji: '\u{1F1E8}\u{1F1EE}' },
    { name: 'Curaçao', code: 'CUW', flag_emoji: '\u{1F1E8}\u{1F1FC}' },
  ],
  F: [
    { name: 'Netherlands', code: 'NED', flag_emoji: '\u{1F1F3}\u{1F1F1}' },
    { name: 'Japan', code: 'JPN', flag_emoji: '\u{1F1EF}\u{1F1F5}' },
    { name: 'Tunisia', code: 'TUN', flag_emoji: '\u{1F1F9}\u{1F1F3}' },
    { name: 'Sweden', code: 'SWE', flag_emoji: '\u{1F1F8}\u{1F1EA}' },
  ],
  G: [
    { name: 'Belgium', code: 'BEL', flag_emoji: '\u{1F1E7}\u{1F1EA}' },
    { name: 'Iran', code: 'IRN', flag_emoji: '\u{1F1EE}\u{1F1F7}' },
    { name: 'Egypt', code: 'EGY', flag_emoji: '\u{1F1EA}\u{1F1EC}' },
    { name: 'New Zealand', code: 'NZL', flag_emoji: '\u{1F1F3}\u{1F1FF}' },
  ],
  H: [
    { name: 'Spain', code: 'ESP', flag_emoji: '\u{1F1EA}\u{1F1F8}' },
    { name: 'Uruguay', code: 'URU', flag_emoji: '\u{1F1FA}\u{1F1FE}' },
    { name: 'Saudi Arabia', code: 'KSA', flag_emoji: '\u{1F1F8}\u{1F1E6}' },
    { name: 'Cape Verde', code: 'CPV', flag_emoji: '\u{1F1E8}\u{1F1FB}' },
  ],
  I: [
    { name: 'France', code: 'FRA', flag_emoji: '\u{1F1EB}\u{1F1F7}' },
    { name: 'Senegal', code: 'SEN', flag_emoji: '\u{1F1F8}\u{1F1F3}' },
    { name: 'Norway', code: 'NOR', flag_emoji: '\u{1F1F3}\u{1F1F4}' },
    { name: 'Iraq', code: 'IRQ', flag_emoji: '\u{1F1EE}\u{1F1F6}' },
  ],
  J: [
    { name: 'Argentina', code: 'ARG', flag_emoji: '\u{1F1E6}\u{1F1F7}' },
    { name: 'Austria', code: 'AUT', flag_emoji: '\u{1F1E6}\u{1F1F9}' },
    { name: 'Algeria', code: 'ALG', flag_emoji: '\u{1F1E9}\u{1F1FF}' },
    { name: 'Jordan', code: 'JOR', flag_emoji: '\u{1F1EF}\u{1F1F4}' },
  ],
  K: [
    { name: 'Portugal', code: 'POR', flag_emoji: '\u{1F1F5}\u{1F1F9}' },
    { name: 'Colombia', code: 'COL', flag_emoji: '\u{1F1E8}\u{1F1F4}' },
    { name: 'Uzbekistan', code: 'UZB', flag_emoji: '\u{1F1FA}\u{1F1FF}' },
    { name: 'DR Congo', code: 'COD', flag_emoji: '\u{1F1E8}\u{1F1E9}' },
  ],
  L: [
    { name: 'England', code: 'ENG', flag_emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { name: 'Croatia', code: 'CRO', flag_emoji: '\u{1F1ED}\u{1F1F7}' },
    { name: 'Panama', code: 'PAN', flag_emoji: '\u{1F1F5}\u{1F1E6}' },
    { name: 'Ghana', code: 'GHA', flag_emoji: '\u{1F1EC}\u{1F1ED}' },
  ],
}

// Group stage fixtures: [home_code, away_code, YYYY-MM-DD, venue]
const GROUP_FIXTURES: Record<string, [string, string, string, string][]> = {
  A: [
    ['MEX', 'RSA', '2026-06-11', 'Mexico City'],
    ['KOR', 'CZE', '2026-06-12', 'Guadalajara'],
    ['MEX', 'KOR', '2026-06-18', 'Guadalajara'],
    ['CZE', 'RSA', '2026-06-18', 'Atlanta'],
    ['CZE', 'MEX', '2026-06-25', 'Mexico City'],
    ['RSA', 'KOR', '2026-06-25', 'Monterrey'],
  ],
  B: [
    ['CAN', 'BIH', '2026-06-12', 'Toronto'],
    ['QAT', 'SUI', '2026-06-13', 'San Francisco'],
    ['SUI', 'BIH', '2026-06-18', 'Los Angeles'],
    ['CAN', 'QAT', '2026-06-18', 'Vancouver'],
    ['SUI', 'CAN', '2026-06-24', 'Vancouver'],
    ['BIH', 'QAT', '2026-06-24', 'Seattle'],
  ],
  C: [
    ['BRA', 'MAR', '2026-06-13', 'New York/New Jersey'],
    ['HAI', 'SCO', '2026-06-14', 'Boston'],
    ['SCO', 'MAR', '2026-06-19', 'Boston'],
    ['BRA', 'HAI', '2026-06-20', 'Philadelphia'],
    ['MAR', 'HAI', '2026-06-24', 'Atlanta'],
    ['SCO', 'BRA', '2026-06-24', 'Miami'],
  ],
  D: [
    ['USA', 'PAR', '2026-06-13', 'Los Angeles'],
    ['AUS', 'TUR', '2026-06-14', 'Vancouver'],
    ['USA', 'AUS', '2026-06-19', 'Seattle'],
    ['TUR', 'USA', '2026-06-26', 'Los Angeles'],
    ['PAR', 'AUS', '2026-06-26', 'San Francisco'],
    ['TUR', 'PAR', '2026-06-26', 'San Francisco'],
  ],
  E: [
    ['GER', 'CUW', '2026-06-14', 'Houston'],
    ['CIV', 'ECU', '2026-06-15', 'Philadelphia'],
    ['GER', 'CIV', '2026-06-20', 'Toronto'],
    ['ECU', 'CUW', '2026-06-21', 'Kansas City'],
    ['CUW', 'CIV', '2026-06-25', 'Philadelphia'],
    ['ECU', 'GER', '2026-06-25', 'New York/New Jersey'],
  ],
  F: [
    ['NED', 'JPN', '2026-06-14', 'Dallas'],
    ['SWE', 'TUN', '2026-06-15', 'Monterrey'],
    ['NED', 'SWE', '2026-06-20', 'Houston'],
    ['TUN', 'JPN', '2026-06-21', 'Monterrey'],
    ['TUN', 'NED', '2026-06-26', 'Kansas City'],
    ['JPN', 'SWE', '2026-06-26', 'Dallas'],
  ],
  G: [
    ['BEL', 'EGY', '2026-06-15', 'Seattle'],
    ['IRN', 'NZL', '2026-06-16', 'Los Angeles'],
    ['BEL', 'IRN', '2026-06-21', 'Los Angeles'],
    ['NZL', 'EGY', '2026-06-21', 'Vancouver'],
    ['NZL', 'BEL', '2026-06-27', 'Vancouver'],
    ['EGY', 'IRN', '2026-06-27', 'Seattle'],
  ],
  H: [
    ['ESP', 'CPV', '2026-06-15', 'Atlanta'],
    ['KSA', 'URU', '2026-06-15', 'Miami'],
    ['ESP', 'KSA', '2026-06-21', 'Atlanta'],
    ['URU', 'CPV', '2026-06-21', 'Miami'],
    ['CPV', 'KSA', '2026-06-27', 'Houston'],
    ['URU', 'ESP', '2026-06-27', 'Guadalajara'],
  ],
  I: [
    ['FRA', 'SEN', '2026-06-16', 'New York/New Jersey'],
    ['IRQ', 'NOR', '2026-06-16', 'Boston'],
    ['FRA', 'IRQ', '2026-06-22', 'Philadelphia'],
    ['NOR', 'SEN', '2026-06-23', 'Toronto'],
    ['NOR', 'FRA', '2026-06-26', 'Boston'],
    ['SEN', 'IRQ', '2026-06-26', 'Toronto'],
  ],
  J: [
    ['ARG', 'ALG', '2026-06-17', 'Kansas City'],
    ['AUT', 'JOR', '2026-06-17', 'San Francisco'],
    ['ARG', 'AUT', '2026-06-22', 'Dallas'],
    ['JOR', 'ALG', '2026-06-23', 'San Francisco'],
    ['ALG', 'AUT', '2026-06-28', 'Kansas City'],
    ['JOR', 'ARG', '2026-06-28', 'Dallas'],
  ],
  K: [
    ['POR', 'COD', '2026-06-17', 'Houston'],
    ['UZB', 'COL', '2026-06-18', 'Mexico City'],
    ['POR', 'UZB', '2026-06-23', 'Houston'],
    ['COL', 'COD', '2026-06-24', 'Guadalajara'],
    ['COL', 'POR', '2026-06-28', 'Miami'],
    ['COD', 'UZB', '2026-06-28', 'Atlanta'],
  ],
  L: [
    ['ENG', 'CRO', '2026-06-17', 'Dallas'],
    ['GHA', 'PAN', '2026-06-18', 'Toronto'],
    ['ENG', 'GHA', '2026-06-23', 'Boston'],
    ['PAN', 'CRO', '2026-06-24', 'Boston'],
    ['PAN', 'ENG', '2026-06-27', 'New York/New Jersey'],
    ['CRO', 'GHA', '2026-06-27', 'Philadelphia'],
  ],
}

// 12-group knockout bracket (round_of_32 → final) matching src/app/api/admin/tournaments/[slug]/setup/route.ts
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

const R16_BRACKET: [number, string, string, BracketSide][] = [
  [17, 'W1', 'W2', 'left'],
  [18, 'W3', 'W4', 'left'],
  [19, 'W5', 'W6', 'left'],
  [20, 'W7', 'W8', 'left'],
  [21, 'W9', 'W10', 'right'],
  [22, 'W11', 'W12', 'right'],
  [23, 'W13', 'W14', 'right'],
  [24, 'W15', 'W16', 'right'],
]

const QF_BRACKET: [number, string, string, BracketSide][] = [
  [25, 'W17', 'W18', 'left'],
  [26, 'W19', 'W20', 'left'],
  [27, 'W21', 'W22', 'right'],
  [28, 'W23', 'W24', 'right'],
]

const SF_BRACKET: [number, string, string, BracketSide][] = [
  [29, 'W25', 'W26', 'left'],
  [30, 'W27', 'W28', 'right'],
]

const FINAL_MATCH: [number, string, string] = [31, 'W29', 'W30']

// Knockout schedule: match_number → [YYYY-MM-DD, venue]
const KNOCKOUT_SCHEDULE: Record<number, [string, string]> = {
  1: ['2026-06-28', 'Philadelphia'],
  2: ['2026-06-28', 'Monterrey'],
  3: ['2026-06-29', 'Toronto'],
  4: ['2026-06-29', 'Los Angeles'],
  5: ['2026-06-30', 'Boston'],
  6: ['2026-06-30', 'Dallas'],
  7: ['2026-07-01', 'Atlanta'],
  8: ['2026-07-01', 'San Francisco'],
  9: ['2026-07-02', 'Miami'],
  10: ['2026-07-02', 'Seattle'],
  11: ['2026-07-03', 'Houston'],
  12: ['2026-07-03', 'Vancouver'],
  13: ['2026-07-04', 'Kansas City'],
  14: ['2026-07-04', 'New York/New Jersey'],
  15: ['2026-07-05', 'Mexico City'],
  16: ['2026-07-05', 'Guadalajara'],
  17: ['2026-07-07', 'Philadelphia'],
  18: ['2026-07-07', 'Dallas'],
  19: ['2026-07-08', 'New York/New Jersey'],
  20: ['2026-07-08', 'Atlanta'],
  21: ['2026-07-09', 'Boston'],
  22: ['2026-07-09', 'Los Angeles'],
  23: ['2026-07-10', 'Kansas City'],
  24: ['2026-07-10', 'Miami'],
  25: ['2026-07-11', 'Boston'],
  26: ['2026-07-11', 'Los Angeles'],
  27: ['2026-07-12', 'Kansas City'],
  28: ['2026-07-12', 'Miami'],
  29: ['2026-07-14', 'Dallas'],
  30: ['2026-07-15', 'Atlanta'],
  31: ['2026-07-19', 'New York/New Jersey'],
}

function isoAt(dateStr: string, hourUtc = 18): string {
  return `${dateStr}T${hourUtc.toString().padStart(2, '0')}:00:00Z`
}

export async function POST() {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    // Step 1: Upsert tournament
    const { data: tournament, error: tournamentError } = await admin
      .from('tournaments')
      .upsert(
        {
          name: 'World Cup 2026',
          slug: 'wc-2026',
          type: 'world_cup' as const,
          year: 2026,
          entry_fee_gbp: 10.0,
          group_stage_prize_pct: 25,
          overall_prize_pct: 75,
          group_stage_deadline: isoAt('2026-06-11', 15),
          knockout_stage_deadline: isoAt('2026-06-28', 15),
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

    // Step 2: Upsert all 48 teams by code
    const allTeams = Object.values(WC2026_GROUPS).flat()
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

    const teamIdByCode: Record<string, string> = {}
    for (const team of teams) {
      teamIdByCode[team.code] = team.id
    }

    // Step 3: Delete existing groups/group_teams/group_matches/group_results then recreate
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

    // Create 12 groups
    const groupLetters = Object.keys(WC2026_GROUPS)
    const { data: createdGroups, error: groupsError } = await admin
      .from('groups')
      .insert(
        groupLetters.map((letter, index) => ({
          tournament_id: tournamentId,
          name: `Group ${letter}`,
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

    const groupIdByLetter: Record<string, string> = {}
    for (const g of createdGroups) {
      const letter = g.name.replace('Group ', '')
      groupIdByLetter[letter] = g.id
    }

    // Step 4: Assign teams to groups
    const groupTeamRecords: { group_id: string; team_id: string; seed_position: number }[] = []
    for (const [letter, teamsInGroup] of Object.entries(WC2026_GROUPS)) {
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

    // Step 5: Create group stage fixtures
    const groupMatchRecords: {
      group_id: string
      home_team_id: string
      away_team_id: string
      match_number: number
      scheduled_at: string
      venue: string
      sort_order: number
    }[] = []

    for (const [letter, fixtures] of Object.entries(GROUP_FIXTURES)) {
      for (let i = 0; i < fixtures.length; i++) {
        const [homeCode, awayCode, dateStr, venue] = fixtures[i]
        groupMatchRecords.push({
          group_id: groupIdByLetter[letter],
          home_team_id: teamIdByCode[homeCode],
          away_team_id: teamIdByCode[awayCode],
          match_number: i + 1,
          scheduled_at: isoAt(dateStr),
          venue,
          sort_order: i + 1,
        })
      }
    }

    const { error: groupMatchesError } = await admin
      .from('group_matches')
      .insert(groupMatchRecords)

    if (groupMatchesError) {
      return NextResponse.json(
        { error: `Failed to create group_matches: ${groupMatchesError.message}` },
        { status: 500 }
      )
    }

    // Step 6: Delete then recreate knockout matches and round config
    await admin.from('knockout_matches').delete().eq('tournament_id', tournamentId)
    await admin.from('knockout_round_config').delete().eq('tournament_id', tournamentId)

    const { error: roundConfigError } = await admin
      .from('knockout_round_config')
      .insert([
        { tournament_id: tournamentId, round: 'round_of_32', points_value: 1, match_count: 16, sort_order: 1 },
        { tournament_id: tournamentId, round: 'round_of_16', points_value: 2, match_count: 8, sort_order: 2 },
        { tournament_id: tournamentId, round: 'quarter_final', points_value: 4, match_count: 4, sort_order: 3 },
        { tournament_id: tournamentId, round: 'semi_final', points_value: 8, match_count: 2, sort_order: 4 },
        { tournament_id: tournamentId, round: 'final', points_value: 16, match_count: 1, sort_order: 5 },
      ])

    if (roundConfigError) {
      return NextResponse.json(
        { error: `Failed to create knockout round config: ${roundConfigError.message}` },
        { status: 500 }
      )
    }

    const knockoutMatches: {
      tournament_id: string
      round: KnockoutRound
      match_number: number
      bracket_side: BracketSide | null
      home_source: string
      away_source: string
      points_value: number
      sort_order: number
      scheduled_at: string | null
      venue: string | null
    }[] = []

    function pushKnockout(
      round: KnockoutRound,
      matchNum: number,
      homeSrc: string,
      awaySrc: string,
      side: BracketSide | null,
      points: number
    ) {
      const schedule = KNOCKOUT_SCHEDULE[matchNum]
      knockoutMatches.push({
        tournament_id: tournamentId,
        round,
        match_number: matchNum,
        bracket_side: side,
        home_source: homeSrc,
        away_source: awaySrc,
        points_value: points,
        sort_order: matchNum,
        scheduled_at: schedule ? isoAt(schedule[0]) : null,
        venue: schedule ? schedule[1] : null,
      })
    }

    for (const [n, h, a, s] of R32_BRACKET) pushKnockout('round_of_32', n, h, a, s, 1)
    for (const [n, h, a, s] of R16_BRACKET) pushKnockout('round_of_16', n, h, a, s, 2)
    for (const [n, h, a, s] of QF_BRACKET) pushKnockout('quarter_final', n, h, a, s, 4)
    for (const [n, h, a, s] of SF_BRACKET) pushKnockout('semi_final', n, h, a, s, 8)
    pushKnockout('final', FINAL_MATCH[0], FINAL_MATCH[1], FINAL_MATCH[2], null, 16)

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

    // Step 7: Upsert tournament_stats
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

    void sendAuditEmail({
      event: 'admin_action',
      action: 'seed_tournament',
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        year: tournament.year,
      },
      summary: `Seeded ${tournament.name}: ${teams.length} teams, ${createdGroups.length} groups, ${createdMatches.length} knockout matches`,
      details: {
        teams: teams.length,
        groups: createdGroups.length,
        group_teams: groupTeamRecords.length,
        group_matches: groupMatchRecords.length,
        knockout_matches: createdMatches.length,
      },
    })

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
        group_matches: groupMatchRecords.length,
        knockout_matches: createdMatches.length,
        knockout_round_configs: 5,
      },
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
