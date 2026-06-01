import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleAuditEmail } from '@/lib/email/audit'

/**
 * Admin-only: remove an entry from a tournament entirely.
 *
 * Cascades from the DB (ON DELETE CASCADE) take care of the dependent rows:
 * group_predictions, knockout_predictions, player_achievements, golden_tickets.
 * The player's account itself is untouched — they can still log in, see
 * honours, and re-enter future tournaments.
 *
 * Prize pool is recomputed from the remaining paid entries (same shape as the
 * payment-status route). Honours (which reference player_id, not entry_id)
 * survive deletion so completed-tournament standings persist.
 *
 * Player is NOT emailed about this; admin gets an audit summary with counts.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const admin = createAdminClient()

    const { data: entry } = await admin
      .from('tournament_entries')
      .select('id, tournament_id, player_id, payment_status')
      .eq('id', id)
      .maybeSingle()

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    // Count cascade victims for the audit summary — done before the delete
    // since the FK cascade fires before we can query them.
    const [groupRes, knockoutRes, achievementRes, ticketRes] = await Promise.all([
      admin.from('group_predictions').select('id', { count: 'exact', head: true }).eq('entry_id', id),
      admin.from('knockout_predictions').select('id', { count: 'exact', head: true }).eq('entry_id', id),
      admin.from('player_achievements').select('id', { count: 'exact', head: true }).eq('entry_id', id),
      admin.from('golden_tickets').select('id', { count: 'exact', head: true }).eq('entry_id', id),
    ])
    const counts = {
      groupPredictions: groupRes.count ?? 0,
      knockoutPredictions: knockoutRes.count ?? 0,
      achievements: achievementRes.count ?? 0,
      goldenTickets: ticketRes.count ?? 0,
    }

    // Snapshot player + tournament for the audit BEFORE deletion (so the FK
    // is still valid).
    const { data: player } = await admin
      .from('players')
      .select('display_name, nickname, email')
      .eq('id', entry.player_id)
      .maybeSingle()
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id, name, slug, year, entry_fee_gbp')
      .eq('id', entry.tournament_id)
      .single()

    const { error: delError } = await admin.from('tournament_entries').delete().eq('id', id)
    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 })
    }

    // Recompute prize pool from remaining paid entries (matches the logic in
    // the payment-status route).
    if (tournament) {
      const { data: remaining } = await admin
        .from('tournament_entries')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('payment_status', 'paid')
      const prizePool = (remaining?.length ?? 0) * Number(tournament.entry_fee_gbp)
      await admin
        .from('tournaments')
        .update({ prize_pool_gbp: prizePool })
        .eq('id', tournament.id)
    }

    scheduleAuditEmail({
      event: 'admin_action',
      action: 'entry_removed',
      tournament: tournament
        ? { id: tournament.id, name: tournament.name, slug: tournament.slug, year: tournament.year }
        : null,
      summary: `Removed ${player?.display_name ?? 'unknown player'} from tournament. Cascade wiped: ${counts.groupPredictions} group, ${counts.knockoutPredictions} knockout, ${counts.achievements} achievements, ${counts.goldenTickets} golden tickets.`,
      details: {
        entry_id: id,
        player_id: entry.player_id,
        player_email: player?.email ?? null,
        payment_status_at_deletion: entry.payment_status,
        group_predictions_deleted: counts.groupPredictions,
        knockout_predictions_deleted: counts.knockoutPredictions,
        achievements_deleted: counts.achievements,
        golden_tickets_deleted: counts.goldenTickets,
      },
    })

    return NextResponse.json({ success: true, deleted: counts })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
