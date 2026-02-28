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
        'absolute bottom-full z-50 mb-1 flex gap-0.5 rounded-full border border-border-custom bg-surface px-2 py-1.5 shadow-lg shadow-black/40',
        position === 'right' ? 'right-0' : 'left-0'
      )}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ALLOWED_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={(e) => {
            e.stopPropagation()
            onReact(emoji)
          }}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 hover:bg-surface-light',
            existingReactions.includes(emoji) && 'ring-2 ring-gold ring-offset-1 ring-offset-surface'
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
