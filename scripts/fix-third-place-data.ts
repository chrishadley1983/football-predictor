/**
 * Data fix: For the WC2026 time machine run, null out predicted_3rd
 * for 4 random groups per player (keeping only 8 of 12).
 * Then re-trigger scoring via the calculate-scores endpoint.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load env from .env.local
const envPath = resolve(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) env[match[1].trim()] = match[2].trim()
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function main() {
  // Find WC2026 tournament
  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .select('id, name, slug, third_place_qualifiers_count')
    .ilike('slug', '%2026%')
    .single()

  if (tErr || !tournament) {
    console.error('Could not find WC2026 tournament:', tErr?.message)
    process.exit(1)
  }

  const thirdPlaceCount = tournament.third_place_qualifiers_count
  if (!thirdPlaceCount) {
    console.error(`Tournament "${tournament.name}" has no third_place_qualifiers_count set`)
    process.exit(1)
  }

  console.log(`Tournament: ${tournament.name} (${tournament.slug})`)
  console.log(`Third place qualifiers count: ${thirdPlaceCount}`)

  // Get all groups
  const { data: groups } = await admin
    .from('groups')
    .select('id, name')
    .eq('tournament_id', tournament.id)
    .order('sort_order')

  if (!groups || groups.length === 0) {
    console.error('No groups found')
    process.exit(1)
  }

  console.log(`Groups: ${groups.length}`)
  const groupsToNullCount = groups.length - thirdPlaceCount
  console.log(`Will null out predicted_3rd for ${groupsToNullCount} random groups per player\n`)

  // Get all entries
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('id, player:players!tournament_entries_player_id_fkey ( display_name, nickname )')
    .eq('tournament_id', tournament.id)

  if (!entries || entries.length === 0) {
    console.error('No entries found')
    process.exit(1)
  }

  let totalUpdated = 0

  for (const entry of entries) {
    const playerName = (entry.player as { nickname: string | null; display_name: string } | null)?.nickname
      ?? (entry.player as { display_name: string } | null)?.display_name
      ?? 'Unknown'

    // Randomly pick which groups to NULL out 3rd place for
    const groupIdsToNull = new Set(
      shuffle(groups.map((g) => g.id)).slice(0, groupsToNullCount)
    )

    let updated = 0
    for (const groupId of groupIdsToNull) {
      const { error } = await admin
        .from('group_predictions')
        .update({ predicted_3rd: null })
        .eq('entry_id', entry.id)
        .eq('group_id', groupId)

      if (error) {
        console.error(`  Error updating ${playerName} group ${groupId}: ${error.message}`)
      } else {
        updated++
      }
    }

    console.log(`${playerName}: nulled predicted_3rd for ${updated}/${groupsToNullCount} groups`)
    totalUpdated += updated
  }

  console.log(`\nTotal predictions updated: ${totalUpdated}`)

  // Now re-score: calculate group stage scores
  console.log('\nRe-calculating scores...')

  // Get group results
  const groupIds = groups.map((g) => g.id)
  const { data: results } = await admin
    .from('group_results')
    .select('*')
    .in('group_id', groupIds)

  if (!results) {
    console.error('No group results found')
    process.exit(1)
  }

  const resultsByGroup: Record<string, Record<string, { final_position: number; qualified: boolean }>> = {}
  for (const r of results) {
    if (!resultsByGroup[r.group_id]) resultsByGroup[r.group_id] = {}
    resultsByGroup[r.group_id][r.team_id] = {
      final_position: r.final_position,
      qualified: r.qualified,
    }
  }

  // Re-score all group predictions
  const entryIds = entries.map((e) => e.id)
  const { data: predictions } = await admin
    .from('group_predictions')
    .select('*')
    .in('entry_id', entryIds)

  if (!predictions) {
    console.error('No predictions found')
    process.exit(1)
  }

  const pointsByEntry: Record<string, number> = {}

  for (const pred of predictions) {
    const groupResults = resultsByGroup[pred.group_id]
    if (!groupResults) continue

    let points = 0
    const positions: { teamId: string | null; position: number }[] = [
      { teamId: pred.predicted_1st, position: 1 },
      { teamId: pred.predicted_2nd, position: 2 },
      { teamId: pred.predicted_3rd, position: 3 },
    ]

    for (const { teamId, position } of positions) {
      if (!teamId) continue
      const actual = groupResults[teamId]
      if (!actual) continue

      if (actual.qualified) {
        points += 1
        if (actual.final_position === position) {
          points += 1
        }
      }
    }

    await admin
      .from('group_predictions')
      .update({ points_earned: points })
      .eq('id', pred.id)

    pointsByEntry[pred.entry_id] = (pointsByEntry[pred.entry_id] || 0) + points
  }

  // Update entry totals
  for (const entry of entries) {
    const groupPoints = pointsByEntry[entry.id] || 0

    // Get knockout points (unchanged)
    const { data: entryData } = await admin
      .from('tournament_entries')
      .select('knockout_points')
      .eq('id', entry.id)
      .single()

    const knockoutPoints = entryData?.knockout_points ?? 0
    const totalPoints = groupPoints + knockoutPoints

    await admin
      .from('tournament_entries')
      .update({
        group_stage_points: groupPoints,
        total_points: totalPoints,
      })
      .eq('id', entry.id)
  }

  // Re-calculate rankings
  const { data: allEntries } = await admin
    .from('tournament_entries')
    .select('id, group_stage_points, knockout_points, total_points, tiebreaker_diff')
    .eq('tournament_id', tournament.id)

  if (allEntries) {
    const overallSorted = [...allEntries].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      const aDiff = a.tiebreaker_diff
      const bDiff = b.tiebreaker_diff
      if (aDiff === null && bDiff === null) { /* fall through */ }
      else if (aDiff === null) return 1
      else if (bDiff === null) return -1
      else if (aDiff !== bDiff) return aDiff - bDiff
      return b.knockout_points - a.knockout_points
    })

    for (let i = 0; i < overallSorted.length; i++) {
      let rank = 1
      if (i > 0) {
        const prev = overallSorted[i - 1]
        const curr = overallSorted[i]
        const sameTotal = prev.total_points === curr.total_points
        const sameDiff = prev.tiebreaker_diff === curr.tiebreaker_diff
        const sameKO = prev.knockout_points === curr.knockout_points
        if (!(sameTotal && sameDiff && sameKO)) {
          rank = i + 1
        }
      }
      await admin
        .from('tournament_entries')
        .update({ overall_rank: rank })
        .eq('id', overallSorted[i].id)
    }
  }

  console.log('Scores and rankings recalculated.')
  console.log('\nDone! The predictions grid should now show "-" for the nulled 3rd place groups.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
