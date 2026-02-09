import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { calculateAllScores } from '@/lib/scoring'

// POST: Trigger scoring calculation (admin only)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const supabase = await createClient()

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    await calculateAllScores(tournament.id)

    return NextResponse.json({ success: true, message: 'Scoring calculation complete' })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
