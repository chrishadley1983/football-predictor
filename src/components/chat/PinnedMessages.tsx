'use client'

import { useState } from 'react'
import { isPunditPlayer, getPunditByPlayerId } from '@/lib/pundit-players'
import type { ChatMessageWithPlayer } from '@/lib/types'

interface PinnedMessagesProps {
  messages: ChatMessageWithPlayer[]
  onUnpin?: (messageId: string) => void
}

export function PinnedMessages({ messages, onUnpin }: PinnedMessagesProps) {
  const [expanded, setExpanded] = useState(false)

  if (messages.length === 0) return null

  return (
    <div className="border-b border-border-custom bg-gold/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 text-gold" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
          </svg>
          <span className="text-xs font-medium text-gold">
            {messages.length} pinned message{messages.length !== 1 ? 's' : ''}
          </span>
        </div>
        <svg
          className={`h-3.5 w-3.5 text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="space-y-2 px-4 pb-3">
          {messages.map((msg) => {
            const pundit = isPunditPlayer(msg.player_id) ? getPunditByPlayerId(msg.player_id) : null
            const displayName = msg.player.nickname || msg.player.display_name
            return (
              <div
                key={msg.id}
                className="flex items-start gap-2 rounded-md bg-surface-light px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[10px] font-bold text-text-secondary"
                    style={pundit ? { color: pundit.color } : undefined}
                  >
                    {displayName}
                    {pundit && (
                      <span className="ml-1 rounded-full bg-gold/20 px-1 py-0.5 text-[8px] font-semibold text-gold">
                        AI
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-foreground line-clamp-2">{msg.content}</p>
                </div>
                {onUnpin && (
                  <button
                    onClick={() => onUnpin(msg.id)}
                    className="flex-shrink-0 text-[10px] text-text-muted hover:text-red-accent"
                    title="Unpin message"
                  >
                    Unpin
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
