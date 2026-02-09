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
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load initial messages and subscribe to realtime
  useEffect(() => {
    const supabase = supabaseRef.current

    async function loadMessages() {
      const { data } = await supabase
        .from('chat_messages')
        .select('*, player:players!chat_messages_player_id_fkey(display_name, nickname)')
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: true })
        .limit(50)

      if (data) {
        // Supabase returns player as an object (single relation via fkey)
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
      setLoading(false)
    }

    loadMessages()

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
              // Avoid duplicates (e.g. if we inserted it ourselves)
              if (prev.some((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tournamentId])

  async function handleSend(content: string) {
    if (!currentPlayerId) return

    const supabase = supabaseRef.current
    const { error } = await supabase.from('chat_messages').insert({
      tournament_id: tournamentId,
      player_id: currentPlayerId,
      content,
    })

    if (error) {
      console.error('Failed to send message:', error.message)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading chat...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Messages area */}
      <div className="flex h-[28rem] flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500">
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
      <div className="border-t border-gray-200 p-3 dark:border-gray-700">
        {currentPlayerId ? (
          <ChatInput onSend={handleSend} />
        ) : (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Sign in to join the chat
          </p>
        )}
      </div>
    </div>
  )
}
