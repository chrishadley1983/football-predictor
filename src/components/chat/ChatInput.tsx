'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'

interface ChatInputProps {
  onSend: (content: string) => Promise<void>
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = content.trim()
    if (!trimmed || sending) return

    setSending(true)
    try {
      await onSend(trimmed)
      setContent('')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value.slice(0, 500))}
        placeholder="Type a message..."
        disabled={disabled || sending}
        maxLength={500}
        className="block w-full rounded-md border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground shadow-sm transition-colors focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-1 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
      />
      <Button
        type="submit"
        size="md"
        disabled={disabled || sending || !content.trim()}
        loading={sending}
      >
        Send
      </Button>
    </form>
  )
}
