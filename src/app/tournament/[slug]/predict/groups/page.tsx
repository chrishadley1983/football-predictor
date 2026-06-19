'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GroupPredictionCard } from '@/components/groups/GroupPredictionCard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { getDeadlineStatus } from '@/lib/utils'
import { DeadlineCountdown } from '@/components/ui/Deadline'
import { getPredictionProgress } from '@/lib/predictions'
import { computeDecidedTeamIds } from '@/lib/decided-teams'
import type { Tournament, GroupWithTeams, GroupPrediction, GroupResult, TournamentEntry } from '@/lib/types'

interface TournamentData extends Tournament {
  groups: GroupWithTeams[]
}

export default function GroupPredictionPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [entry, setEntry] = useState<TournamentEntry | null>(null)
  const [predictions, setPredictions] = useState<GroupPrediction[]>([])
  const [results, setResults] = useState<GroupResult[]>([])
  const [decidedTeamIds, setDecidedTeamIds] = useState<string[]>([])
  const [tiebreaker, setTiebreaker] = useState('')
  const [thirdPlaceSelections, setThirdPlaceSelections] = useState<Record<string, boolean>>({})
  // Local draft state per group: groupId -> { first, second, third }
  const [drafts, setDrafts] = useState<Record<string, { first: string; second: string; third: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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

      const { data: preds } = await supabase
        .from('group_predictions')
        .select('*')
        .eq('entry_id', entryData.id)

      if (preds) {
        setPredictions(preds)
        // Initialize drafts from existing predictions
        const initialDrafts: Record<string, { first: string; second: string; third: string }> = {}
        for (const p of preds) {
          initialDrafts[p.group_id] = {
            first: p.predicted_1st ?? '',
            second: p.predicted_2nd ?? '',
            third: p.predicted_3rd ?? '',
          }
        }
        setDrafts(initialDrafts)

        if (data.third_place_qualifiers_count) {
          const selections: Record<string, boolean> = {}
          for (const p of preds) {
            selections[p.group_id] = p.predicted_3rd !== null
          }
          setThirdPlaceSelections(selections)
        }
      }

      const groupIds = data.groups?.map((g: GroupWithTeams) => g.id) ?? []
      if (groupIds.length > 0) {
        const { data: groupResults } = await supabase
          .from('group_results')
          .select('*')
          .in('group_id', groupIds)
        if (groupResults) setResults(groupResults)
        // Only show the green/yellow/red status rings once a team's group fate is
        // mathematically settled (clinched or eliminated).
        setDecidedTeamIds(computeDecidedTeamIds(groupResults ?? []))
      }

      setLoading(false)
    }
    load()
  }, [slug])

  const deadline = tournament ? getDeadlineStatus(tournament.group_stage_deadline) : null
  const isReadonly = deadline?.passed || tournament?.status !== 'group_stage_open'

  // Track local draft changes per group (called from GroupPredictionCard)
  const handleDraftChange = useCallback((groupId: string, first: string, second: string, third: string | null) => {
    setDrafts((prev) => ({
      ...prev,
      [groupId]: { first, second, third: third ?? '' },
    }))
  }, [])

  async function handleSubmitAll() {
    if (!entry || isReadonly) return
    setSaving(true)
    setError('')

    // Tiebreaker is required: an unanswered tiebreaker leaves us with no way to
    // separate level-on-points entries at the end of the group stage.
    if (!tiebreaker.trim()) {
      setError('Please enter the tiebreaker (your predicted total group-stage goals) before submitting.')
      setSaving(false)
      return
    }

    const hasThirdPlaceFeature = (tournament?.third_place_qualifiers_count ?? null) !== null

    // Build predictions array from drafts
    const groups = tournament?.groups ?? []
    const predictionPayload = groups
      .map((group) => {
        const draft = drafts[group.id]
        if (!draft || !draft.first || !draft.second) return null
        return {
          group_id: group.id,
          predicted_1st: draft.first,
          predicted_2nd: draft.second,
          predicted_3rd: hasThirdPlaceFeature && !thirdPlaceSelections[group.id]
            ? null
            : (draft.third || null),
        }
      })
      .filter(Boolean)

    if (predictionPayload.length === 0) {
      setError('Please fill in at least one group prediction')
      setSaving(false)
      return
    }

    const res = await fetch(`/api/tournaments/${slug}/predictions/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictions: predictionPayload,
        tiebreaker_goals: tiebreaker ? parseInt(tiebreaker, 10) : undefined,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to save predictions')
      setSaving(false)
      return
    }

    router.push(`/tournament/${slug}`)
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading...</p>
  if (error && !tournament) return <p className="py-12 text-center text-red-accent">{error}</p>

  const groups = tournament?.groups ?? []
  const thirdPlaceCount = tournament?.third_place_qualifiers_count ?? null
  const selectedCount = Object.values(thirdPlaceSelections).filter(Boolean).length
  const limitReached = thirdPlaceCount !== null && selectedCount >= thirdPlaceCount

  // Total group-stage matches = sum across groups of n*(n-1)/2 where n is the
  // number of teams. Lets the tiebreaker hint state "There are 72 group games"
  // dynamically — works for any tournament shape (WC2026 = 12×6 = 72,
  // Euros 2024 = 6×6 = 36, etc.).
  const groupMatchCount = groups.reduce((sum, g) => {
    const n = g.group_teams?.length ?? 0
    return sum + (n * (n - 1)) / 2
  }, 0)

  // Count how many groups have complete predictions in drafts
  const hasThirdPlaceFeature = thirdPlaceCount !== null
  const completedGroups = groups.filter((g) => {
    const d = drafts[g.id]
    if (!d || !d.first || !d.second) return false
    if (hasThirdPlaceFeature) {
      return thirdPlaceSelections[g.id] ? !!d.third : true
    }
    return !!d.third
  }).length

  // Dynamic submit-button label mirroring the overview Group Predictions card.
  const groupProgress = getPredictionProgress(
    'group',
    tournament?.status ?? 'group_stage_open',
    completedGroups,
    groups.length,
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Group Stage Predictions</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {tournament?.name} &mdash; Predict the finishing order for each group
        </p>
        {deadline && !deadline.passed && (
          <p className="mt-1 text-sm font-medium text-yellow-accent">
            <DeadlineCountdown deadline={tournament?.group_stage_deadline ?? null} showTime />
          </p>
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

      {thirdPlaceCount !== null && (
        <div className={`rounded-md p-3 text-sm font-medium ${limitReached ? 'bg-green-accent/10 text-green-accent' : 'bg-yellow-accent/10 text-yellow-accent'}`}>
          3rd place qualifiers selected: {selectedCount} / {thirdPlaceCount}
          {!limitReached && ` — select ${thirdPlaceCount - selectedCount} more`}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <GroupPredictionCard
            key={group.id}
            group={group}
            prediction={predictions.find((p) => p.group_id === group.id)}
            onPredict={(first, second, third) => handleDraftChange(group.id, first, second, third)}
            readonly={isReadonly}
            results={results.filter((r) => r.group_id === group.id)}
            decidedTeamIds={decidedTeamIds}
            hideSubmitButton
            {...(thirdPlaceCount !== null ? {
              thirdPlaceQualifies: !!thirdPlaceSelections[group.id],
              onThirdPlaceToggle: (checked: boolean) => {
                setThirdPlaceSelections((prev) => ({ ...prev, [group.id]: checked }))
              },
              canToggleThirdPlace: !limitReached,
            } : {})}
          />
        ))}
      </div>

      {/* Tiebreaker */}
      <Card header={<h2 className="font-semibold text-foreground">Tiebreaker <span className="text-xs font-normal text-red-accent">(required)</span></h2>}>
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
          {groupMatchCount > 0 && (
            <p className="mt-2 text-xs text-text-muted">
              There {groupMatchCount === 1 ? 'is' : 'are'} <strong className="text-foreground">{groupMatchCount}</strong> group {groupMatchCount === 1 ? 'game' : 'games'} in this tournament — take a guess at the combined total goals scored across all of them.
            </p>
          )}
        </div>
      </Card>

      {/* Single submit button */}
      {!isReadonly && (
        <div className="sticky bottom-4 z-20">
          <Button
            onClick={handleSubmitAll}
            loading={saving}
            disabled={!tiebreaker.trim()}
            size="lg"
            className="w-full shadow-lg shadow-black/30"
            title={!tiebreaker.trim() ? 'Enter the tiebreaker first' : undefined}
          >
            {groupProgress.title} ({completedGroups}/{groups.length} groups)
          </Button>
        </div>
      )}
    </div>
  )
}
