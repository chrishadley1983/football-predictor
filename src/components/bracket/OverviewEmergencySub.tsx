'use client'

import { useEffect, useState } from 'react'
import { GoldenTicketModal } from '@/components/bracket/GoldenTicketModal'
import { Button } from '@/components/ui/Button'
import type { EligibleSwap } from '@/lib/golden-ticket'

/**
 * Prominent "play your Emergency Sub" call-to-action for the tournament Overview
 * page. Renders nothing unless the viewer (or impersonated player) actually has
 * an Emergency Sub available right now.
 */
export function OverviewEmergencySub({ slug }: { slug: string }) {
  const [loaded, setLoaded] = useState(false)
  const [windowOpen, setWindowOpen] = useState(false)
  const [used, setUsed] = useState(false)
  const [swaps, setSwaps] = useState<EligibleSwap[]>([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    fetch(`/api/tournaments/${slug}/golden-ticket`)
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json()
          setUsed(d.hasUsedTicket)
          setWindowOpen(d.window?.isOpen ?? false)
          setSwaps(d.eligibleSwaps ?? [])
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [slug])

  if (!loaded || used || !windowOpen || swaps.length === 0) return null

  return (
    <div className="rounded-xl border-2 border-gold bg-gold/10 p-5">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-bold text-gold-light">🔄 Your Emergency Sub is available</h2>
          <p className="mt-1 text-sm text-text-secondary">
            One of your predicted teams was knocked out. You can swap it for the team that beat them
            (−6 points, one use only).
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="shrink-0 bg-gold font-bold text-surface hover:bg-gold/90"
        >
          🔄 Play your Emergency Sub
        </Button>
      </div>

      {showModal && (
        <GoldenTicketModal
          slug={slug}
          eligibleSwaps={swaps}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            setUsed(true)
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
