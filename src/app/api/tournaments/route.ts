import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

    const admin = createAdminClient()
    const body = await request.json()

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!body.slug || typeof body.slug !== 'string' || !body.slug.trim()) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }
    if (!body.type || !['world_cup', 'euros'].includes(body.type)) {
      return NextResponse.json({ error: 'type must be "world_cup" or "euros"' }, { status: 400 })
    }
    if (!body.year || typeof body.year !== 'number' || body.year < 2000) {
      return NextResponse.json({ error: 'year is required and must be >= 2000' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('tournaments')
      .insert({
        name: body.name.trim(),
        slug: body.slug.trim(),
        type: body.type,
        year: body.year,
        entry_fee_gbp: body.entry_fee_gbp ?? 10.0,
        group_stage_prize_pct: body.group_stage_prize_pct ?? 25,
        overall_prize_pct: body.overall_prize_pct ?? 75,
        group_stage_deadline: body.group_stage_deadline ?? null,
        knockout_stage_deadline: body.knockout_stage_deadline ?? null,
        status: 'draft',
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
