'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
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

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.role !== 'admin') {
        window.location.href = '/'
      }
    })
  }, [])

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

  if (loading) return <p className="py-12 text-center text-gray-500">Loading...</p>
  if (!tournament) return <p className="py-12 text-center text-red-600">{error || 'Tournament not found'}</p>

  const paidCount = entries.filter((e) => e.payment_status === 'paid').length
  const prizePool = paidCount * tournament.entry_fee_gbp

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tournament.name} - Entries</h1>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Entries</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{entries.length}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Paid</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{paidCount}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Prize Pool</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{formatCurrency(prizePool)}</p>
          </div>
        </Card>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">No entries yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Player</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Email</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Payment</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                    {entry.player.display_name}
                    {entry.player.nickname && (
                      <span className="ml-1 text-xs text-gray-400">({entry.player.nickname})</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
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
