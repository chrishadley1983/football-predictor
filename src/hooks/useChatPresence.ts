'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface PresenceState {
  playerId: string
  displayName: string
  isTyping: boolean
}

interface UseChatPresenceOptions {
  channel: RealtimeChannel | null
  currentPlayerId: string | null
  currentDisplayName: string
}

export function useChatPresence({ channel, currentPlayerId, currentDisplayName }: UseChatPresenceOptions) {
  const [onlineUsers, setOnlineUsers] = useState<{ playerId: string; displayName: string }[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)

  useEffect(() => {
    if (!channel || !currentPlayerId) return

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>()
        const users: { playerId: string; displayName: string }[] = []
        const typing: string[] = []

        for (const presences of Object.values(state)) {
          for (const p of presences) {
            if (p.playerId === currentPlayerId) continue
            if (!users.find((u) => u.playerId === p.playerId)) {
              users.push({ playerId: p.playerId, displayName: p.displayName })
            }
            if (p.isTyping && !typing.includes(p.displayName)) {
              typing.push(p.displayName)
            }
          }
        }

        setOnlineUsers(users)
        setTypingUsers(typing)
      })

    channel.track({
      playerId: currentPlayerId,
      displayName: currentDisplayName,
      isTyping: false,
    } satisfies PresenceState)

    return () => {
      channel.untrack()
    }
  }, [channel, currentPlayerId, currentDisplayName])

  const setTyping = useCallback((typing: boolean) => {
    if (!channel || !currentPlayerId) return
    if (isTypingRef.current === typing) return

    isTypingRef.current = typing
    channel.track({
      playerId: currentPlayerId,
      displayName: currentDisplayName,
      isTyping: typing,
    } satisfies PresenceState)

    // Auto-clear typing after 3s
    if (typing) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false
        channel.track({
          playerId: currentPlayerId,
          displayName: currentDisplayName,
          isTyping: false,
        } satisfies PresenceState)
      }, 3000)
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [channel, currentPlayerId, currentDisplayName])

  return { onlineUsers, typingUsers, setTyping }
}
