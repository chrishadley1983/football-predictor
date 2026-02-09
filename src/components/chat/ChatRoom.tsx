'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import type { ChatMessageWithPlayer } from '@/lib/types'

interface ChatRoomProps {
  tournamentId: string
  currentPlayerId: string | null
}

export function ChatRoom({ tournamentId, currentPlayerId }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageWithPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    const supabase = supabaseRef.current
    const { data } = await supabase
      .from('chat_messages')
      .select('*, player:players!chat_messages_player_id_fkey(display_name, nickname)')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) {
      const mapped = data.map((row) => ({
        id: row.id,
        tournament_id: row.tournament_id,
        player_id: row.player_id,
        content: row.content,
        created_at: row.created_at,
        player: row.player as unknown as { display_name: string; nickname: string | null },
      }))
      setMessages(mapped)
    }
    return data
  }

  // Load initial messages and subscribe to realtime
  useEffect(() => {
    const supabase = supabaseRef.current

    fetchMessages().then(() => setLoading(false))

    // Poll for new messages every 3 seconds as a fallback
    // (Realtime requires the table to be added to supabase_realtime publication)
    const pollInterval = setInterval(() => {
      fetchMessages()
    }, 3000)

    const channel = supabase
      .channel(`chat:${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        async (payload) => {
          // Fetch the full message with player info
          const { data } = await supabase
            .from('chat_messages')
            .select('*, player:players!chat_messages_player_id_fkey(display_name, nickname)')
            .eq('id', payload.new.id)
            .single()

          if (data) {
            const msg: ChatMessageWithPlayer = {
              id: data.id,
              tournament_id: data.tournament_id,
              player_id: data.player_id,
              content: data.content,
              created_at: data.created_at,
              player: data.player as unknown as { display_name: string; nickname: string | null },
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })
          }
        }
      )
      .subscribe()

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  async function handleSend(content: string) {
    if (!currentPlayerId) return
    setError(null)

    const supabase = supabaseRef.current
    const { data: inserted, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        tournament_id: tournamentId,
        player_id: currentPlayerId,
        content,
      })
      .select('*, player:players!chat_messages_player_id_fkey(display_name, nickname)')
      .single()

    if (insertError) {
      console.error('Failed to send message:', insertError.message)
      setError(`Failed to send: ${insertError.message}`)
      return
    }

    if (inserted) {
      const msg: ChatMessageWithPlayer = {
        id: inserted.id,
        tournament_id: inserted.tournament_id,
        player_id: inserted.player_id,
        content: inserted.content,
        created_at: inserted.created_at,
        player: inserted.player as unknown as { display_name: string; nickname: string | null },
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-text-muted">Loading chat...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg border border-border-custom bg-surface">
      {error && (
        <div className="mx-4 mt-3 rounded-md bg-red-accent/10 p-2 text-sm text-red-accent">
          {error}
        </div>
      )}
      {/* Messages area */}
      <div className="flex h-[28rem] flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-text-muted">
            No messages yet. Start the conversation!
          </p>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isOwnMessage={msg.player_id === currentPlayerId}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border-custom p-3">
        {currentPlayerId ? (
          <ChatInput onSend={handleSend} />
        ) : (
          <p className="text-center text-sm text-text-muted">
            Sign in to join the chat
          </p>
        )}
      </div>
    </div>
  )
}
