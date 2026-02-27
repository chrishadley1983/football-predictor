'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import type { ChatMessageWithPlayer, ReactionSummary, Player } from '@/lib/types'

type PlayerInfo = Pick<Player, 'id' | 'display_name' | 'nickname'>

interface ChatRoomProps {
  tournamentId: string
  currentPlayerId: string | null
  isAdmin?: boolean
}

type MessageWithStatus = ChatMessageWithPlayer & { _status?: 'sending' | 'failed'; _tempId?: string }

/** Aggregate raw reaction rows into ReactionSummary[] */
function aggregateReactions(
  reactions: Array<{ emoji: string; player_id: string }>,
  currentPlayerId: string | null
): ReactionSummary[] {
  const map = new Map<string, { count: number; reacted: boolean }>()
  for (const r of reactions) {
    const existing = map.get(r.emoji) || { count: 0, reacted: false }
    existing.count++
    if (r.player_id === currentPlayerId) existing.reacted = true
    map.set(r.emoji, existing)
  }
  return Array.from(map, ([emoji, data]) => ({ emoji, ...data }))
}

export function ChatRoom({ tournamentId, currentPlayerId, isAdmin }: ChatRoomProps) {
  const [messages, setMessages] = useState<MessageWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<ChatMessageWithPlayer | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())
  const tempIdMapRef = useRef(new Map<string, string>()) // tempId -> realId

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMessages = useCallback(async () => {
    const supabase = supabaseRef.current
    const { data } = await supabase
      .from('chat_messages')
      .select(`
        *,
        player:players!chat_messages_player_id_fkey(display_name, nickname, avatar_url),
        reply_to:chat_messages!chat_messages_reply_to_id_fkey(
          id, content,
          player:players!chat_messages_player_id_fkey(display_name, nickname)
        ),
        reactions:chat_reactions(emoji, player_id)
      `)
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (data) {
      const mapped: MessageWithStatus[] = data.map((row) => {
        const replyRaw = row.reply_to as unknown as {
          id: string; content: string;
          player: { display_name: string; nickname: string | null }
        } | null

        return {
          id: row.id,
          tournament_id: row.tournament_id,
          player_id: row.player_id,
          content: row.content,
          created_at: row.created_at,
          reply_to_id: row.reply_to_id,
          message_type: row.message_type as ChatMessageWithPlayer['message_type'],
          metadata: row.metadata as Record<string, unknown> | null,
          player: row.player as unknown as { display_name: string; nickname: string | null; avatar_url: string | null },
          reply_to: replyRaw ? {
            id: replyRaw.id,
            content: replyRaw.content,
            player: replyRaw.player,
          } : null,
          reactions: aggregateReactions(
            (row.reactions as unknown as Array<{ emoji: string; player_id: string }>) ?? [],
            currentPlayerId
          ),
        }
      })
      setMessages(mapped)
    }
    return data
  }, [tournamentId, currentPlayerId])

  // Fetch tournament players for @mention autocomplete
  useEffect(() => {
    async function fetchPlayers() {
      const supabase = supabaseRef.current
      const { data } = await supabase
        .from('tournament_entries')
        .select('player:players(id, display_name, nickname)')
        .eq('tournament_id', tournamentId)

      if (data) {
        const playerList = data
          .map((e) => e.player as unknown as PlayerInfo)
          .filter(Boolean)
        setPlayers(playerList)
      }
    }
    fetchPlayers()
  }, [tournamentId])

  // Load initial messages and subscribe to realtime
  useEffect(() => {
    const supabase = supabaseRef.current

    fetchMessages().then(() => setLoading(false))

    // Reduced polling interval since we have proper realtime now
    const pollInterval = setInterval(fetchMessages, 15000)

    const channel = supabase
      .channel(`chat:${tournamentId}`)
      // New messages
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        async (payload) => {
          const newId = payload.new.id as string

          // Check if this is a message we sent optimistically
          for (const [tempId, realId] of tempIdMapRef.current.entries()) {
            if (realId === newId) {
              // Already handled optimistically, just update status
              setMessages((prev) =>
                prev.map((m) => m._tempId === tempId ? { ...m, _status: undefined, _tempId: undefined, id: newId } : m)
              )
              tempIdMapRef.current.delete(tempId)
              return
            }
          }

          // Skip if we already have this message
          if (messages.some((m) => m.id === newId)) return

          // Fetch full message with joins
          const { data } = await supabase
            .from('chat_messages')
            .select(`
              *,
              player:players!chat_messages_player_id_fkey(display_name, nickname, avatar_url),
              reply_to:chat_messages!chat_messages_reply_to_id_fkey(
                id, content,
                player:players!chat_messages_player_id_fkey(display_name, nickname)
              ),
              reactions:chat_reactions(emoji, player_id)
            `)
            .eq('id', newId)
            .single()

          if (data) {
            const replyRaw = data.reply_to as unknown as {
              id: string; content: string;
              player: { display_name: string; nickname: string | null }
            } | null

            const msg: MessageWithStatus = {
              id: data.id,
              tournament_id: data.tournament_id,
              player_id: data.player_id,
              content: data.content,
              created_at: data.created_at,
              reply_to_id: data.reply_to_id,
              message_type: data.message_type as ChatMessageWithPlayer['message_type'],
              metadata: data.metadata as Record<string, unknown> | null,
              player: data.player as unknown as { display_name: string; nickname: string | null; avatar_url: string | null },
              reply_to: replyRaw ? {
                id: replyRaw.id,
                content: replyRaw.content,
                player: replyRaw.player,
              } : null,
              reactions: aggregateReactions(
                (data.reactions as unknown as Array<{ emoji: string; player_id: string }>) ?? [],
                currentPlayerId
              ),
            }
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })
          }
        }
      )
      // Deleted messages
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_messages',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id))
        }
      )
      // New reactions
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_reactions',
        },
        (payload) => {
          const { message_id, emoji, player_id } = payload.new as { message_id: string; emoji: string; player_id: string }
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== message_id) return m
              const existing = m.reactions ?? []
              const idx = existing.findIndex((r) => r.emoji === emoji)
              if (idx >= 0) {
                const updated = [...existing]
                updated[idx] = {
                  ...updated[idx],
                  count: updated[idx].count + 1,
                  reacted: updated[idx].reacted || player_id === currentPlayerId,
                }
                return { ...m, reactions: updated }
              }
              return {
                ...m,
                reactions: [...existing, { emoji, count: 1, reacted: player_id === currentPlayerId }],
              }
            })
          )
        }
      )
      // Removed reactions
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_reactions',
        },
        (payload) => {
          const { message_id, emoji, player_id } = payload.old as { message_id: string; emoji: string; player_id: string }
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== message_id) return m
              const existing = m.reactions ?? []
              const idx = existing.findIndex((r) => r.emoji === emoji)
              if (idx < 0) return m
              const updated = [...existing]
              const newCount = updated[idx].count - 1
              if (newCount <= 0) {
                updated.splice(idx, 1)
              } else {
                updated[idx] = {
                  ...updated[idx],
                  count: newCount,
                  reacted: player_id === currentPlayerId ? false : updated[idx].reacted,
                }
              }
              return { ...m, reactions: updated }
            })
          )
        }
      )
      .subscribe()

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, fetchMessages])

  async function handleDelete(messageId: string) {
    const supabase = supabaseRef.current
    const { error: deleteError } = await supabase
      .from('chat_messages')
      .delete()
      .eq('id', messageId)

    if (deleteError) {
      console.error('Failed to delete message:', deleteError.message)
      setError(`Failed to delete: ${deleteError.message}`)
      return
    }

    setMessages((prev) => prev.filter((m) => m.id !== messageId))
  }

  async function handleSend(content: string, replyToId?: string) {
    if (!currentPlayerId) return
    setError(null)

    // Optimistic: add message immediately with temp ID
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const currentPlayer = players.find((p) => p.id === currentPlayerId)
    const optimisticMsg: MessageWithStatus = {
      id: tempId,
      tournament_id: tournamentId,
      player_id: currentPlayerId,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: replyToId ?? null,
      message_type: 'user',
      metadata: null,
      player: {
        display_name: currentPlayer?.display_name ?? 'You',
        nickname: currentPlayer?.nickname ?? null,
        avatar_url: null,
      },
      reply_to: replyToId ? (() => {
        const replyMsg = messages.find((m) => m.id === replyToId)
        return replyMsg ? { id: replyMsg.id, content: replyMsg.content, player: replyMsg.player } : null
      })() : null,
      reactions: [],
      _status: 'sending',
      _tempId: tempId,
    }

    setMessages((prev) => [...prev, optimisticMsg])

    const supabase = supabaseRef.current
    const { data: inserted, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        tournament_id: tournamentId,
        player_id: currentPlayerId,
        content,
        reply_to_id: replyToId ?? null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to send message:', insertError.message)
      setError(`Failed to send: ${insertError.message}`)
      // Mark as failed
      setMessages((prev) =>
        prev.map((m) => m._tempId === tempId ? { ...m, _status: 'failed' } : m)
      )
      return
    }

    if (inserted) {
      // Map temp ID to real ID for realtime dedup
      tempIdMapRef.current.set(tempId, inserted.id)
      // Update optimistic message with real ID
      setMessages((prev) =>
        prev.map((m) => m._tempId === tempId ? { ...m, id: inserted.id, _status: undefined } : m)
      )

      // Extract and insert mentions
      const mentionPattern = /@(\w[\w\s]*?\w)(?=\s|$|[.,!?])/g
      const mentionMatches = [...content.matchAll(mentionPattern)]
      if (mentionMatches.length > 0 && players.length > 0) {
        const mentionedIds: string[] = []
        for (const match of mentionMatches) {
          const mentionName = match[1].toLowerCase()
          const player = players.find(
            (p) =>
              p.display_name.toLowerCase() === mentionName ||
              (p.nickname && p.nickname.toLowerCase() === mentionName)
          )
          if (player && !mentionedIds.includes(player.id)) {
            mentionedIds.push(player.id)
          }
        }
        if (mentionedIds.length > 0) {
          // Fire-and-forget mention inserts
          supabase
            .from('chat_mentions')
            .insert(mentionedIds.map((pid) => ({
              message_id: inserted.id,
              mentioned_player_id: pid,
            })))
            .then(({ error: mentionErr }) => {
              if (mentionErr) console.error('Failed to insert mentions:', mentionErr.message)
            })
        }
      }
    }
  }

  async function handleRetry(message: MessageWithStatus) {
    // Remove failed message and re-send
    setMessages((prev) => prev.filter((m) => m._tempId !== message._tempId))
    await handleSend(message.content, message.reply_to_id ?? undefined)
  }

  async function handleReact(messageId: string, emoji: string) {
    if (!currentPlayerId) return
    const supabase = supabaseRef.current

    // Check if already reacted
    const msg = messages.find((m) => m.id === messageId)
    const existingReaction = msg?.reactions?.find((r) => r.emoji === emoji && r.reacted)

    if (existingReaction) {
      // Remove reaction
      await supabase
        .from('chat_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('player_id', currentPlayerId)
        .eq('emoji', emoji)
    } else {
      // Add reaction
      await supabase
        .from('chat_reactions')
        .insert({ message_id: messageId, player_id: currentPlayerId, emoji })
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
            key={msg._tempId || msg.id}
            message={msg}
            isOwnMessage={msg.player_id === currentPlayerId}
            currentPlayerId={currentPlayerId}
            onDelete={isAdmin ? handleDelete : undefined}
            onReply={currentPlayerId ? setReplyingTo : undefined}
            onReact={currentPlayerId ? handleReact : undefined}
            onRetry={msg._status === 'failed' ? handleRetry : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border-custom p-3">
        {currentPlayerId ? (
          <ChatInput
            onSend={handleSend}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            players={players}
          />
        ) : (
          <p className="text-center text-sm text-text-muted">
            Sign in to join the chat
          </p>
        )}
      </div>
    </div>
  )
}
