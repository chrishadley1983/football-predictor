'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { GoldenTicketWithDetails } from '@/lib/types'
import type { EntryInfo } from '@/components/predictions/PredictionAnalyser'

const ROUND_NAMES: Record<string, string> = {
  round_of_32: 'R32',
  round_of_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
}

interface GoldenTicketSummaryProps {
  tickets: GoldenTicketWithDetails[]
  entries: EntryInfo[]
}

export function GoldenTicketSummary({ tickets, entries }: GoldenTicketSummaryProps) {
  const [isOpen, setIsOpen] = useState(true)

  if (tickets.length === 0) return null

  const entryMap = new Map(entries.map((e) => [e.entry_id, e]))

  return (
    <div className="rounded-xl border border-border-custom">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span>🎫</span>
          <h2 className="font-heading text-lg font-bold text-foreground">
            Golden Tickets
          </h2>
          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold">
            {tickets.length}
          </span>
        </div>
        <svg
          className={cn(
            'h-5 w-5 text-text-muted transition-transform',
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
        <div className="border-t border-border-custom">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-light">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">Player</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">After Round</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">Swapped Out</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">Swapped In</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom bg-surface">
                {tickets.map((ticket) => {
                  const entry = entryMap.get(ticket.entry_id)
                  const playerName = entry
                    ? entry.player.nickname ?? entry.player.display_name
                    : 'Unknown'

                  return (
                    <tr key={ticket.id}>
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        {playerName}
                      </td>
                      <td className="px-3 py-2 text-center text-text-muted">
                        {ROUND_NAMES[ticket.played_after_round] ?? ticket.played_after_round}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-red-accent line-through">
                          {ticket.original_team?.flag_emoji} {ticket.original_team?.code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-green-accent font-medium">
                          {ticket.new_team?.flag_emoji} {ticket.new_team?.code}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-text-muted">
                        #{ticket.original_match?.match_number}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
