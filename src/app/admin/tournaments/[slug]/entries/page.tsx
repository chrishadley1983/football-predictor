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
  const [groupCount, setGroupCount] = useState(0)
  const [knockoutCount, setKnockoutCount] = useState(0)
  const [thirdPlaceQuota, setThirdPlaceQuota] = useState<number | null>(null)
  const [entries, setEntries] = useState<EntryWithPlayer[]>([])
  const [groupStats, setGroupStats] = useState<Record<string, { groups: number; thirds: number }>>({})
  const [knockoutCounts, setKnockoutCounts] = useState<Record<string, number>>({})
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
      setGroupCount(data.groups?.length ?? 0)
      setKnockoutCount(data.knockout_matches?.length ?? 0)
      setThirdPlaceQuota(data.third_place_qualifiers_count ?? null)

      const supabase = createClient()
      const { data: entryData, error: entryErr } = await supabase
        .from('tournament_entries')
        .select('*, player:players (*)')
        .eq('tournament_id', data.id)
        .order('created_at')

      if (entryErr) {
        setError(entryErr.message)
        setLoading(false)
        return
      }

      const entryRows = (entryData ?? []) as EntryWithPlayer[]
      setEntries(entryRows)

      const entryIds = entryRows.map((e) => e.id)
      if (entryIds.length > 0) {
        // Group predictions: count rows with 1st+2nd populated as "groups",
        // and rows with predicted_3rd also set as "thirds". For qualifier-style
        // tournaments (third_place_qualifiers_count != null) thirds must equal
        // the quota; for standard tournaments thirds must equal total groups.
        const { data: gpData } = await supabase
          .from('group_predictions')
          .select('entry_id, predicted_1st, predicted_2nd, predicted_3rd')
          .in('entry_id', entryIds)
        const gStats: Record<string, { groups: number; thirds: number }> = {}
        for (const p of gpData ?? []) {
          if (!p.predicted_1st || !p.predicted_2nd) continue
          if (!gStats[p.entry_id]) gStats[p.entry_id] = { groups: 0, thirds: 0 }
          gStats[p.entry_id].groups += 1
          if (p.predicted_3rd) gStats[p.entry_id].thirds += 1
        }
        setGroupStats(gStats)

        // Knockout predictions: a row counts when predicted_winner_id is set.
        const { data: kpData } = await supabase
          .from('knockout_predictions')
          .select('entry_id, predicted_winner_id')
          .in('entry_id', entryIds)
        const kCounts: Record<string, number> = {}
        for (const p of kpData ?? []) {
          if (p.predicted_winner_id) {
            kCounts[p.entry_id] = (kCounts[p.entry_id] ?? 0) + 1
          }
        }
        setKnockoutCounts(kCounts)
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

  // Two-step confirmation for destructive actions, scoped per row + per action.
  // First click sets `pending`; second click on the same button executes; any
  // other interaction (other row, other action) resets and starts fresh.
  const [pending, setPending] = useState<{ entryId: string; type: 'reset' | 'remove' } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function handleReset(entryId: string) {
    if (pending?.entryId !== entryId || pending.type !== 'reset') {
      setPending({ entryId, type: 'reset' })
      return
    }
    setPending(null)
    setError('')
    setBusy(`reset:${entryId}`)
    const res = await fetch(`/api/admin/entries/${entryId}/predictions`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to reset predictions')
    }
    setBusy(null)
  }

  async function handleRemove(entryId: string) {
    if (pending?.entryId !== entryId || pending.type !== 'remove') {
      setPending({ entryId, type: 'remove' })
      return
    }
    setPending(null)
    setError('')
    setBusy(`remove:${entryId}`)
    const res = await fetch(`/api/admin/entries/${entryId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Failed to remove entry')
      setBusy(null)
      return
    }
    // Drop the row from local state so the table reflects the delete immediately.
    setEntries((prev) => prev.filter((e) => e.id !== entryId))
    setBusy(null)
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
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-text-muted">Group Picks</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-text-muted">Knockout Picks</th>
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
                    <GroupPicksStatus
                      groupsPredicted={groupStats[entry.id]?.groups ?? 0}
                      thirdsPredicted={groupStats[entry.id]?.thirds ?? 0}
                      totalGroups={groupCount}
                      thirdPlaceQuota={thirdPlaceQuota}
                      hasTiebreaker={entry.tiebreaker_goals != null}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <KnockoutPicksStatus
                      predicted={knockoutCounts[entry.id] ?? 0}
                      total={knockoutCount}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <div className="flex flex-wrap justify-center gap-1">
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

                      {pending?.entryId === entry.id && pending.type === 'reset' ? (
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busy === `reset:${entry.id}`}
                          onClick={() => handleReset(entry.id)}
                          title="Wipes group + knockout predictions, achievements, and golden tickets for this entry. The entry itself stays."
                        >
                          Confirm reset?
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => handleReset(entry.id)}
                          title="Reset this player's predictions (entry stays)"
                        >
                          Reset
                        </Button>
                      )}

                      {pending?.entryId === entry.id && pending.type === 'remove' ? (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busy === `remove:${entry.id}`}
                          onClick={() => handleRemove(entry.id)}
                          title="Removes the entry entirely. Cascades through their predictions. Player account is preserved."
                        >
                          Confirm remove?
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => handleRemove(entry.id)}
                          title="Remove this player from the tournament"
                        >
                          Remove
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

function Badge({ tone, title, children }: { tone: 'green' | 'yellow' | 'muted'; title?: string; children: React.ReactNode }) {
  if (tone === 'muted') return <span className="text-xs text-text-muted" title={title}>{children}</span>
  const cls = tone === 'green' ? 'bg-green-accent/10 text-green-accent' : 'bg-yellow-accent/10 text-yellow-accent'
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`} title={title}>
      {children}
    </span>
  )
}

