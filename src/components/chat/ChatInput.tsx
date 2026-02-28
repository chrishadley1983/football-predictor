'use client'

import { useState, useRef, useCallback, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { MentionAutocomplete } from './MentionAutocomplete'
import { GifPicker } from './GifPicker'
import type { ChatMessageWithPlayer, Player } from '@/lib/types'

type PlayerInfo = Pick<Player, 'id' | 'display_name' | 'nickname'>

interface ChatInputProps {
  onSend: (content: string, replyToId?: string, messageType?: string) => Promise<void>
  replyingTo?: ChatMessageWithPlayer | null
  onCancelReply?: () => void
  players?: PlayerInfo[]
  disabled?: boolean
  cooldownUntil?: number | null
  onTyping?: () => void
}

export function ChatInput({ onSend, replyingTo, onCancelReply, players = [], disabled, cooldownUntil, onTyping }: ChatInputProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isCoolingDown = cooldownUntil ? Date.now() < cooldownUntil : false

  const checkForMention = useCallback((value: string) => {
    const cursorPos = inputRef.current?.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)
    const match = textBeforeCursor.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
    } else {
      setMentionQuery(null)
    }
  }, [])

  function handleChange(value: string) {
    const capped = value.slice(0, 2000)
    setContent(capped)
    checkForMention(capped)
    onTyping?.()
  }

  function handleMentionSelect(player: PlayerInfo) {
    const cursorPos = inputRef.current?.selectionStart ?? content.length
    const textBeforeCursor = content.slice(0, cursorPos)
    const textAfterCursor = content.slice(cursorPos)
    const beforeMention = textBeforeCursor.replace(/@\w*$/, '')
    const name = player.nickname || player.display_name
    const newContent = `${beforeMention}@${name} ${textAfterCursor}`
    setContent(newContent)
    setMentionQuery(null)
    setTimeout(() => {
      const newPos = beforeMention.length + name.length + 2
      inputRef.current?.setSelectionRange(newPos, newPos)
      inputRef.current?.focus()
    }, 0)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || sending || isCoolingDown) return

    setSending(true)
    try {
      await onSend(trimmed, replyingTo?.id)
      setContent('')
      setMentionQuery(null)
      onCancelReply?.()
    } finally {
      setSending(false)
    }
  }

  async function handleGifSelect(gifUrl: string) {
    setShowGifPicker(false)
    setSending(true)
    try {
      await onSend(gifUrl, replyingTo?.id, 'gif')
      onCancelReply?.()
    } finally {
      setSending(false)
    }
  }

  const replyName = replyingTo?.player.nickname || replyingTo?.player.display_name

  return (
    <div className="relative">
      {/* Reply preview bar */}
      {replyingTo && (
        <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-gold bg-surface-light px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-gold">Replying to {replyName}</p>
            <p className="truncate text-xs text-text-muted">
              {replyingTo.content.slice(0, 80)}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex-shrink-0 text-text-muted transition-colors hover:text-foreground"
            aria-label="Cancel reply"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Mention autocomplete */}
      {mentionQuery !== null && players.length > 0 && (
        <MentionAutocomplete
          query={mentionQuery}
          players={players}
          onSelect={handleMentionSelect}
          onClose={() => setMentionQuery(null)}
        />
      )}

      {/* GIF picker */}
      {showGifPicker && (
        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        {/* GIF button */}
        <button
          type="button"
          onClick={() => setShowGifPicker(!showGifPicker)}
          className={`flex-shrink-0 rounded-md border border-border-custom px-2 py-2 text-xs font-bold transition-colors ${
            showGifPicker ? 'bg-gold text-black' : 'bg-surface-light text-text-muted hover:text-gold'
          }`}
          title="Send a GIF"
        >
          GIF
        </button>
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setMentionQuery(null)
                setShowGifPicker(false)
                onCancelReply?.()
              }
            }}
            placeholder={isCoolingDown ? 'Wait a moment...' : replyingTo ? `Reply to ${replyName}...` : 'Type a message...'}
            disabled={disabled || sending || isCoolingDown}
            maxLength={2000}
            className="block w-full rounded-md border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-1 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          />
          {content.length > 400 && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
              {content.length}/2000
            </span>
          )}
        </div>
        <Button
          type="submit"
          size="md"
          disabled={disabled || sending || !content.trim() || isCoolingDown}
          loading={sending}
        >
          Send
        </Button>
      </form>
      {isCoolingDown && (
        <p className="mt-1 text-[10px] text-text-muted">Rate limit: wait 3 seconds between messages</p>
      )}
    </div>
  )
}
