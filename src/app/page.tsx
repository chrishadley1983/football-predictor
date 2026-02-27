import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TournamentCard } from '@/components/TournamentCard'
import { HonoursBoard } from '@/components/HonoursBoard'
import { MiniChat } from '@/components/MiniChat'
import type { Tournament, HonoursWithDetails } from '@/lib/types'

export default async function HomePage() {
  const supabase = await createClient()

  // Fetch tournaments
  const { data: tournaments, error: tournamentsErr } = await supabase
    .from('tournaments')
    .select('*')
    .neq('status', 'draft')
    .order('year', { ascending: false })

  if (tournamentsErr) console.error('Failed to fetch tournaments:', tournamentsErr.message)

  // Fetch honours
  const { data: honours, error: honoursErr } = await supabase
    .from('honours')
    .select(`
      *,
      tournament:tournaments (*),
      player:players (id, display_name, nickname, avatar_url)
    `)
    .order('id')

  if (honoursErr) console.error('Failed to fetch honours:', honoursErr.message)

  // Fetch recent posts
  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('*, tournament:tournaments (name, slug)')
    .eq('is_published', true)
    .order('published_at', { ascending: false })
    .limit(3)

  if (postsErr) console.error('Failed to fetch posts:', postsErr.message)

  const allTournaments = (tournaments as Tournament[] | null) ?? []
  const currentTournament = allTournaments.find((t) => t.status !== 'completed')
  const previousTournaments = allTournaments.filter((t) => t.status === 'completed')

  return (
    <div className="space-y-14">
      {/* Section 1: Intro + Video */}
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h1 className="shimmer-text font-heading text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Football Prediction Game
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-text-secondary">
            Think you know football? Prove it. Predict group stage outcomes and knockout bracket results
            for major international tournaments. Compete against your mates for bragging rights, prizes,
            and a spot on the Honours Board.
          </p>
          <p className="mt-3 text-text-muted">
            AI pundits roast your predictions. A live chat fuels the banter.
            And one Golden Ticket could change everything.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="inline-block rounded-lg bg-gold px-6 py-2.5 font-heading text-sm font-bold text-background transition-colors hover:bg-gold-light"
            >
              Join Now
            </Link>
            {currentTournament && (
              <Link
                href={`/tournament/${currentTournament.slug}`}
                className="inline-block rounded-lg border border-gold/30 px-6 py-2.5 font-heading text-sm font-bold text-gold transition-colors hover:border-gold hover:bg-gold/10"
              >
                View Tournament
              </Link>
            )}
          </div>
        </div>
        <div>
          <video
            className="w-full rounded-xl shadow-lg shadow-black/30"
            controls
            muted
            playsInline
            preload="metadata"
            poster=""
          >
            <source src="/prediction-pod.mp4" type="video/mp4" />
          </video>
          <p className="mt-2 text-center text-xs text-text-muted">
            The Prediction Pod &mdash; World Cup 2026 Preview
          </p>
        </div>
      </section>

      {/* Section 2: Current Tournament + Mini Chat */}
      {currentTournament && (
        <section>
          <h2 className="mb-4 font-heading text-xl font-bold text-foreground">Current Tournament</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <TournamentCard tournament={currentTournament} />
            <MiniChat tournamentId={currentTournament.id} tournamentSlug={currentTournament.slug} />
          </div>
        </section>
      )}

      {/* Section 3: Recent Posts */}
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

      {/* Section 4: Honours Board */}
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

      {/* Section 5: Previous Tournaments */}
      {previousTournaments.length > 0 && (
        <section>
          <h2 className="mb-4 font-heading text-xl font-bold text-foreground">Previous Tournaments</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {previousTournaments.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
