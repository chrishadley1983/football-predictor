'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Flag } from '@/components/ui/Flag'
import type { EligibleSwap } from '@/lib/golden-ticket'

interface GoldenTicketModalProps {
  slug: string
  eligibleSwaps: EligibleSwap[]
  onSuccess: () => void
  onClose: () => void
}

export function GoldenTicketModal({ slug, eligibleSwaps, onSuccess, onClose }: GoldenTicketModalProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (!selectedMatchId) return
    setSubmitting(true)
    setError('')

    const res = await fetch(`/api/tournaments/${slug}/golden-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: selectedMatchId }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to use emergency sub')
      setSubmitting(false)
      return
    }

    onSuccess()
  }

  const selectedSwap = eligibleSwaps.find((s) => s.match_id === selectedMatchId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gold/30 bg-surface shadow-2xl">
        {/* Header */}
        <div className="border-b border-gold/20 bg-gold/10 px-5 py-4 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔄</span>
            <h2 className="font-heading text-xl font-bold text-gold">Emergency Sub</h2>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            If you selected a team that was knocked out, you can replace that team with whoever
            knocked them out — but you can only do this once, so use it wisely. Using the Emergency
            Sub costs a 6-point penalty.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {eligibleSwaps.length === 0 ? (
            <p className="text-sm text-text-muted">No wrong predictions to fix.</p>
          ) : (
            <>
              <p className="text-xs text-text-muted">
                Pick which wrong prediction to fix. The winner becomes your pick for all later rounds.
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
                    onClick={() => setSelectedMatchId(swap.match_id)}
                  >
                    {/* Match info */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-muted">
                        {swap.match.round.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} #{swap.match.match_number}
                      </span>
                    </div>

                    {/* Your wrong pick → actual winner */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-red-accent">
                        <Flag emoji={swap.wrong_team.flag_emoji} name={swap.wrong_team.name} />
                        <span className="line-through">{swap.wrong_team.code}</span>
                      </span>
                      <span className="text-text-muted">→</span>
                      <span className="inline-flex items-center gap-1.5 text-green-accent font-medium">
                        <Flag emoji={swap.winner_team.flag_emoji} name={swap.winner_team.name} />
                        {swap.winner_team.code}
                      </span>
                    </div>
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
            This is irreversible. You can only use the Emergency Sub once per tournament. A 6-point penalty will be applied.
            {selectedSwap && (
              <span className="block mt-1">
                {selectedSwap.winner_team.code} will replace your pick from the next round onwards.
              </span>
            )}
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
            disabled={!selectedMatchId}
            className="flex-1 bg-gold text-surface hover:bg-gold/90"
          >
            🔄 Use Emergency Sub
          </Button>
        </div>
      </div>
    </div>
  )
}
