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
        <h1 className="shimmer-text font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Football Prediction Game
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-text-secondary">
          Predict group stage outcomes and knockout bracket results for major international tournaments.
          Compete with friends for prizes.
        </p>
      </section>

      {/* Current/Upcoming Tournament */}
      {currentTournament && (
        <section>
          <h2 className="mb-4 font-heading text-xl font-bold text-foreground">Current Tournament</h2>
          <div className="max-w-md">
            <TournamentCard tournament={currentTournament} />
          </div>
        </section>
      )}

      {/* All Tournaments */}
      {tournaments && tournaments.length > 0 && (
        <section>
          <h2 className="mb-4 font-heading text-xl font-bold text-foreground">Tournaments</h2>
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
          <h2 className="mb-4 font-heading text-xl font-bold text-foreground">Recent Posts</h2>
          <div className="space-y-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/tournament/${(post.tournament as { slug: string })?.slug}/posts/${post.slug}`}
                className="block rounded-xl border border-border-custom bg-surface p-4 transition-all hover:border-gold/30 hover:shadow-lg hover:shadow-black/20"
              >
                <h3 className="font-semibold text-foreground">{post.title}</h3>
                <p className="mt-1 text-sm text-text-secondary">
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
            <h2 className="font-heading text-xl font-bold text-foreground">Honours Board</h2>
            <Link href="/honours" className="text-sm font-medium text-gold hover:text-gold-light">
              View all
            </Link>
          </div>
          <HonoursBoard honours={honours as HonoursWithDetails[]} />
        </section>
      )}
    </div>
  )
}
