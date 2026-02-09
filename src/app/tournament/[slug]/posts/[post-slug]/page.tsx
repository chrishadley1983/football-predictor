import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BlogPost } from '@/components/BlogPost'
import type { Tournament, Post } from '@/lib/types'

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string; 'post-slug': string }>
}) {
  const { slug, 'post-slug': postSlug } = await params
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()

  const t = tournament as Tournament

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('tournament_id', t.id)
    .eq('slug', postSlug)
    .eq('is_published', true)
    .single()

  if (!post) notFound()

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/tournament/${slug}/posts`}
        className="mb-4 inline-block text-sm text-green-600 hover:text-green-700"
      >
        &larr; Back to posts
      </Link>
      <BlogPost post={post as Post} />
    </div>
  )
}
