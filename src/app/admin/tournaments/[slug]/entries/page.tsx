'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { PaymentStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import type { Tournament, TournamentEntry, Player, PaymentStatus } from '@/lib/types'

interface EntryWithPlayer extends TournamentEntry {
  player: Player
}

export default function EntriesPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.role !== 'admin') {
        router.replace('/')
      }
    })
  }, [router])

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [entries, setEntries] = useState<EntryWithPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/tournaments/${slug}`)
      if (!res.ok) {
        setError('Tournament not found')
        setLoading(false)
        return
      }
      const data = await res.json()
      setTournament(data)

      const supabase = createClient()
      const { data: entryData, error: entryErr } = await supabase
        .from('tournament_entries')
        .select('*, player:players (*)')
        .eq('tournament_id', data.id)
        .order('created_at')

      if (entryErr) {
        setError(entryErr.message)
      } else {
        setEntries((entryData ?? []) as EntryWithPlayer[])
      }

      setLoading(false)
    }
    load()
  }, [slug])

  async function handlePaymentChange(entryId: string, newStatus: PaymentStatus) {
    setError('')
    const res = await fetch(`/api/admin/entries/${entryId}/payment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: newStatus }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to update payment status')
      return
    }

    // Update local state
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId ? { ...e, payment_status: newStatus } : e
      )
    )
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading...</p>
  if (!tournament) return <p className="py-12 text-center text-red-accent">{error || 'Tournament not found'}</p>

  const paidCount = entries.filter((e) => e.payment_status === 'paid').length
  const prizePool = paidCount * tournament.entry_fee_gbp

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">{tournament.name} - Entries</h1>

      {error && <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-text-secondary">Total Entries</p>
            <p className="font-heading text-2xl font-bold text-foreground">{entries.length}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-text-secondary">Paid</p>
            <p className="font-heading text-2xl font-bold text-green-accent">{paidCount}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-text-secondary">Prize Pool</p>
            <p className="font-heading text-2xl font-bold text-gold">{formatCurrency(prizePool)}</p>
          </div>
        </Card>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border-custom">
          <table className="w-full">
            <thead className="bg-surface-light">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Player</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Email</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-text-muted">Payment</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom bg-surface">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                    {entry.player.display_name}
                    {entry.player.nickname && (
                      <span className="ml-1 text-xs text-text-muted">({entry.player.nickname})</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-text-secondary">
                    {entry.player.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <PaymentStatusBadge status={entry.payment_status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      {entry.payment_status !== 'paid' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handlePaymentChange(entry.id, 'paid')}
                        >
                          Mark Paid
                        </Button>
                      )}
                      {entry.payment_status === 'paid' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handlePaymentChange(entry.id, 'pending')}
                        >
                          Mark Pending
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
