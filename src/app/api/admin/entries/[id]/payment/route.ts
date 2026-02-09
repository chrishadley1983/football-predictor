import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

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
      .select('entry_fee_gbp')
      .eq('id', entry.tournament_id)
      .single()

    if (tournament && entries) {
      const prizePool = entries.length * Number(tournament.entry_fee_gbp)
      await admin
        .from('tournaments')
        .update({ prize_pool_gbp: prizePool })
        .eq('id', entry.tournament_id)
    }

    return NextResponse.json(entry)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
