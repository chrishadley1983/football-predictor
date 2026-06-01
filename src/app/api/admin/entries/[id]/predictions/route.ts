import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleAuditEmail } from '@/lib/email/audit'

/**
 * Admin-only: wipe an entry's predictions, achievements, and golden tickets
 * for this tournament. Leaves the entry row + payment status untouched, so
 * the player is still "in" the tournament — they just have a blank slate.
 *
 * Useful for cases like "the player asked me to start over" or "I imported
 * bad data and need to reset their picks" — not the same as removing them
 * from the tournament (use DELETE /api/admin/entries/[id] for that).
 *
 * Player is NOT emailed about this; admin gets an audit summary with the
 * counts of rows wiped from each table.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const admin = createAdminClient()

    // Capture entry + player + tournament for the audit.
    const { data: entry } = await admin
      .from('tournament_entries')
      .select('id, tournament_id, player_id')
      .eq('id', id)
      .maybeSingle()

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    // Count what we're about to wipe (head:true returns just the count).
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

    // Wipe each set. Independent — order doesn't matter. Also reset scoring
    // fields on the entry row itself so the leaderboard reflects the wipe.
    const deletes = await Promise.all([
      admin.from('group_predictions').delete().eq('entry_id', id),
      admin.from('knockout_predictions').delete().eq('entry_id', id),
      admin.from('player_achievements').delete().eq('entry_id', id),
      admin.from('golden_tickets').delete().eq('entry_id', id),
    ])
    for (const d of deletes) {
      if (d.error) {
        return NextResponse.json({ error: d.error.message }, { status: 500 })
      }
    }

    // Zero out the cached scores so the entry doesn't keep showing stale points.
    // Tiebreaker is preserved — admin reset of picks shouldn't clobber the
    // separate group-goal-count guess.
    await admin
      .from('tournament_entries')
      .update({
        group_stage_points: 0,
        knockout_points: 0,
        tiebreaker_diff: null,
        group_stage_rank: null,
        overall_rank: null,
      })
      .eq('id', id)

    // Fire admin audit (silent to player by design).
    const { data: player } = await admin
      .from('players')
      .select('display_name, nickname, email')
      .eq('id', entry.player_id)
      .maybeSingle()
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id, name, slug, year')
      .eq('id', entry.tournament_id)
      .single()

    scheduleAuditEmail({
      event: 'admin_action',
      action: 'entry_predictions_reset',
      tournament: tournament
        ? { id: tournament.id, name: tournament.name, slug: tournament.slug, year: tournament.year }
        : null,
      summary: `Reset predictions for ${player?.display_name ?? 'unknown player'}: ${counts.groupPredictions} group, ${counts.knockoutPredictions} knockout, ${counts.achievements} achievements, ${counts.goldenTickets} golden tickets wiped`,
      details: {
        entry_id: id,
        player_id: entry.player_id,
        player_email: player?.email ?? null,
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
