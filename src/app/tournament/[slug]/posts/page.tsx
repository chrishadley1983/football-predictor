import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import type { Tournament, Post } from '@/lib/types'

export default async function PostsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament, error: tournamentErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (tournamentErr) console.error('Failed to fetch tournament:', tournamentErr.message)
  if (!tournament) notFound()

  const t = tournament as Tournament

  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('*')
    .eq('tournament_id', t.id)
    .eq('is_published', true)
    .order('published_at', { ascending: false })

  if (postsErr) console.error('Failed to fetch posts:', postsErr.message)

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">{t.name} - Posts</h1>

      {(!posts || posts.length === 0) ? (
        <p className="py-8 text-center text-sm text-text-muted">No posts yet.</p>
      ) : (
        <div className="space-y-4">
          {(posts as Post[]).map((post) => (
            <Link
              key={post.id}
              href={`/tournament/${slug}/posts/${post.slug}`}
              className="block rounded-xl border border-border-custom bg-surface p-4 transition-all hover:border-gold/30 hover:shadow-lg hover:shadow-black/20"
            >
              <h2 className="text-lg font-semibold text-foreground">{post.title}</h2>
              <div className="mt-1 flex items-center gap-3 text-sm text-text-secondary">
                <span>{post.author}</span>
                <span>{formatDate(post.published_at)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
                {post.content.length > 200 ? `${post.content.slice(0, 200)}...` : post.content}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
