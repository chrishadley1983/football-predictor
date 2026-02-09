import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TournamentCard } from '@/components/TournamentCard'
import { HonoursBoard } from '@/components/HonoursBoard'
import type { Tournament, HonoursWithDetails } from '@/lib/types'

export default async function HomePage() {
  const supabase = await createClient()

  // Fetch tournaments
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .neq('status', 'draft')
    .order('year', { ascending: false })

  // Fetch honours
  const { data: honours } = await supabase
    .from('honours')
    .select(`
      *,
      tournament:tournaments (*),
      player:players (*)
    `)
    .order('id')

  // Fetch recent posts
  const { data: posts } = await supabase
    .from('posts')
    .select('*, tournament:tournaments (name, slug)')
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(3)

  const currentTournament = (tournaments as Tournament[] | null)?.find(
    (t) => t.status !== 'completed'
  )

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-gray-100">
          Football Prediction Game
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-gray-600 dark:text-gray-400">
          Predict group stage outcomes and knockout bracket results for major international tournaments.
          Compete with friends for prizes.
        </p>
      </section>

      {/* Current/Upcoming Tournament */}
      {currentTournament && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Current Tournament</h2>
          <div className="max-w-md">
            <TournamentCard tournament={currentTournament} />
          </div>
        </section>
      )}

      {/* All Tournaments */}
      {tournaments && tournaments.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Tournaments</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(tournaments as Tournament[]).map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Posts */}
      {posts && posts.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">Recent Posts</h2>
          <div className="space-y-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/tournament/${(post.tournament as { slug: string })?.slug}/posts/${post.slug}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900"
              >
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{post.title}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {post.author} &middot; {new Date(post.published_at).toLocaleDateString('en-GB')}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Honours Board Preview */}
      {honours && honours.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Honours Board</h2>
            <Link href="/honours" className="text-sm font-medium text-green-600 hover:text-green-700">
              View all
            </Link>
          </div>
          <HonoursBoard honours={honours as HonoursWithDetails[]} />
        </section>
      )}
    </div>
  )
}
