'use client'

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import { ReactionPicker } from './ReactionPicker'
import { isPunditPlayer, getPunditByPlayerId } from '@/lib/pundit-players'
import type { ChatMessageWithPlayer, ReactionSummary } from '@/lib/types'

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

/** Format message content: @mentions, **bold**, *italic*, URLs */
function renderContent(text: string): ReactNode[] {
  // Split on: @mentions, **bold**, *italic*, URLs
  const pattern = /(@\w[\w\s]*?\w(?=\s|$|[.,!?]))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(https?:\/\/[^\s<]+)/g
  const result: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      result.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>)
    }

    const [full] = match
    if (full.startsWith('@')) {
      result.push(<span key={`m${match.index}`} className="font-bold text-gold">{full}</span>)
    } else if (full.startsWith('**') && full.endsWith('**')) {
      result.push(<strong key={`b${match.index}`}>{full.slice(2, -2)}</strong>)
    } else if (full.startsWith('*') && full.endsWith('*')) {
      result.push(<em key={`i${match.index}`}>{full.slice(1, -1)}</em>)
    } else if (full.startsWith('http')) {
      const display = full.length > 40 ? full.slice(0, 37) + '...' : full
      result.push(
        <a
          key={`u${match.index}`}
          href={full}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold underline hover:text-gold-light"
        >
          {display}
        </a>
      )
    }
    lastIndex = match.index + full.length
  }

  if (lastIndex < text.length) {
    result.push(<span key={`t${lastIndex}`}>{text.slice(lastIndex)}</span>)
  }

  return result.length > 0 ? result : [<span key="raw">{text}</span>]
}

interface ChatMessageProps {
  message: ChatMessageWithPlayer & { _status?: 'sending' | 'failed'; is_pinned?: boolean }
  isOwnMessage: boolean
  currentPlayerId: string | null
  isAdmin?: boolean
  onDelete?: (messageId: string) => Promise<void>
  onReply?: (message: ChatMessageWithPlayer) => void
  onReact?: (messageId: string, emoji: string) => Promise<void>
  onRetry?: (message: ChatMessageWithPlayer) => void
  onPin?: (messageId: string) => void
  onUnpin?: (messageId: string) => void
}

