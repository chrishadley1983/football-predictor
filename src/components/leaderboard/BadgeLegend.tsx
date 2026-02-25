'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { BADGE_INFO, BADGE_ORDER } from '@/lib/badge-info'

interface BadgeLegendProps {
  /** Only show badges that were actually earned */
  earnedBadgeTypes?: string[]
}

export function BadgeLegend({ earnedBadgeTypes }: BadgeLegendProps) {
  const [isOpen, setIsOpen] = useState(false)

  const badgesToShow = earnedBadgeTypes
    ? BADGE_ORDER.filter((b) => earnedBadgeTypes.includes(b))
    : BADGE_ORDER

  if (badgesToShow.length === 0) return null

  return (
    <div className="rounded-xl border border-border-custom">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-text-secondary">
          Badge Guide
        </span>
        <svg
          className={cn(
            'h-4 w-4 text-text-muted transition-transform',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-border-custom px-4 py-3">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {badgesToShow.map((badgeType) => {
              const info = BADGE_INFO[badgeType]
              return (
                <div key={badgeType} className="flex items-center gap-2 text-xs">
                  <span className="text-base">{info.emoji}</span>
                  <span>
                    <span className="font-medium text-foreground">{info.name}</span>
                    <span className="text-text-muted"> — {info.hint}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
