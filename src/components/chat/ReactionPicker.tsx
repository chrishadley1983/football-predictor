'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ALLOWED_REACTIONS } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ReactionPickerProps {
  onReact: (emoji: string) => void
  existingReactions: string[]
  anchorRef: React.RefObject<HTMLDivElement | null>
  position: 'left' | 'right'
}

export function ReactionPicker({ onReact, existingReactions, anchorRef, position }: ReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    function updatePosition() {
      if (!anchorRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      const pickerWidth = 300 // approximate width of picker
      let left: number
      if (position === 'right') {
        left = rect.right - pickerWidth
      } else {
        left = rect.left
      }
      // Clamp to viewport
      left = Math.max(8, Math.min(left, window.innerWidth - pickerWidth - 8))
      setCoords({ top: rect.top - 44, left })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [anchorRef, position])

  if (!coords) return null

  return createPortal(
    <div
      ref={pickerRef}
      style={{ position: 'fixed', top: coords.top, left: coords.left, zIndex: 9999 }}
      className="flex gap-0.5 rounded-full border border-border-custom bg-surface px-2 py-1.5 shadow-lg shadow-black/40"
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
    </div>,
    document.body
  )
}
