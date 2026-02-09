'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { KnockoutBracket } from '@/components/bracket/KnockoutBracket'
import { Button } from '@/components/ui/Button'
import { getDeadlineStatus } from '@/lib/utils'
import type { Tournament, KnockoutMatchWithTeams, KnockoutPrediction } from '@/lib/types'

interface TournamentData extends Tournament {
  knockout_matches: KnockoutMatchWithTeams[]
}

export default function KnockoutPredictionPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [predictions, setPredictions] = useState<KnockoutPrediction[]>([])
  const [entryId, setEntryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  // Track unsaved changes: matchId -> teamId
  const [pendingPredictions, setPendingPredictions] = useState<Record<string, string>>({})

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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Please log in to make predictions')
        setLoading(false)
        return
      }

      const { data: player } = await supabase
        .from('players')
        .select('id')
        .eq('auth_user_id', user.id)
        .single()

      if (!player) {
        setError('Player profile not found')
        setLoading(false)
        return
      }

      const { data: entry } = await supabase
        .from('tournament_entries')
        .select('*')
        .eq('tournament_id', data.id)
        .eq('player_id', player.id)
        .single()

      if (!entry) {
        setError('You have not entered this tournament yet')
        setLoading(false)
        return
      }

      setEntryId(entry.id)

      // Fetch existing knockout predictions
      const { data: preds } = await supabase
        .from('knockout_predictions')
        .select('*')
        .eq('entry_id', entry.id)

      if (preds) setPredictions(preds)
      setLoading(false)
    }
    load()
  }, [slug])

  const deadline = tournament ? getDeadlineStatus(tournament.knockout_stage_deadline) : null
  const isReadonly = deadline?.passed || tournament?.status !== 'knockout_open'

  const handlePrediction = useCallback((matchId: string, teamId: string) => {
    if (isReadonly) return
    setPendingPredictions((prev) => ({ ...prev, [matchId]: teamId }))

    // Also update predictions state for UI feedback
    setPredictions((prev) => {
      const idx = prev.findIndex((p) => p.match_id === matchId)
      const newPred: KnockoutPrediction = {
        id: idx >= 0 ? prev[idx].id : '',
        entry_id: entryId ?? '',
        match_id: matchId,
        predicted_winner_id: teamId,
        is_correct: null,
        points_earned: 0,
        submitted_at: new Date().toISOString(),
      }
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = newPred
        return updated
      }
      return [...prev, newPred]
    })
  }, [isReadonly, entryId])

  async function handleSaveAll() {
    if (!entryId || Object.keys(pendingPredictions).length === 0) return
    setSaving(true)
    setError('')
    setSuccessMsg('')

    // Save each prediction
    for (const [matchId, teamId] of Object.entries(pendingPredictions)) {
      const res = await fetch(`/api/tournaments/${slug}/predictions/knockout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: matchId,
          predicted_winner_id: teamId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || `Failed to save prediction for match ${matchId}`)
        setSaving(false)
        return
      }
    }

    setPendingPredictions({})
    setSuccessMsg('All predictions saved!')
    setTimeout(() => setSuccessMsg(''), 3000)
    setSaving(false)
  }

  if (loading) return <p className="py-12 text-center text-gray-500">Loading bracket...</p>
  if (error && !tournament) return <p className="py-12 text-center text-red-600">{error}</p>

  const pendingCount = Object.keys(pendingPredictions).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Knockout Bracket Predictions</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {tournament?.name} &mdash; Click on a team to predict them as the match winner
        </p>
        {deadline && !deadline.passed && (
          <p className="mt-1 text-sm font-medium text-yellow-600">{deadline.label}</p>
        )}
        {isReadonly && (
          <p className="mt-2 rounded-md bg-yellow-50 p-2 text-sm text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
            Predictions are locked. The deadline has passed or the knockout stage is closed.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>
      )}
      {successMsg && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{successMsg}</div>
      )}

      <KnockoutBracket
        matches={tournament?.knockout_matches ?? []}
        predictions={predictions}
        onPrediction={handlePrediction}
        readonly={isReadonly}
      />

      {!isReadonly && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {pendingCount > 0
              ? `${pendingCount} unsaved prediction${pendingCount > 1 ? 's' : ''}`
              : 'All changes saved'}
          </span>
          <Button
            onClick={handleSaveAll}
            loading={saving}
            disabled={pendingCount === 0}
          >
            Save All Predictions
          </Button>
        </div>
      )}
    </div>
  )
}
