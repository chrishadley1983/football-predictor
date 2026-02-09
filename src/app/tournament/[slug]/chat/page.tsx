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

  // Get current player if authenticated
  let currentPlayerId: string | null = null
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
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
          className="text-sm text-gray-500 hover:text-green-600 dark:text-gray-400"
        >
          &larr; Back
        </Link>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {t.name} &mdash; Chat
        </h1>
      </div>
      <ChatRoom tournamentId={t.id} currentPlayerId={currentPlayerId} />
    </div>
  )
}
