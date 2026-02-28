'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ShareInChatButtonProps {
  tournamentId: string
  content: string
  className?: string
}

export function ShareInChatButton({ tournamentId, content, className }: ShareInChatButtonProps) {
  const [shared, setShared] = useState(false)
  const [sharing, setSharing] = useState(false)

  async function handleShare() {
    setSharing(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSharing(false)
      return
    }

    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!player) {
      setSharing(false)
      return
    }

    const { error } = await supabase
      .from('chat_messages')
      .insert({
        tournament_id: tournamentId,
        player_id: player.id,
        content,
      })

    setSharing(false)
    if (!error) {
      setShared(true)
      setTimeout(() => setShared(false), 3000)
    }
  }

  return (
    <button
      onClick={handleShare}
      disabled={sharing || shared}
      className={className ?? 'inline-flex items-center gap-1 rounded-md bg-gold/10 px-2.5 py-1 text-xs font-medium text-gold transition-colors hover:bg-gold/20 disabled:opacity-50'}
    >
      {shared ? 'Shared!' : sharing ? 'Sharing...' : 'Share in chat'}
    </button>
  )
}
