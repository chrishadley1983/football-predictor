'use client'

import { useState } from 'react'
import { usePunditSnippet } from '@/hooks/usePunditSnippet'
import { PunditAvatar } from './PunditAvatar'
import { PUNDITS } from '@/lib/pundit-characters'
import { cn } from '@/lib/utils'
import type { PunditKey } from '@/lib/types'

interface PunditBubbleProps {
  tournamentSlug: string
}

export function PunditBubble({ tournamentSlug }: PunditBubbleProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { snippet, loading, refresh } = usePunditSnippet(tournamentSlug)

  // Don't show anything if no snippets available
  if (!loading && !snippet) return null

  const pundit = snippet ? PUNDITS[snippet.pundit_key as PunditKey] : null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Expanded popup */}
      {isOpen && snippet && pundit && (
        <div
          className="mb-3 w-72 rounded-xl border bg-surface p-4 shadow-lg sm:w-80"
          style={{ borderColor: `${pundit.color}40` }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <PunditAvatar punditKey={snippet.pundit_key as PunditKey} size={48} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">{snippet.name}</span>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: pundit.color }}
                >
                  {pundit.personality}
                </span>
              </div>
              <p className="mt-1 text-xs italic text-text-secondary leading-relaxed">
                &ldquo;{snippet.content}&rdquo;
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border-custom pt-2">
            <button
              onClick={refresh}
              className="text-[10px] font-medium text-text-muted transition-colors hover:text-foreground"
            >
              Next take
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[10px] font-medium text-text-muted transition-colors hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105',
          isOpen ? 'bg-surface-light' : 'bg-surface'
        )}
        style={{
          border: `2px solid ${pundit?.color ?? '#FFD700'}40`,
        }}
        title="Pundit's take"
      >
        {loading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-text-muted border-t-transparent" />
        ) : snippet ? (
          <PunditAvatar punditKey={snippet.pundit_key as PunditKey} size={36} />
        ) : null}
      </button>
    </div>
  )
}
