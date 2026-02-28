'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { TypingIndicator } from './TypingIndicator'
import { PinnedMessages } from './PinnedMessages'
import { useChatSound } from '@/hooks/useChatSound'
import { useChatPresence } from '@/hooks/useChatPresence'
import type { ChatMessageWithPlayer, ReactionSummary, Player } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

type PlayerInfo = Pick<Player, 'id' | 'display_name' | 'nickname' | 'avatar_url'>

interface ChatRoomProps {
  tournamentId: string
  currentPlayerId: string | null
  isAdmin?: boolean
}

type MessageWithStatus = ChatMessageWithPlayer & {
  _status?: 'sending' | 'failed'
  _tempId?: string
  is_pinned?: boolean
}

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

function mapRowToMessage(
  row: Record<string, unknown>,
  currentPlayerId: string | null
): MessageWithStatus {
  const replyRaw = row.reply_to as {
    id: string; content: string;
    player: { display_name: string; nickname: string | null }
  } | null

  return {
    id: row.id as string,
    tournament_id: row.tournament_id as string,
    player_id: row.player_id as string,
    content: row.content as string,
    created_at: row.created_at as string,
    reply_to_id: row.reply_to_id as string | null,
    message_type: row.message_type as ChatMessageWithPlayer['message_type'],
    metadata: row.metadata as Record<string, unknown> | null,
    is_pinned: (row.is_pinned as boolean) ?? false,
    player: row.player as { display_name: string; nickname: string | null; avatar_url: string | null },
    reply_to: replyRaw ? {
      id: replyRaw.id,
      content: replyRaw.content,
      player: replyRaw.player,
    } : null,
    reactions: aggregateReactions(
      (row.reactions as Array<{ emoji: string; player_id: string }>) ?? [],
      currentPlayerId
    ),
  }
}

