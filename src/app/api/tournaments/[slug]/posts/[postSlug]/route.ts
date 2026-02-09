import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Get single post
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; postSlug: string }> }
) {
  try {
    const { slug, postSlug } = await params
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

    const { data: post, error } = await supabase
      .from('posts')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('slug', postSlug)
      .eq('is_published', true)
      .single()

    if (error || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    return NextResponse.json(post)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
