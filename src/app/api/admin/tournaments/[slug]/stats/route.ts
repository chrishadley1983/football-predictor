import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// PATCH: Update tournament stats (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body = await request.json()
    const goals = body.total_group_stage_goals

    if (typeof goals !== 'number' || !Number.isInteger(goals) || goals < 0) {
      return NextResponse.json(
        { error: 'total_group_stage_goals must be a non-negative integer' },
        { status: 400 }
      )
    }

    // Upsert tournament stats
    const { data: existing } = await admin
      .from('tournament_stats')
      .select('id')
      .eq('tournament_id', tournament.id)
      .single()

    if (existing) {
      const { error } = await admin
        .from('tournament_stats')
        .update({ total_group_stage_goals: goals })
        .eq('id', existing.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    } else {
      const { error } = await admin
        .from('tournament_stats')
        .insert({ tournament_id: tournament.id, total_group_stage_goals: goals })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
