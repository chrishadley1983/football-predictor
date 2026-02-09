import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ChatRoom } from '@/components/chat/ChatRoom'
import type { Tournament } from '@/lib/types'

export default async function ChatPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()

  const t = tournament as Tournament

  // Get current player and admin status if authenticated
  let currentPlayerId: string | null = null
  let isAdmin = false
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    isAdmin = user.app_metadata?.role === 'admin'
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    currentPlayerId = player?.id ?? null
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/tournament/${slug}`}
          className="text-sm text-text-muted hover:text-gold"
        >
          &larr; Back
        </Link>
        <h1 className="font-heading text-xl font-bold text-foreground">
          {t.name} &mdash; Chat
        </h1>
      </div>
      <ChatRoom tournamentId={t.id} currentPlayerId={currentPlayerId} isAdmin={isAdmin} />
    </div>
  )
}
