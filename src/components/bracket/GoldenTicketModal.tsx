'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import type { EligibleSwap } from '@/lib/golden-ticket'

interface GoldenTicketModalProps {
  slug: string
  eligibleSwaps: EligibleSwap[]
  onSuccess: () => void
  onClose: () => void
}

export function GoldenTicketModal({ slug, eligibleSwaps, onSuccess, onClose }: GoldenTicketModalProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (!selectedMatchId || !selectedTeamId) return
    setSubmitting(true)
    setError('')

    const res = await fetch(`/api/tournaments/${slug}/golden-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: selectedMatchId, new_team_id: selectedTeamId }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to play golden ticket')
      setSubmitting(false)
      return
    }

    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gold/30 bg-surface shadow-2xl">
        {/* Header */}
        <div className="border-b border-gold/20 bg-gold/10 px-5 py-4 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎫</span>
            <h2 className="font-heading text-xl font-bold text-gold">Golden Ticket</h2>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Swap one eliminated prediction for a surviving team
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {eligibleSwaps.length === 0 ? (
            <p className="text-sm text-text-muted">No eligible swaps available.</p>
          ) : (
            <>
              <p className="text-xs text-text-muted">
                Select a match and pick your new team. This change cascades through all later rounds.
              </p>

              {eligibleSwaps.map((swap) => {
                const isSelected = selectedMatchId === swap.match_id
                return (
                  <div
                    key={swap.match_id}
                    className={cn(
                      'rounded-xl border p-3 transition-colors cursor-pointer',
                      isSelected
                        ? 'border-gold bg-gold/10'
                        : 'border-border-custom hover:border-gold/50'
                    )}
                    onClick={() => {
                      setSelectedMatchId(swap.match_id)
                      setSelectedTeamId(null)
                    }}
                  >
                    {/* Match header */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-text-muted">
                        {swap.match.round.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} #{swap.match.match_number}
                      </span>
                      <span className="text-xs text-red-accent line-through">
                        {swap.eliminated_team.flag_emoji} {swap.eliminated_team.code}
                      </span>
                    </div>

                    {/* Team selection */}
                    {isSelected && (
                      <div className="flex gap-2 mt-2">
                        {swap.available_teams.map((team) => (
                          <button
                            key={team.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedTeamId(team.id)
                            }}
                            className={cn(
                              'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                              selectedTeamId === team.id
                                ? 'border-gold bg-gold/20 text-gold'
                                : 'border-border-custom text-foreground hover:border-gold/50'
                            )}
                          >
                            {team.flag_emoji} {team.code}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}

          {error && (
            <div className="rounded-md bg-red-accent/10 p-2 text-sm text-red-accent">{error}</div>
          )}

          {/* Warning */}
          <div className="rounded-md bg-yellow-accent/10 p-2 text-xs text-yellow-accent">
            This is irreversible. You can only use the golden ticket once per tournament.
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-border-custom px-5 py-4 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            loading={submitting}
            disabled={!selectedMatchId || !selectedTeamId}
            className="flex-1 bg-gold text-surface hover:bg-gold/90"
          >
            🎫 Play Golden Ticket
          </Button>
        </div>
      </div>
    </div>
  )
}