export function ChatRoom({ tournamentId, currentPlayerId, isAdmin }: ChatRoomProps) {
  const [messages, setMessages] = useState<MessageWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<ChatMessageWithPlayer | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [cooldownActive, setCooldownActive] = useState(false)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newMessageCount, setNewMessageCount] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())
  const tempIdMapRef = useRef(new Map<string, string>())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const sound = useChatSound()
  const currentPlayer = players.find((p) => p.id === currentPlayerId)
  const presence = useChatPresence({
    channel: channelRef.current,
    currentPlayerId,
    currentDisplayName: currentPlayer?.nickname || currentPlayer?.display_name || 'Unknown',
  })

  // IntersectionObserver to detect if user is scrolled to bottom
  useEffect(() => {
    if (!bottomRef.current) return
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry.isIntersecting)
        if (entry.isIntersecting) {
          setNewMessageCount(0)
        }
      },
      { root: scrollContainerRef.current, threshold: 0.1 }
    )
    observerRef.current.observe(bottomRef.current)
    return () => observerRef.current?.disconnect()
  }, [loading])

  // Auto-scroll only when at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isAtBottom])

  // Update read cursor when at bottom
  useEffect(() => {
    if (!isAtBottom || !currentPlayerId || messages.length === 0) return
    const supabase = supabaseRef.current
    const lastMsg = messages[messages.length - 1]
    if (lastMsg._status) return // Don't update cursor for optimistic messages

    supabase
      .from('chat_read_cursors')
      .upsert({
        player_id: currentPlayerId,
        tournament_id: tournamentId,
        last_read_at: lastMsg.created_at,
      }, { onConflict: 'player_id,tournament_id' })
      .then(({ error: cursorErr }) => {
        if (cursorErr) console.error('Failed to update read cursor:', cursorErr.message)
      })
  }, [isAtBottom, messages, currentPlayerId, tournamentId])

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
      const mapped = data.map((row) => mapRowToMessage(row as unknown as Record<string, unknown>, currentPlayerId))
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
        .select('player:players(id, display_name, nickname, avatar_url)')
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

    const pollInterval = setInterval(fetchMessages, 15000)

    const channel = supabase
      .channel(`chat:${tournamentId}`, { config: { presence: { key: currentPlayerId || 'anon' } } })
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
          const senderId = payload.new.player_id as string

          // Check if this is a message we sent optimistically
          for (const [tempId, realId] of tempIdMapRef.current.entries()) {
            if (realId === newId) {
              setMessages((prev) =>
                prev.map((m) => m._tempId === tempId ? { ...m, _status: undefined, _tempId: undefined, id: newId } : m)
              )
              tempIdMapRef.current.delete(tempId)
              return
            }
          }

          // Skip if we already have this message
          setMessages((prev) => {
            if (prev.some((m) => m.id === newId)) return prev
            return prev
          })

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
            const msg = mapRowToMessage(data as unknown as Record<string, unknown>, currentPlayerId)
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev
              return [...prev, msg]
            })

            // Play sound for other people's messages
            if (senderId !== currentPlayerId) {
              sound.play()
              if (!isAtBottom) {
                setNewMessageCount((c) => c + 1)
              }
            }
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
      // Updated messages (pin/unpin)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        (payload) => {
          const updated = payload.new as { id: string; is_pinned: boolean }
          setMessages((prev) =>
            prev.map((m) => m.id === updated.id ? { ...m, is_pinned: updated.is_pinned } : m)
          )
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

    channelRef.current = channel

    return () => {
      clearInterval(pollInterval)
      supabase.removeChannel(channel)
      channelRef.current = null
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

  async function handlePin(messageId: string) {
    const supabase = supabaseRef.current
    const pinnedCount = messages.filter((m) => m.is_pinned).length
    if (pinnedCount >= 3) {
      setError('Maximum 3 pinned messages allowed')
      return
    }
    const { error: pinErr } = await supabase
      .from('chat_messages')
      .update({ is_pinned: true })
      .eq('id', messageId)
    if (pinErr) {
      setError(`Failed to pin: ${pinErr.message}`)
    }
  }

  async function handleUnpin(messageId: string) {
    const supabase = supabaseRef.current
    const { error: unpinErr } = await supabase
      .from('chat_messages')
      .update({ is_pinned: false })
      .eq('id', messageId)
    if (unpinErr) {
      setError(`Failed to unpin: ${unpinErr.message}`)
    }
  }

  async function handleSend(content: string, replyToId?: string, messageType?: string) {
    if (!currentPlayerId) return
    setError(null)

    // Client-side rate limit
    if (cooldownActive) return
    setCooldownActive(true)
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current)
    cooldownTimerRef.current = setTimeout(() => setCooldownActive(false), 3000)

    // Clear typing state
    presence.setTyping(false)

    const isGif = messageType === 'gif'

    // Optimistic: add message immediately with temp ID
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimisticMsg: MessageWithStatus = {
      id: tempId,
      tournament_id: tournamentId,
      player_id: currentPlayerId,
      content,
      created_at: new Date().toISOString(),
      reply_to_id: replyToId ?? null,
      message_type: isGif ? 'user' : 'user',
      metadata: isGif ? { type: 'gif' } : null,
      is_pinned: false,
      player: {
        display_name: currentPlayer?.display_name ?? 'You',
        nickname: currentPlayer?.nickname ?? null,
        avatar_url: currentPlayer?.avatar_url ?? null,
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
        metadata: isGif ? { type: 'gif' } : null,
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Failed to send message:', insertError.message)
      const isRateLimit = insertError.message.includes('Rate limit')
      setError(isRateLimit ? 'Please wait before sending another message' : `Failed to send: ${insertError.message}`)
      setMessages((prev) =>
        prev.map((m) => m._tempId === tempId ? { ...m, _status: 'failed' } : m)
      )
      return
    }

    if (inserted) {
      tempIdMapRef.current.set(tempId, inserted.id)
      setMessages((prev) =>
        prev.map((m) => m._tempId === tempId ? { ...m, id: inserted.id, _status: undefined } : m)
      )

      // Extract and insert mentions (skip for GIFs)
      if (!isGif) {
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
  }

  async function handleRetry(message: MessageWithStatus) {
    setMessages((prev) => prev.filter((m) => m._tempId !== message._tempId))
    const isGif = message.metadata?.type === 'gif'
    await handleSend(message.content, message.reply_to_id ?? undefined, isGif ? 'gif' : undefined)
  }

  async function handleReact(messageId: string, emoji: string) {
    if (!currentPlayerId) return
    const supabase = supabaseRef.current

    const msg = messages.find((m) => m.id === messageId)
    const existingReaction = msg?.reactions?.find((r) => r.emoji === emoji && r.reacted)

    if (existingReaction) {
      const { error: delErr } = await supabase
        .from('chat_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('player_id', currentPlayerId)
        .eq('emoji', emoji)
      if (delErr) console.error('Failed to remove reaction:', delErr.message)
    } else {
      const { error: insErr } = await supabase
        .from('chat_reactions')
        .insert({ message_id: messageId, player_id: currentPlayerId, emoji })
      if (insErr) console.error('Failed to add reaction:', insErr.message)
    }
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setNewMessageCount(0)
  }

  function handleTyping() {
    presence.setTyping(true)
  }

  const pinnedMessages = messages.filter((m) => m.is_pinned)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-text-muted">Loading chat...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg border border-border-custom bg-surface">
      {/* Header with online count and sound toggle */}
      <div className="flex items-center justify-between border-b border-border-custom px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-text-muted">
              {presence.onlineUsers.length + (currentPlayerId ? 1 : 0)} online
            </span>
          </div>
        </div>
        <button
          onClick={sound.toggle}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-foreground"
          title={sound.enabled ? 'Mute notifications' : 'Enable notifications'}
        >
          {sound.enabled ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-md bg-red-accent/10 p-2 text-sm text-red-accent">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-xs underline">dismiss</button>
        </div>
      )}

      {/* Pinned messages */}
      <PinnedMessages
        messages={pinnedMessages}
        onUnpin={isAdmin ? handleUnpin : undefined}
      />

      {/* Messages area */}
      <div ref={scrollContainerRef} className="relative flex h-[28rem] flex-col gap-2 overflow-y-auto p-4">
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
            isAdmin={isAdmin}
            onDelete={isAdmin ? handleDelete : undefined}
            onReply={currentPlayerId ? setReplyingTo : undefined}
            onReact={currentPlayerId ? handleReact : undefined}
            onRetry={msg._status === 'failed' ? handleRetry : undefined}
            onPin={isAdmin ? handlePin : undefined}
            onUnpin={isAdmin ? handleUnpin : undefined}
          />
        ))}
        <div ref={bottomRef} />

        {/* Typing indicator */}
        <TypingIndicator typingUsers={presence.typingUsers} />

        {/* New messages floating pill */}
        {!isAtBottom && newMessageCount > 0 && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-black shadow-lg transition-transform hover:scale-105"
          >
            {newMessageCount} new message{newMessageCount !== 1 ? 's' : ''} ↓
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border-custom p-3">
        {currentPlayerId ? (
          <ChatInput
            onSend={handleSend}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
            players={players}
            cooldownActive={cooldownActive}
            onTyping={handleTyping}
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
