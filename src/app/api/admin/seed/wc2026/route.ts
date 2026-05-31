import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleAuditEmail } from '@/lib/email/audit'
import type { KnockoutRound, BracketSide } from '@/lib/types'

// All 48 WC 2026 teams, grouped per the final draw (5 Dec 2025, Washington DC)
const WC2026_GROUPS: Record<string, { name: string; code: string; flag_emoji: string }[]> = {
  A: [
    { name: 'Mexico', code: 'MEX', flag_emoji: '\u{1F1F2}\u{1F1FD}' },
    { name: 'South Africa', code: 'RSA', flag_emoji: '\u{1F1FF}\u{1F1E6}' },
    { name: 'South Korea', code: 'KOR', flag_emoji: '\u{1F1F0}\u{1F1F7}' },
    { name: 'Czech Republic', code: 'CZE', flag_emoji: '\u{1F1E8}\u{1F1FF}' },
  ],
  B: [
    { name: 'Canada', code: 'CAN', flag_emoji: '\u{1F1E8}\u{1F1E6}' },
    { name: 'Bosnia and Herzegovina', code: 'BIH', flag_emoji: '\u{1F1E7}\u{1F1E6}' },
    { name: 'Qatar', code: 'QAT', flag_emoji: '\u{1F1F6}\u{1F1E6}' },
    { name: 'Switzerland', code: 'SUI', flag_emoji: '\u{1F1E8}\u{1F1ED}' },
  ],
  C: [
    { name: 'Brazil', code: 'BRA', flag_emoji: '\u{1F1E7}\u{1F1F7}' },
    { name: 'Morocco', code: 'MAR', flag_emoji: '\u{1F1F2}\u{1F1E6}' },
    { name: 'Haiti', code: 'HAI', flag_emoji: '\u{1F1ED}\u{1F1F9}' },
    { name: 'Scotland', code: 'SCO', flag_emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  ],
  D: [
    { name: 'USA', code: 'USA', flag_emoji: '\u{1F1FA}\u{1F1F8}' },
    { name: 'Paraguay', code: 'PAR', flag_emoji: '\u{1F1F5}\u{1F1FE}' },
    { name: 'Australia', code: 'AUS', flag_emoji: '\u{1F1E6}\u{1F1FA}' },
    { name: 'Turkey', code: 'TUR', flag_emoji: '\u{1F1F9}\u{1F1F7}' },
  ],
  E: [
    { name: 'Germany', code: 'GER', flag_emoji: '\u{1F1E9}\u{1F1EA}' },
    { name: 'Curaçao', code: 'CUW', flag_emoji: '\u{1F1E8}\u{1F1FC}' },
    { name: 'Ivory Coast', code: 'CIV', flag_emoji: '\u{1F1E8}\u{1F1EE}' },
    { name: 'Ecuador', code: 'ECU', flag_emoji: '\u{1F1EA}\u{1F1E8}' },
  ],
  F: [
    { name: 'Netherlands', code: 'NED', flag_emoji: '\u{1F1F3}\u{1F1F1}' },
    { name: 'Japan', code: 'JPN', flag_emoji: '\u{1F1EF}\u{1F1F5}' },
    { name: 'Sweden', code: 'SWE', flag_emoji: '\u{1F1F8}\u{1F1EA}' },
    { name: 'Tunisia', code: 'TUN', flag_emoji: '\u{1F1F9}\u{1F1F3}' },
  ],
  G: [
    { name: 'Belgium', code: 'BEL', flag_emoji: '\u{1F1E7}\u{1F1EA}' },
    { name: 'Egypt', code: 'EGY', flag_emoji: '\u{1F1EA}\u{1F1EC}' },
    { name: 'Iran', code: 'IRN', flag_emoji: '\u{1F1EE}\u{1F1F7}' },
    { name: 'New Zealand', code: 'NZL', flag_emoji: '\u{1F1F3}\u{1F1FF}' },
  ],
  H: [
    { name: 'Spain', code: 'ESP', flag_emoji: '\u{1F1EA}\u{1F1F8}' },
    { name: 'Cape Verde', code: 'CPV', flag_emoji: '\u{1F1E8}\u{1F1FB}' },
    { name: 'Saudi Arabia', code: 'KSA', flag_emoji: '\u{1F1F8}\u{1F1E6}' },
    { name: 'Uruguay', code: 'URU', flag_emoji: '\u{1F1FA}\u{1F1FE}' },
  ],
  I: [
    { name: 'France', code: 'FRA', flag_emoji: '\u{1F1EB}\u{1F1F7}' },
    { name: 'Senegal', code: 'SEN', flag_emoji: '\u{1F1F8}\u{1F1F3}' },
    { name: 'Iraq', code: 'IRQ', flag_emoji: '\u{1F1EE}\u{1F1F6}' },
    { name: 'Norway', code: 'NOR', flag_emoji: '\u{1F1F3}\u{1F1F4}' },
  ],
  J: [
    { name: 'Argentina', code: 'ARG', flag_emoji: '\u{1F1E6}\u{1F1F7}' },
    { name: 'Algeria', code: 'ALG', flag_emoji: '\u{1F1E9}\u{1F1FF}' },
    { name: 'Austria', code: 'AUT', flag_emoji: '\u{1F1E6}\u{1F1F9}' },
    { name: 'Jordan', code: 'JOR', flag_emoji: '\u{1F1EF}\u{1F1F4}' },
  ],
  K: [
    { name: 'Portugal', code: 'POR', flag_emoji: '\u{1F1F5}\u{1F1F9}' },
    { name: 'DR Congo', code: 'COD', flag_emoji: '\u{1F1E8}\u{1F1E9}' },
    { name: 'Uzbekistan', code: 'UZB', flag_emoji: '\u{1F1FA}\u{1F1FF}' },
    { name: 'Colombia', code: 'COL', flag_emoji: '\u{1F1E8}\u{1F1F4}' },
  ],
  L: [
    { name: 'England', code: 'ENG', flag_emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { name: 'Croatia', code: 'CRO', flag_emoji: '\u{1F1ED}\u{1F1F7}' },
    { name: 'Ghana', code: 'GHA', flag_emoji: '\u{1F1EC}\u{1F1ED}' },
    { name: 'Panama', code: 'PAN', flag_emoji: '\u{1F1F5}\u{1F1E6}' },
  ],
}

// Group stage fixtures (FIFA final draw, 5 Dec 2025): [home_code, away_code, kickoff_utc_iso, city, stadium]
// Kick-off times are in UTC; cities are FIFA host-city labels, stadium is the venue name.
const GROUP_FIXTURES: Record<string, [string, string, string, string, string][]> = {
  A: [
    ['MEX', 'RSA', '2026-06-11T19:00:00Z', 'Mexico City', 'Estadio Azteca'],
    ['KOR', 'CZE', '2026-06-12T02:00:00Z', 'Guadalajara', 'Estadio Akron'],
    ['CZE', 'RSA', '2026-06-18T16:00:00Z', 'Atlanta', 'Mercedes-Benz Stadium'],
    ['MEX', 'KOR', '2026-06-19T01:00:00Z', 'Guadalajara', 'Estadio Akron'],
    ['CZE', 'MEX', '2026-06-25T01:00:00Z', 'Mexico City', 'Estadio Azteca'],
    ['RSA', 'KOR', '2026-06-25T01:00:00Z', 'Monterrey', 'Estadio BBVA'],
  ],
  B: [
    ['CAN', 'BIH', '2026-06-12T19:00:00Z', 'Toronto', 'BMO Field'],
    ['QAT', 'SUI', '2026-06-13T19:00:00Z', 'San Francisco', "Levi's Stadium"],
    ['SUI', 'BIH', '2026-06-18T19:00:00Z', 'Los Angeles', 'SoFi Stadium'],
    ['CAN', 'QAT', '2026-06-18T22:00:00Z', 'Vancouver', 'BC Place'],
    ['SUI', 'CAN', '2026-06-24T19:00:00Z', 'Vancouver', 'BC Place'],
    ['BIH', 'QAT', '2026-06-24T19:00:00Z', 'Seattle', 'Lumen Field'],
  ],
  C: [
    ['BRA', 'MAR', '2026-06-13T22:00:00Z', 'New York/New Jersey', 'MetLife Stadium'],
    ['HAI', 'SCO', '2026-06-14T01:00:00Z', 'Boston', 'Gillette Stadium'],
    ['SCO', 'MAR', '2026-06-19T22:00:00Z', 'Boston', 'Gillette Stadium'],
    ['BRA', 'HAI', '2026-06-20T00:30:00Z', 'Philadelphia', 'Lincoln Financial Field'],
    ['SCO', 'BRA', '2026-06-24T22:00:00Z', 'Miami', 'Hard Rock Stadium'],
    ['MAR', 'HAI', '2026-06-24T22:00:00Z', 'Atlanta', 'Mercedes-Benz Stadium'],
  ],
  D: [
    ['USA', 'PAR', '2026-06-13T01:00:00Z', 'Los Angeles', 'SoFi Stadium'],
    ['AUS', 'TUR', '2026-06-13T04:00:00Z', 'Vancouver', 'BC Place'],
    ['USA', 'AUS', '2026-06-19T19:00:00Z', 'Seattle', 'Lumen Field'],
    ['TUR', 'PAR', '2026-06-20T03:00:00Z', 'San Francisco', "Levi's Stadium"],
    ['TUR', 'USA', '2026-06-26T02:00:00Z', 'Los Angeles', 'SoFi Stadium'],
    ['PAR', 'AUS', '2026-06-26T02:00:00Z', 'San Francisco', "Levi's Stadium"],
  ],
  E: [
    ['GER', 'CUW', '2026-06-14T17:00:00Z', 'Houston', 'NRG Stadium'],
    ['CIV', 'ECU', '2026-06-14T23:00:00Z', 'Philadelphia', 'Lincoln Financial Field'],
    ['GER', 'CIV', '2026-06-20T20:00:00Z', 'Toronto', 'BMO Field'],
    ['ECU', 'CUW', '2026-06-21T00:00:00Z', 'Kansas City', 'Arrowhead Stadium'],
    ['CUW', 'CIV', '2026-06-25T20:00:00Z', 'Philadelphia', 'Lincoln Financial Field'],
    ['ECU', 'GER', '2026-06-25T20:00:00Z', 'New York/New Jersey', 'MetLife Stadium'],
  ],
  F: [
    ['NED', 'JPN', '2026-06-14T20:00:00Z', 'Dallas', 'AT&T Stadium'],
    ['SWE', 'TUN', '2026-06-15T02:00:00Z', 'Monterrey', 'Estadio BBVA'],
    ['TUN', 'JPN', '2026-06-20T04:00:00Z', 'Monterrey', 'Estadio BBVA'],
    ['NED', 'SWE', '2026-06-20T17:00:00Z', 'Houston', 'NRG Stadium'],
    ['JPN', 'SWE', '2026-06-25T23:00:00Z', 'Dallas', 'AT&T Stadium'],
    ['TUN', 'NED', '2026-06-25T23:00:00Z', 'Kansas City', 'Arrowhead Stadium'],
  ],
  G: [
    ['BEL', 'EGY', '2026-06-15T19:00:00Z', 'Seattle', 'Lumen Field'],
    ['IRN', 'NZL', '2026-06-16T01:00:00Z', 'Los Angeles', 'SoFi Stadium'],
    ['BEL', 'IRN', '2026-06-21T19:00:00Z', 'Los Angeles', 'SoFi Stadium'],
    ['NZL', 'EGY', '2026-06-22T01:00:00Z', 'Vancouver', 'BC Place'],
    ['EGY', 'IRN', '2026-06-27T03:00:00Z', 'Seattle', 'Lumen Field'],
    ['NZL', 'BEL', '2026-06-27T03:00:00Z', 'Vancouver', 'BC Place'],
  ],
  H: [
    ['ESP', 'CPV', '2026-06-15T16:00:00Z', 'Atlanta', 'Mercedes-Benz Stadium'],
    ['KSA', 'URU', '2026-06-15T22:00:00Z', 'Miami', 'Hard Rock Stadium'],
    ['ESP', 'KSA', '2026-06-21T16:00:00Z', 'Atlanta', 'Mercedes-Benz Stadium'],
    ['URU', 'CPV', '2026-06-21T22:00:00Z', 'Miami', 'Hard Rock Stadium'],
    ['CPV', 'KSA', '2026-06-27T00:00:00Z', 'Houston', 'NRG Stadium'],
    ['URU', 'ESP', '2026-06-27T00:00:00Z', 'Guadalajara', 'Estadio Akron'],
  ],
  I: [
    ['FRA', 'SEN', '2026-06-16T19:00:00Z', 'New York/New Jersey', 'MetLife Stadium'],
    ['IRQ', 'NOR', '2026-06-16T22:00:00Z', 'Boston', 'Gillette Stadium'],
    ['FRA', 'IRQ', '2026-06-22T21:00:00Z', 'Philadelphia', 'Lincoln Financial Field'],
    ['NOR', 'SEN', '2026-06-23T00:00:00Z', 'Philadelphia', 'Lincoln Financial Field'],
    ['NOR', 'FRA', '2026-06-26T19:00:00Z', 'Boston', 'Gillette Stadium'],
    ['SEN', 'IRQ', '2026-06-26T19:00:00Z', 'Toronto', 'BMO Field'],
  ],
  J: [
    ['ARG', 'ALG', '2026-06-17T01:00:00Z', 'Kansas City', 'Arrowhead Stadium'],
    ['AUT', 'JOR', '2026-06-17T04:00:00Z', 'San Francisco', "Levi's Stadium"],
    ['ARG', 'AUT', '2026-06-22T17:00:00Z', 'Dallas', 'AT&T Stadium'],
    ['JOR', 'ALG', '2026-06-23T03:00:00Z', 'San Francisco', "Levi's Stadium"],
    ['JOR', 'ARG', '2026-06-28T02:00:00Z', 'Dallas', 'AT&T Stadium'],
    ['ALG', 'AUT', '2026-06-28T02:00:00Z', 'Kansas City', 'Arrowhead Stadium'],
  ],
  K: [
    ['POR', 'COD', '2026-06-17T17:00:00Z', 'Houston', 'NRG Stadium'],
    ['UZB', 'COL', '2026-06-18T02:00:00Z', 'Mexico City', 'Estadio Azteca'],
    ['POR', 'UZB', '2026-06-23T17:00:00Z', 'Houston', 'NRG Stadium'],
    ['COL', 'COD', '2026-06-24T02:00:00Z', 'Guadalajara', 'Estadio Akron'],
    ['COL', 'POR', '2026-06-27T23:30:00Z', 'Miami', 'Hard Rock Stadium'],
    ['COD', 'UZB', '2026-06-27T23:30:00Z', 'Atlanta', 'Mercedes-Benz Stadium'],
  ],
  L: [
    ['ENG', 'CRO', '2026-06-17T20:00:00Z', 'Dallas', 'AT&T Stadium'],
    ['GHA', 'PAN', '2026-06-17T23:00:00Z', 'Toronto', 'BMO Field'],
    ['ENG', 'GHA', '2026-06-23T20:00:00Z', 'Boston', 'Gillette Stadium'],
    ['PAN', 'CRO', '2026-06-23T23:00:00Z', 'Toronto', 'BMO Field'],
    ['PAN', 'ENG', '2026-06-27T21:00:00Z', 'New York/New Jersey', 'MetLife Stadium'],
    ['CRO', 'GHA', '2026-06-27T21:00:00Z', 'Philadelphia', 'Lincoln Financial Field'],
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

// Knockout schedule (FIFA published dates/venues; teams TBD): match_number → [kickoff_utc_iso, city]
// Each round's matches are listed in chronological order. Kick-off times are UTC.
const KNOCKOUT_SCHEDULE: Record<number, [string, string]> = {
  // Round of 32 (1–16)
  1: ['2026-06-28T19:00:00Z', 'Los Angeles'],
  2: ['2026-06-29T17:00:00Z', 'Houston'],
  3: ['2026-06-29T20:30:00Z', 'Boston'],
  4: ['2026-06-30T00:00:00Z', 'Monterrey'],
  5: ['2026-06-30T17:00:00Z', 'Dallas'],
  6: ['2026-06-30T21:00:00Z', 'New York/New Jersey'],
  7: ['2026-07-01T01:00:00Z', 'Mexico City'],
  8: ['2026-07-01T16:00:00Z', 'Atlanta'],
  9: ['2026-07-01T20:00:00Z', 'Seattle'],
  10: ['2026-07-02T00:00:00Z', 'San Francisco'],
  11: ['2026-07-02T19:00:00Z', 'Los Angeles'],
  12: ['2026-07-02T23:00:00Z', 'Toronto'],
  13: ['2026-07-03T03:00:00Z', 'Vancouver'],
  14: ['2026-07-03T18:00:00Z', 'Dallas'],
  15: ['2026-07-03T22:00:00Z', 'Miami'],
  16: ['2026-07-04T01:30:00Z', 'Kansas City'],
  // Round of 16 (17–24)
  17: ['2026-07-04T17:00:00Z', 'Houston'],
  18: ['2026-07-04T21:00:00Z', 'Philadelphia'],
  19: ['2026-07-05T20:00:00Z', 'New York/New Jersey'],
  20: ['2026-07-06T00:00:00Z', 'Mexico City'],
  21: ['2026-07-06T19:00:00Z', 'Dallas'],
  22: ['2026-07-07T00:00:00Z', 'Seattle'],
  23: ['2026-07-07T16:00:00Z', 'Atlanta'],
  24: ['2026-07-07T20:00:00Z', 'Vancouver'],
  // Quarter-finals (25–28)
  25: ['2026-07-09T20:00:00Z', 'Boston'],
  26: ['2026-07-10T19:00:00Z', 'Los Angeles'],
  27: ['2026-07-11T21:00:00Z', 'Miami'],
  28: ['2026-07-12T01:00:00Z', 'Kansas City'],
  // Semi-finals (29–30)
  29: ['2026-07-14T19:00:00Z', 'Dallas'],
  30: ['2026-07-15T19:00:00Z', 'Atlanta'],
  // Final (31)
  31: ['2026-07-19T19:00:00Z', 'New York/New Jersey'],
}

// Stadium name for each FIFA host-city label (one WC venue per city)
const STADIUM_BY_CITY: Record<string, string> = {
  'Mexico City': 'Estadio Azteca',
  Guadalajara: 'Estadio Akron',
  Monterrey: 'Estadio BBVA',
  Toronto: 'BMO Field',
  Vancouver: 'BC Place',
  'San Francisco': "Levi's Stadium",
  'Los Angeles': 'SoFi Stadium',
  Seattle: 'Lumen Field',
  'New York/New Jersey': 'MetLife Stadium',
  Boston: 'Gillette Stadium',
  Philadelphia: 'Lincoln Financial Field',
  Atlanta: 'Mercedes-Benz Stadium',
  Miami: 'Hard Rock Stadium',
  Houston: 'NRG Stadium',
  Dallas: 'AT&T Stadium',
  'Kansas City': 'Arrowhead Stadium',
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
      stadium: string
      sort_order: number
    }[] = []

    for (const [letter, fixtures] of Object.entries(GROUP_FIXTURES)) {
      for (let i = 0; i < fixtures.length; i++) {
        const [homeCode, awayCode, kickoffUtc, venue, stadium] = fixtures[i]
        groupMatchRecords.push({
          group_id: groupIdByLetter[letter],
          home_team_id: teamIdByCode[homeCode],
          away_team_id: teamIdByCode[awayCode],
          match_number: i + 1,
          scheduled_at: kickoffUtc,
          venue,
          stadium,
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
      stadium: string | null
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
      const venue = schedule ? schedule[1] : null
      knockoutMatches.push({
        tournament_id: tournamentId,
        round,
        match_number: matchNum,
        bracket_side: side,
        home_source: homeSrc,
        away_source: awaySrc,
        points_value: points,
        sort_order: matchNum,
        scheduled_at: schedule ? schedule[0] : null,
        venue,
        stadium: venue ? STADIUM_BY_CITY[venue] ?? null : null,
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

    scheduleAuditEmail({
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
