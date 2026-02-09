'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import type { ChatMessageWithPlayer } from '@/lib/types'

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

interface ChatMessageProps {
  message: ChatMessageWithPlayer
  isOwnMessage: boolean
  onDelete?: (messageId: string) => Promise<void>
}

export function ChatMessage({ message, isOwnMessage, onDelete }: ChatMessageProps) {
  const displayName = message.player.nickname || message.player.display_name
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setDeleting(true)
    await onDelete?.(message.id)
    setDeleting(false)
    setConfirming(false)
  }

  return (
    <div className={cn('group flex items-start', isOwnMessage ? 'justify-end' : 'justify-start')}>
      {!isOwnMessage && (
        <div className="mr-2 mt-1 flex-shrink-0">
          <PlayerAvatar avatarUrl={message.player.avatar_url} displayName={displayName} size="sm" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2',
          isOwnMessage
            ? 'bg-gold text-black'
            : 'bg-surface-light text-foreground'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-xs font-bold', isOwnMessage ? 'text-black/70' : 'text-text-secondary')}>
            {displayName}
          </p>
          {onDelete && (
            <button
              onClick={handleDelete}
              onBlur={() => setConfirming(false)}
              disabled={deleting}
              className={cn(
                'flex-shrink-0 rounded px-1 text-[10px] font-medium transition-opacity',
                confirming
                  ? 'bg-red-600 text-white opacity-100'
                  : isOwnMessage
                    ? 'text-black/40 opacity-0 hover:text-black/70 group-hover:opacity-100'
                    : 'text-text-muted opacity-0 hover:text-foreground group-hover:opacity-100'
              )}
              title={confirming ? 'Click again to confirm' : 'Delete message'}
            >
              {deleting ? '...' : confirming ? 'Delete?' : '\u00D7'}
            </button>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <p
          className={cn(
            'mt-0.5 text-[10px]',
            isOwnMessage ? 'text-black/50' : 'text-text-muted'
          )}
        >
          {formatRelativeTime(message.created_at)}
        </p>
      </div>
      {isOwnMessage && (
        <div className="ml-2 mt-1 flex-shrink-0">
          <PlayerAvatar avatarUrl={message.player.avatar_url} displayName={displayName} size="sm" />
        </div>
      )}
    </div>
  )
}
