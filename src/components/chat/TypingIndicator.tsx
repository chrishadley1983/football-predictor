'use client'

interface TypingIndicatorProps {
  typingUsers: string[]
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null

  let text: string
  if (typingUsers.length === 1) {
    text = `${typingUsers[0]} is typing`
  } else if (typingUsers.length === 2) {
    text = `${typingUsers[0]} and ${typingUsers[1]} are typing`
  } else if (typingUsers.length === 3) {
    text = `${typingUsers[0]}, ${typingUsers[1]} and ${typingUsers[2]} are typing`
  } else {
    text = `${typingUsers[0]}, ${typingUsers[1]} and ${typingUsers.length - 2} others are typing`
  }

  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <div className="flex gap-0.5">
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gold/60" style={{ animationDelay: '0ms' }} />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gold/60" style={{ animationDelay: '150ms' }} />
        <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gold/60" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-[11px] text-text-muted">{text}</span>
    </div>
  )
}
