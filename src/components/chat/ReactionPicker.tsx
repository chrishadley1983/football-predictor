'use client'

import { ALLOWED_REACTIONS } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ReactionPickerProps {
  onReact: (emoji: string) => void
  existingReactions: string[]
  position: 'left' | 'right'
}

export function ReactionPicker({ onReact, existingReactions, position }: ReactionPickerProps) {
  return (
    <div
      className={cn(
        'absolute -top-10 z-20 flex gap-0.5 rounded-full border border-border-custom bg-surface px-1.5 py-1 shadow-lg shadow-black/30',
        position === 'right' ? 'right-0' : 'left-0'
      )}
    >
      {ALLOWED_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation()
            onReact(emoji)
          }}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full text-base transition-transform hover:scale-125',
            existingReactions.includes(emoji) && 'ring-2 ring-gold ring-offset-1 ring-offset-surface'
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
