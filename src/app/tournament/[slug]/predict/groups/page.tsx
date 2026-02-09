'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GroupPredictionCard } from '@/components/groups/GroupPredictionCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { getDeadlineStatus } from '@/lib/utils'
import type { Tournament, GroupWithTeams, GroupPrediction, GroupResult, TournamentEntry } from '@/lib/types'

interface TournamentData extends Tournament {
  groups: GroupWithTeams[]
}

export default function GroupPredictionPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [entry, setEntry] = useState<TournamentEntry | null>(null)
  const [predictions, setPredictions] = useState<GroupPrediction[]>([])
  const [results, setResults] = useState<GroupResult[]>([])
  const [tiebreaker, setTiebreaker] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    async function load() {
      // Fetch tournament data
      const res = await fetch(`/api/tournaments/${slug}`)
      if (!res.ok) {
        setError('Tournament not found')
        setLoading(false)
        return
      }
      const data = await res.json()
      setTournament(data)

      // Fetch current player's entry and predictions
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

      const { data: entryData } = await supabase
        .from('tournament_entries')
        .select('*')
        .eq('tournament_id', data.id)
        .eq('player_id', player.id)
        .single()

      if (!entryData) {
        setError('You have not entered this tournament yet')
        setLoading(false)
        return
      }

      setEntry(entryData)
      setTiebreaker(entryData.tiebreaker_goals?.toString() ?? '')

      // Fetch existing predictions
      const { data: preds } = await supabase
        .from('group_predictions')
        .select('*')
        .eq('entry_id', entryData.id)

      if (preds) setPredictions(preds)

      // Fetch group results if available
      const groupIds = data.groups?.map((g: GroupWithTeams) => g.id) ?? []
      if (groupIds.length > 0) {
        const { data: groupResults } = await supabase
          .from('group_results')
          .select('*')
          .in('group_id', groupIds)
        if (groupResults) setResults(groupResults)
      }

      setLoading(false)
    }
    load()
  }, [slug])

  const deadline = tournament ? getDeadlineStatus(tournament.group_stage_deadline) : null
  const isReadonly = deadline?.passed || tournament?.status !== 'group_stage_open'

  async function handlePrediction(groupId: string, predicted_1st: string, predicted_2nd: string, predicted_3rd: string | null) {
    if (!entry || isReadonly) return
    setSaving(true)
    setError('')
    setSuccessMsg('')

    const res = await fetch(`/api/tournaments/${slug}/predictions/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictions: [
          {
            group_id: groupId,
            predicted_1st,
            predicted_2nd,
            predicted_3rd,
          },
        ],
        tiebreaker_goals: tiebreaker ? parseInt(tiebreaker, 10) : undefined,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to save prediction')
      setSaving(false)
      return
    }

    // Update local state with the prediction we sent
    setPredictions((prev) => {
      const idx = prev.findIndex((p) => p.group_id === groupId)
      const newPred: GroupPrediction = {
        id: idx >= 0 ? prev[idx].id : '',
        entry_id: entry.id,
        group_id: groupId,
        predicted_1st,
        predicted_2nd,
        predicted_3rd,
        points_earned: idx >= 0 ? prev[idx].points_earned : 0,
        submitted_at: new Date().toISOString(),
      }
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = newPred
        return updated
      }
      return [...prev, newPred]
    })

    setSuccessMsg('Prediction saved!')
    setTimeout(() => setSuccessMsg(''), 2000)
    setSaving(false)
  }

  async function handleTiebreaker() {
    if (!entry || isReadonly) return
    setSaving(true)
    setError('')

    const goals = parseInt(tiebreaker, 10)
    if (isNaN(goals) || goals < 0) {
      setError('Please enter a valid number of goals')
      setSaving(false)
      return
    }

    // Route through API to enforce server-side tournament status/deadline checks
    const res = await fetch(`/api/tournaments/${slug}/predictions/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictions: [],
        tiebreaker_goals: goals,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to save tiebreaker')
    } else {
      setSuccessMsg('Tiebreaker saved!')
      setTimeout(() => setSuccessMsg(''), 2000)
    }
    setSaving(false)
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading...</p>
  if (error && !tournament) return <p className="py-12 text-center text-red-accent">{error}</p>

  const groups = tournament?.groups ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Group Stage Predictions</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {tournament?.name} &mdash; Predict the finishing order for each group
        </p>
        {deadline && !deadline.passed && (
          <p className="mt-1 text-sm font-medium text-yellow-accent">{deadline.label}</p>
        )}
        {isReadonly && (
          <p className="mt-2 rounded-md bg-yellow-accent/10 p-2 text-sm text-yellow-accent">
            Predictions are locked. The deadline has passed or the group stage is closed.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">{error}</div>
      )}
      {successMsg && (
        <div className="rounded-md bg-green-accent/10 p-3 text-sm text-green-accent">{successMsg}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <GroupPredictionCard
            key={group.id}
            group={group}
            prediction={predictions.find((p) => p.group_id === group.id)}
            onPredict={(first, second, third) => handlePrediction(group.id, first, second, third)}
            readonly={isReadonly}
            results={results.filter((r) => r.group_id === group.id)}
          />
        ))}
      </div>

      {/* Tiebreaker */}
      <Card header={<h2 className="font-semibold text-foreground">Tiebreaker</h2>}>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="Total goals scored in the group stage"
              id="tiebreaker"
              type="number"
              min="0"
              value={tiebreaker}
              onChange={(e) => setTiebreaker(e.target.value)}
              disabled={isReadonly}
              placeholder="e.g. 120"
            />
          </div>
          {!isReadonly && (
            <Button onClick={handleTiebreaker} loading={saving} size="md">
              Save
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
