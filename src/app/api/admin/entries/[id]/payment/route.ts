import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleAuditEmail } from '@/lib/email/audit'
import type { PaymentStatus } from '@/lib/email/audit'

// PATCH: Update payment status (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin()
    const { id } = await params
    const admin = createAdminClient()

    const body = await request.json()

    if (!body.payment_status || !['pending', 'paid', 'refunded'].includes(body.payment_status)) {
      return NextResponse.json(
        { error: 'payment_status must be "pending", "paid", or "refunded"' },
        { status: 400 }
      )
    }

    // Capture old status before update for the audit diff
    const { data: existing } = await admin
      .from('tournament_entries')
      .select('payment_status')
      .eq('id', id)
      .maybeSingle()
    const oldStatus = (existing?.payment_status as PaymentStatus | undefined) ?? null

    const { data: entry, error } = await admin
      .from('tournament_entries')
      .update({ payment_status: body.payment_status })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }

    // Recalculate prize pool for the tournament
    const { data: entries } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', entry.tournament_id)
      .eq('payment_status', 'paid')

    const { data: tournament } = await admin
      .from('tournaments')
      .select('id, name, slug, year, entry_fee_gbp')
      .eq('id', entry.tournament_id)
      .single()

    if (tournament && entries) {
      const prizePool = entries.length * Number(tournament.entry_fee_gbp)
      await admin
        .from('tournaments')
        .update({ prize_pool_gbp: prizePool })
        .eq('id', entry.tournament_id)
    }

    // Audit: skip if no actual change
    if (tournament && oldStatus && oldStatus !== body.payment_status) {
      const { data: player } = await admin
        .from('players')
        .select('id, display_name, nickname, email')
        .eq('id', entry.player_id)
        .maybeSingle()

      if (player) {
        scheduleAuditEmail({
          event: 'payment_status_changed',
          player: {
            id: player.id,
            displayName: player.display_name,
            nickname: player.nickname,
            email: player.email,
          },
          tournament: {
            id: tournament.id,
            name: tournament.name,
            slug: tournament.slug,
            year: tournament.year,
          },
          entryId: entry.id,
          old: oldStatus,
          new: body.payment_status as PaymentStatus,
        })
      }
    }

    return NextResponse.json(entry)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
