'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Flag } from '@/components/ui/Flag'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
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

/**
 * Emergency Sub roster — shows, at a glance, who has played their one-time
 * Emergency Sub (with the swap they made) and who still has it available.
 */
export function GoldenTicketSummary({ tickets, entries }: GoldenTicketSummaryProps) {
  const [isOpen, setIsOpen] = useState(true)

  const ticketByEntry = new Map(tickets.map((t) => [t.entry_id, t]))
  const playedCount = tickets.length
  const total = entries.length

  // Players who have played first (most recent swaps are interesting), then the
  // rest who still have theirs available.
  const played = entries.filter((e) => ticketByEntry.has(e.entry_id))
  const notPlayed = entries.filter((e) => !ticketByEntry.has(e.entry_id))
  const ordered = [...played, ...notPlayed]

  return (
    <div className="rounded-xl border border-border-custom">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span>🔄</span>
          <h2 className="font-heading text-lg font-bold text-foreground">Emergency Subs</h2>
          <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold">
            {playedCount} / {total} played
          </span>
        </div>
        <svg
          className={cn('h-5 w-5 text-text-muted transition-transform', isOpen && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-border-custom">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-light">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-text-muted">Player</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">Status</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">After</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">Swapped Out</th>
                  <th className="px-3 py-2 text-center font-medium text-text-muted">Swapped In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-custom bg-surface">
                {ordered.map((entry) => {
                  const ticket = ticketByEntry.get(entry.entry_id)
                  const playerName = entry.player.nickname ?? entry.player.display_name
                  return (
                    <tr key={entry.entry_id} className={cn(!ticket && 'opacity-80')}>
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <PlayerAvatar
                            avatarUrl={entry.player.avatar_url ?? null}
                            displayName={entry.player.display_name}
                            size="sm"
                          />
                          {playerName}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ticket ? (
                          <span className="rounded-full bg-gold/20 px-2 py-0.5 font-bold text-gold">
                            Played
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface-light px-2 py-0.5 text-text-muted">
                            Available
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center text-text-muted">
                        {ticket ? ROUND_NAMES[ticket.played_after_round] ?? ticket.played_after_round : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ticket ? (
                          <span className="inline-flex items-center gap-1.5 text-red-accent">
                            <Flag emoji={ticket.original_team?.flag_emoji} name={ticket.original_team?.name} />
                            <span className="line-through">{ticket.original_team?.code}</span>
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {ticket ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-green-accent">
                            <Flag emoji={ticket.new_team?.flag_emoji} name={ticket.new_team?.name} />
                            {ticket.new_team?.code}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border-custom px-3 py-2 text-[11px] text-text-muted">
            Each player gets one Emergency Sub for the whole tournament. Playing it costs a 6-point
            penalty and swaps a knocked-out pick for the team that beat them.
          </p>
        </div>
      )}
    </div>
  )
}
