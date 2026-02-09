import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

// GET: List all tournaments (public, authenticated users)
export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('year', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create tournament (admin only)
export async function POST(request: Request) {
  try {
    await requireAdmin()

    const supabase = await createClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        name: body.name,
        slug: body.slug,
        type: body.type,
        year: body.year,
        entry_fee_gbp: body.entry_fee_gbp ?? 10.0,
        group_stage_prize_pct: body.group_stage_prize_pct ?? 25,
        overall_prize_pct: body.overall_prize_pct ?? 75,
        group_stage_deadline: body.group_stage_deadline ?? null,
        knockout_stage_deadline: body.knockout_stage_deadline ?? null,
        status: body.status ?? 'draft',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