function GroupPicksStatus({
  groupsPredicted,
  thirdsPredicted,
  totalGroups,
  thirdPlaceQuota,
  hasTiebreaker,
}: {
  groupsPredicted: number
  thirdsPredicted: number
  totalGroups: number
  thirdPlaceQuota: number | null
  hasTiebreaker: boolean
}) {
  if (totalGroups === 0) return <Badge tone="muted">—</Badge>
  if (groupsPredicted === 0 && thirdsPredicted === 0 && !hasTiebreaker) {
    return <Badge tone="muted">—</Badge>
  }

  // Standard tournament: every group requires 3rd. Qualifier tournament:
  // exactly `thirdPlaceQuota` of the groups must have 3rd set.
  const thirdsRequired = thirdPlaceQuota ?? totalGroups
  const groupsOk = groupsPredicted === totalGroups
  const thirdsOk = thirdsPredicted === thirdsRequired
  const valid = groupsOk && thirdsOk && hasTiebreaker

  const missing: string[] = []
  if (!groupsOk) missing.push(`${totalGroups - groupsPredicted} group${totalGroups - groupsPredicted === 1 ? '' : 's'}`)
  if (!thirdsOk) {
    const diff = thirdsRequired - thirdsPredicted
    missing.push(
      diff > 0
        ? `${diff} 3rd-place pick${diff === 1 ? '' : 's'}`
        : `${-diff} too many 3rd-place picks`,
    )
  }
  if (!hasTiebreaker) missing.push('tiebreaker')
  const title = valid ? 'All group predictions complete' : `Missing: ${missing.join(', ')}`

  const showThirdSegment = thirdPlaceQuota !== null
  const label = (
    <>
      {valid && '✓ '}
      {groupsPredicted}/{totalGroups}
      {showThirdSegment && <> · {thirdsPredicted}/{thirdsRequired} 3rd</>}
      {!hasTiebreaker && ' · no TB'}
    </>
  )

  return (
    <Badge tone={valid ? 'green' : 'yellow'} title={title}>
      {label}
    </Badge>
  )
}

function KnockoutPicksStatus({ predicted, total }: { predicted: number; total: number }) {
  if (total === 0) return <Badge tone="muted">—</Badge>
  if (predicted === 0) return <Badge tone="muted">—</Badge>
  const valid = predicted === total
  const title = valid
    ? 'All knockout predictions complete'
    : `${total - predicted} of ${total} knockout matches still need a pick`
  return (
    <Badge tone={valid ? 'green' : 'yellow'} title={title}>
      {valid ? '✓ ' : ''}{predicted}/{total}
    </Badge>
  )
}
