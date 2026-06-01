import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types'
import type {
  KnockoutOpenAnnouncementEvent,
  TournamentCompletedEvent,
  PlayerEmailRef,
} from './user'

type AnyClient = SupabaseClient<Database>


type PlayerRow = {
  id: string
  display_name: string
  email: string
  unsubscribe_token: string
  email_notifications_enabled: boolean
}

type EntryRow = {
  payment_status: 'pending' | 'paid' | 'refunded'
  player: PlayerRow | PlayerRow[] | null
  total_points: number | null
  overall_rank: number | null
}

function asPlayerRow(p: PlayerRow | PlayerRow[] | null): PlayerRow | null {
  if (!p) return null
  // Supabase JS returns one-to-many joins as arrays even when there's exactly one row;
  // we only care about the single related player here.
  return Array.isArray(p) ? p[0] ?? null : p
}

function toPlayerRef(p: PlayerRow): PlayerEmailRef {
  return {
    id: p.id,
    displayName: p.display_name,
    email: p.email,
    unsubscribeToken: p.unsubscribe_token,
    notificationsEnabled: p.email_notifications_enabled,
  }
}

/**
 * Build one announcement event per non-refunded entry for the given tournament.
 *
 * Refunded entries are excluded — they've effectively withdrawn. Pending entries
 * are included alongside paid because the prediction game treats pending as
 * "in-flight payment", not "out".
 */
export async function buildKnockoutOpenEvents(
  admin: AnyClient,
  tournamentId: string
): Promise<KnockoutOpenAnnouncementEvent[]> {
  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .select('id, name, slug, year, knockout_stage_deadline')
    .eq('id', tournamentId)
    .single()
  if (tErr || !tournament) return []

  const { data: entries } = await admin
    .from('tournament_entries')
    .select('payment_status, player:players(id, display_name, email, unsubscribe_token, email_notifications_enabled)')
    .eq('tournament_id', tournamentId)
    .neq('payment_status', 'refunded')

  if (!entries) return []

  const events: KnockoutOpenAnnouncementEvent[] = []
  for (const row of entries as EntryRow[]) {
    const player = asPlayerRow(row.player)
    if (!player) continue
    events.push({
      event: 'knockout_open_announcement',
      player: toPlayerRef(player),
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        year: tournament.year,
        knockoutDeadline: tournament.knockout_stage_deadline,
      },
    })
  }
  return events
}

/**
 * Build personalised tournament-completed events for every non-refunded entry.
 *
 * Each event embeds: that player's final rank + points, the honours they won
 * (looked up by player_id from the honours table), and the top-3 leaderboard.
 * Designed so the broadcast helper can render and send each in a single batch.
 */
export async function buildTournamentCompletedEvents(
  admin: AnyClient,
  tournamentId: string
): Promise<TournamentCompletedEvent[]> {
  const { data: tournament, error: tErr } = await admin
    .from('tournaments')
    .select('id, name, slug, year')
    .eq('id', tournamentId)
    .single()
  if (tErr || !tournament) return []

  const { data: entries } = await admin
    .from('tournament_entries')
    .select('payment_status, total_points, overall_rank, player:players(id, display_name, email, unsubscribe_token, email_notifications_enabled)')
    .eq('tournament_id', tournamentId)
    .neq('payment_status', 'refunded')

  if (!entries || entries.length === 0) return []

  // Sort by overall_rank (nulls last) for top-3 derivation.
  const sortedEntries = [...(entries as EntryRow[])].sort((a, b) => {
    if (a.overall_rank === null && b.overall_rank === null) return 0
    if (a.overall_rank === null) return 1
    if (b.overall_rank === null) return -1
    return a.overall_rank - b.overall_rank
  })

  const topThree = sortedEntries.slice(0, 3).flatMap((e) => {
    const p = asPlayerRow(e.player)
    if (!p || e.overall_rank === null) return []
    return [{ rank: e.overall_rank, displayName: p.display_name, totalPoints: e.total_points ?? 0 }]
  })

  // Fetch all honours for the tournament, indexed by player_id.
  const { data: honoursRows } = await admin
    .from('honours')
    .select('player_id, prize_type, prize_amount_gbp, description')
    .eq('tournament_id', tournamentId)

  const honoursByPlayer = new Map<
    string,
    Array<{ prizeType: string; prizeAmountGbp: number | null; description: string | null }>
  >()
  for (const h of (honoursRows ?? []) as Array<{
    player_id: string | null
    prize_type: string
    prize_amount_gbp: number | null
    description: string | null
  }>) {
    if (!h.player_id) continue
    const list = honoursByPlayer.get(h.player_id) ?? []
    list.push({
      prizeType: h.prize_type,
      prizeAmountGbp: h.prize_amount_gbp,
      description: h.description,
    })
    honoursByPlayer.set(h.player_id, list)
  }

  const events: TournamentCompletedEvent[] = []
  for (const row of sortedEntries) {
    const player = asPlayerRow(row.player)
    if (!player) continue
    events.push({
      event: 'tournament_completed',
      player: toPlayerRef(player),
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        year: tournament.year,
      },
      myFinish: {
        rank: row.overall_rank,
        totalPoints: row.total_points ?? 0,
      },
      myHonours: honoursByPlayer.get(player.id) ?? [],
      topThree,
    })
  }
  return events
}