export function ChatMessage({
  message,
  isOwnMessage,
  currentPlayerId,
  isAdmin,
  onDelete,
  onReply,
  onReact,
  onRetry,
  onPin,
  onUnpin,
}: ChatMessageProps) {
  const displayName = message.player.nickname || message.player.display_name
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const pickerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageRef = useRef<HTMLDivElement>(null)

  const isPundit = message.message_type === 'pundit'
  const pundit = isPundit ? getPunditByPlayerId(message.player_id) : null
  const isGif = (message.metadata?.type === 'gif')
  const isSending = message._status === 'sending'
  const isFailed = message._status === 'failed'

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return
    function handleClick(e: MouseEvent) {
      if (messageRef.current && !messageRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPicker])

  const handleMouseEnter = useCallback(() => {
    if (isSending || isFailed) return
    pickerTimeout.current = setTimeout(() => setShowPicker(true), 400)
  }, [isSending, isFailed])

  const handleMouseLeave = useCallback(() => {
    if (pickerTimeout.current) clearTimeout(pickerTimeout.current)
    pickerTimeout.current = setTimeout(() => setShowPicker(false), 300)
  }, [])

  const handleTouchStart = useCallback(() => {
    if (isSending || isFailed) return
    longPressTimeout.current = setTimeout(() => setShowPicker(true), 400)
  }, [isSending, isFailed])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current)
  }, [])

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

  function handleReact(emoji: string) {
    setShowPicker(false)
    onReact?.(message.id, emoji)
  }

  const myReactions = (message.reactions ?? [])
    .filter((r: ReactionSummary) => r.reacted)
    .map((r: ReactionSummary) => r.emoji)

  const reactions = (message.reactions ?? []).filter((r: ReactionSummary) => r.count > 0)

  // Pundit messages always render on the left
  const showOnRight = isOwnMessage && !isPundit

  return (
    <div
      ref={messageRef}
      className={cn(
        'group relative flex items-start',
        showOnRight ? 'justify-end' : 'justify-start',
        isSending && 'opacity-60',
        isFailed && 'opacity-80'
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {!showOnRight && (
        <div className="mr-2 mt-1 flex-shrink-0 relative">
          {isPundit && pundit ? (
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: pundit.color }}
            >
              {pundit.name.charAt(0)}
            </div>
          ) : (
            <PlayerAvatar avatarUrl={message.player.avatar_url} displayName={displayName} size="sm" />
          )}
        </div>
      )}

      <div className="relative max-w-[80%]">
        {/* Reaction picker */}
        {showPicker && onReact && currentPlayerId && (
          <ReactionPicker
            onReact={handleReact}
            existingReactions={myReactions}
            position={showOnRight ? 'right' : 'left'}
          />
        )}

        {/* Message bubble */}
        <div
          className={cn(
            'rounded-lg px-3 py-2',
            isPundit && pundit
              ? 'border-l-[3px] bg-surface-light text-foreground'
              : showOnRight
                ? 'bg-gold text-black'
                : 'bg-surface-light text-foreground',
            message.is_pinned && 'ring-1 ring-gold/30'
          )}
          style={isPundit && pundit ? { borderLeftColor: pundit.color } : undefined}
        >
          {/* Header: name + badges + actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <p className={cn(
                'text-xs font-bold',
                isPundit && pundit ? 'text-foreground' : showOnRight ? 'text-black/70' : 'text-text-secondary'
              )}
              style={isPundit && pundit ? { color: pundit.color } : undefined}
              >
                {displayName}
              </p>
              {isPundit && (
                <span className="rounded-full bg-gold/20 px-1.5 py-0.5 text-[9px] font-semibold text-gold">
                  AI
                </span>
              )}
              {message.is_pinned && (
                <svg className="h-3 w-3 text-gold/70" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                </svg>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* Reply button */}
              {onReply && !isSending && !isFailed && currentPlayerId && (
                <button
                  onClick={() => onReply(message)}
                  className={cn(
                    'flex-shrink-0 rounded px-1 text-[10px] font-medium transition-opacity',
                    showOnRight
                      ? 'text-black/40 opacity-0 hover:text-black/70 group-hover:opacity-100'
                      : 'text-text-muted opacity-0 hover:text-foreground group-hover:opacity-100'
                  )}
                  aria-label="Reply to message"
                >
                  Reply
                </button>
              )}
              {/* Pin/unpin button (admin) */}
              {isAdmin && !isSending && !isFailed && (
                <button
                  onClick={() => message.is_pinned ? onUnpin?.(message.id) : onPin?.(message.id)}
                  className={cn(
                    'flex-shrink-0 rounded px-1 text-[10px] font-medium transition-opacity',
                    showOnRight
                      ? 'text-black/40 opacity-0 hover:text-black/70 group-hover:opacity-100'
                      : 'text-text-muted opacity-0 hover:text-foreground group-hover:opacity-100'
                  )}
                  aria-label={message.is_pinned ? 'Unpin message' : 'Pin message'}
                >
                  {message.is_pinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {/* Delete button (admin) */}
              {onDelete && (
                <button
                  onClick={handleDelete}
                  onBlur={() => setConfirming(false)}
                  disabled={deleting}
                  className={cn(
                    'flex-shrink-0 rounded px-1 text-[10px] font-medium transition-opacity',
                    confirming
                      ? 'bg-red-600 text-white opacity-100'
                      : showOnRight
                        ? 'text-black/40 opacity-0 hover:text-black/70 group-hover:opacity-100'
                        : 'text-text-muted opacity-0 hover:text-foreground group-hover:opacity-100'
                  )}
                  aria-label={confirming ? 'Confirm delete message' : 'Delete message'}
                  title={confirming ? 'Click again to confirm' : 'Delete message'}
                >
                  {deleting ? '...' : confirming ? 'Delete?' : '\u00D7'}
                </button>
              )}
            </div>
          </div>

          {/* Reply quote */}
          {message.reply_to && (
            <div className="mb-1.5 mt-1 rounded border-l-2 border-gold/50 bg-black/10 px-2 py-1">
              <p className="text-[10px] font-semibold text-gold/80">
                {message.reply_to.player.nickname || message.reply_to.player.display_name}
              </p>
              <p className="text-[11px] leading-tight text-text-muted line-clamp-1">
                {message.reply_to.content.slice(0, 80)}
              </p>
            </div>
          )}

          {/* Content */}
          {isGif ? (
            <img
              src={message.content}
              alt="GIF"
              className="max-w-[300px] rounded-md"
              loading="lazy"
            />
          ) : (
            <p className={cn('text-sm whitespace-pre-wrap break-words', isPundit && 'italic')}>
              {renderContent(message.content)}
            </p>
          )}

          {/* Timestamp + status */}
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className={cn('text-[10px]', showOnRight ? 'text-black/50' : 'text-text-muted')}>
              {isSending ? 'Sending...' : isFailed ? 'Failed' : formatRelativeTime(message.created_at)}
            </p>
            {isFailed && onRetry && (
              <button
                onClick={() => onRetry(message)}
                className="text-[10px] font-medium text-red-400 hover:text-red-300"
              >
                Retry
              </button>
            )}
          </div>
        </div>

        {/* Reaction pills */}
        {reactions.length > 0 && (
          <div className={cn('mt-0.5 flex flex-wrap gap-1', showOnRight && 'justify-end')}>
            {reactions.map((r: ReactionSummary) => (
              <button
                key={r.emoji}
                onClick={() => onReact?.(message.id, r.emoji)}
                className={cn(
                  'flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                  r.reacted
                    ? 'border-gold/50 bg-gold/15 text-gold'
                    : 'border-border-custom bg-surface-light text-text-muted hover:border-gold/30'
                )}
              >
                <span>{r.emoji}</span>
                <span className="text-[10px] font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showOnRight && (
        <div className="ml-2 mt-1 flex-shrink-0">
          <PlayerAvatar avatarUrl={message.player.avatar_url} displayName={displayName} size="sm" />
        </div>
      )}
    </div>
  )
}
