import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'

// GET: List posts for tournament
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
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

    const { data: posts, error } = await supabase
      .from('posts')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('is_published', true)
      .order('published_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(posts ?? [])
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: Create post (admin only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    // Get tournament
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body = await request.json()

    if (!body.title || !body.slug || !body.content) {
      return NextResponse.json(
        { error: 'title, slug, and content are required' },
        { status: 400 }
      )
    }

    const { data: post, error } = await admin
      .from('posts')
      .insert({
        tournament_id: tournament.id,
        title: body.title,
        slug: body.slug,
        content: body.content,
        author: body.author ?? 'Admin',
        is_published: body.is_published ?? true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(post, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
