import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import type { Tournament, Post } from '@/lib/types'

export default async function PostsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()

  const t = tournament as Tournament

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('tournament_id', t.id)
    .eq('is_published', true)
    .order('published_at', { ascending: false })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.name} - Posts</h1>

      {(!posts || posts.length === 0) ? (
        <p className="py-8 text-center text-sm text-gray-500">No posts yet.</p>
      ) : (
        <div className="space-y-4">
          {(posts as Post[]).map((post) => (
            <Link
              key={post.id}
              href={`/tournament/${slug}/posts/${post.slug}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{post.title}</h2>
              <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span>{post.author}</span>
                <span>{formatDate(post.published_at)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                {post.content.slice(0, 200)}...
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
