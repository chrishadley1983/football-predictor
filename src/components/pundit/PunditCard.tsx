'use client'

import { usePunditSnippet } from '@/hooks/usePunditSnippet'
import { PunditAvatar } from './PunditAvatar'
import { PUNDITS } from '@/lib/pundit-characters'
import type { PunditKey } from '@/lib/types'

interface PunditCardProps {
  tournamentSlug: string
}

export function PunditCard({ tournamentSlug }: PunditCardProps) {
  const { snippet, loading, refresh } = usePunditSnippet(tournamentSlug)

  if (loading) {
    return (
      <div className="min-h-[120px] animate-pulse rounded-xl border border-border-custom bg-surface p-4">
        <div className="flex items-start gap-3">
          <div className="h-16 w-16 rounded-full bg-surface-light" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-surface-light" />
            <div className="h-3 w-full rounded bg-surface-light" />
            <div className="h-3 w-3/4 rounded bg-surface-light" />
          </div>
        </div>
      </div>
    )
  }

  if (!snippet) return null

  const pundit = PUNDITS[snippet.pundit_key as PunditKey]

  return (
    <div
      className="min-h-[120px] rounded-xl border bg-surface p-4"
      style={{ borderColor: `${pundit.color}40` }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <PunditAvatar punditKey={snippet.pundit_key as PunditKey} size={64} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground">{snippet.name}</span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: pundit.color }}
            >
              {pundit.personality}
            </span>
          </div>
          <p className="mt-1.5 text-sm italic text-text-secondary leading-relaxed">
            &ldquo;{snippet.content}&rdquo;
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            refresh()
          }}
          className="flex-shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-light hover:text-foreground"
          title="Next take"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
