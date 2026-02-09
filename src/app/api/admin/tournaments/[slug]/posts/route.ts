import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth'

// PATCH: Update a post (admin only)
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

    if (!body.id) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 })
    }

    // Verify the post belongs to this tournament
    const { data: existing } = await admin
      .from('posts')
      .select('id')
      .eq('id', body.id)
      .eq('tournament_id', tournament.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const updates: Record<string, unknown> = {}
    if (body.title !== undefined) updates.title = body.title
    if (body.slug !== undefined) updates.slug = body.slug
    if (body.content !== undefined) updates.content = body.content
    if (body.image_url !== undefined) updates.image_url = body.image_url
    if (body.is_published !== undefined) updates.is_published = body.is_published

    const { data: post, error } = await admin
      .from('posts')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(post)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete a post (admin only)
export async function DELETE(
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

    if (!body.id) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 })
    }

    // Verify the post belongs to this tournament
    const { data: existing } = await admin
      .from('posts')
      .select('id')
      .eq('id', body.id)
      .eq('tournament_id', tournament.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const { error } = await admin
      .from('posts')
      .delete()
      .eq('id', body.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
