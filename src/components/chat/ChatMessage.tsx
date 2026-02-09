'use client'

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
}

export function ChatMessage({ message, isOwnMessage }: ChatMessageProps) {
  const displayName = message.player.nickname || message.player.display_name

  return (
    <div className={cn('flex', isOwnMessage ? 'justify-end' : 'justify-start')}>
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
        {!isOwnMessage && (
          <p className="text-xs font-bold text-text-secondary">{displayName}</p>
        )}
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
    </div>
  )
}
