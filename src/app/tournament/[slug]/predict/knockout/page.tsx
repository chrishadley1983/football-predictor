'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { KnockoutBracket } from '@/components/bracket/KnockoutBracket'
import { GoldenTicketModal } from '@/components/bracket/GoldenTicketModal'
import { Button } from '@/components/ui/Button'
import { getDeadlineStatus } from '@/lib/utils'
import { DeadlineCountdown } from '@/components/ui/Deadline'
import { resolveParticipantIds, predictionsToRecord } from '@/lib/bracket'
import type { Tournament, KnockoutMatchWithTeams, KnockoutPrediction, GoldenTicket } from '@/lib/types'
import type { EligibleSwap } from '@/lib/golden-ticket'

interface TournamentData extends Tournament {
  knockout_matches: KnockoutMatchWithTeams[]
}

export default function KnockoutPredictionPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [predictions, setPredictions] = useState<KnockoutPrediction[]>([])
  const [entryId, setEntryId] = useState<string | null>(null)
  const [koTiebreaker, setKoTiebreaker] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Any unsaved change (a pick or the tiebreaker) enables the save button.
  const [dirty, setDirty] = useState(false)
  // Golden ticket state
  const [goldenTicketUsed, setGoldenTicketUsed] = useState(false)
  const [goldenTicketWindowOpen, setGoldenTicketWindowOpen] = useState(false)
  const [eligibleSwaps, setEligibleSwaps] = useState<EligibleSwap[]>([])
  const [showGoldenTicketModal, setShowGoldenTicketModal] = useState(false)
  const [goldenTicket, setGoldenTicket] = useState<GoldenTicket | null>(null)

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

      // Admins can "step into" a player to view/play as them (cookie set by the
      // ImpersonationBar); otherwise resolve the viewer's own entry.
      const impEntryId =
        user.app_metadata?.role === 'admin'
          ? document.cookie.match(/(?:^|; )impersonate_entry=([^;]*)/)?.[1] ?? null
          : null

      let entry: { id: string; knockout_tiebreaker_goals: number | null } | null = null
      if (impEntryId) {
        const { data: imp } = await supabase
          .from('tournament_entries')
          .select('id, knockout_tiebreaker_goals')
          .eq('id', impEntryId)
          .eq('tournament_id', data.id)
          .maybeSingle()
        entry = imp
      }
      if (!entry) {
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()
        if (player) {
          const { data: own } = await supabase
            .from('tournament_entries')
            .select('id, knockout_tiebreaker_goals')
            .eq('tournament_id', data.id)
            .eq('player_id', player.id)
            .maybeSingle()
          entry = own
        }
      }

      if (!entry) {
        setError('You have not entered this tournament yet')
        setLoading(false)
        return
      }

      setEntryId(entry.id)
      if (entry.knockout_tiebreaker_goals !== null && entry.knockout_tiebreaker_goals !== undefined) {
        setKoTiebreaker(String(entry.knockout_tiebreaker_goals))
      }

      // Fetch existing knockout predictions
      const { data: preds } = await supabase
        .from('knockout_predictions')
        .select('*')
        .eq('entry_id', entry.id)

      if (preds) setPredictions(preds)

      // Fetch golden ticket state
      try {
        const gtRes = await fetch(`/api/tournaments/${slug}/golden-ticket`)
        if (gtRes.ok) {
          const gtData = await gtRes.json()
          setGoldenTicketUsed(gtData.hasUsedTicket)
          setGoldenTicketWindowOpen(gtData.window?.isOpen ?? false)
          setEligibleSwaps(gtData.eligibleSwaps ?? [])
          if (gtData.ticketDetails) setGoldenTicket(gtData.ticketDetails)
        }
      } catch {
        // Golden ticket fetch failed — not critical
      }

      setLoading(false)
    }
    load()
  }, [slug])

  const deadline = tournament ? getDeadlineStatus(tournament.knockout_stage_deadline) : null
  const isReadonly = deadline?.passed || tournament?.status !== 'knockout_open'

  const matches = useMemo(() => tournament?.knockout_matches ?? [], [tournament])

  // Number of matches with a valid (bracket-consistent) predicted winner.
  const validPredictedCount = useMemo(() => {
    if (matches.length === 0) return 0
    const { validWinners } = resolveParticipantIds(matches, predictionsToRecord(predictions))
    let n = 0
    for (const w of validWinners.values()) if (w) n++
    return n
  }, [matches, predictions])

  const handlePrediction = useCallback((matchId: string, teamId: string) => {
    if (isReadonly) return
    setPredictions((prev) => {
      const rec = predictionsToRecord(
        prev.map((p) => ({ match_id: p.match_id, predicted_winner_id: p.predicted_winner_id }))
      )
      rec[matchId] = teamId
      // Re-resolve: changing an upstream pick prunes any downstream pick that
      // depended on the team that was just dropped.
      const { validWinners } = resolveParticipantIds(matches, rec)
      const next: KnockoutPrediction[] = []
      for (const [mId, winnerId] of validWinners) {
        if (!winnerId) continue
        const existing = prev.find((p) => p.match_id === mId)
        next.push({
          id: existing?.id ?? '',
          entry_id: entryId ?? '',
          match_id: mId,
          predicted_winner_id: winnerId,
          is_correct: null,
          points_earned: 0,
          submitted_at: existing?.submitted_at ?? new Date().toISOString(),
        })
      }
      return next
    })
    setDirty(true)
  }, [isReadonly, entryId, matches])

  async function handleSaveAll() {
    if (!entryId) return
    setSaving(true)
    setError('')

    const predictionsPayload = predictions
      .filter((p) => p.predicted_winner_id)
      .map((p) => ({ match_id: p.match_id, predicted_winner_id: p.predicted_winner_id }))

    if (koTiebreaker.trim() === '') {
      setError('Please enter your tiebreaker — the total goals scored in the Knockout Stage.')
      setSaving(false)
      return
    }
    const koGoals = Number(koTiebreaker)
    if (!Number.isInteger(koGoals) || koGoals < 0) {
      setError('Knockout goal total must be a whole number of 0 or more')
      setSaving(false)
      return
    }

    const res = await fetch(`/api/tournaments/${slug}/predictions/knockout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predictions: predictionsPayload, knockout_tiebreaker_goals: koGoals }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to save predictions')
      setSaving(false)
      return
    }

    router.push(`/tournament/${slug}`)
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading bracket...</p>
  if (error && !tournament) return <p className="py-12 text-center text-red-accent">{error}</p>

  const totalMatches = matches.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Knockout Bracket Predictions</h1>
        <p className="mt-1 text-sm text-text-secondary">
          {tournament?.name} &mdash; Pick a winner for every match, all the way to the Final
        </p>
        {deadline && !deadline.passed && (
          <p className="mt-1 text-sm font-medium text-yellow-accent">
            <DeadlineCountdown deadline={tournament?.knockout_stage_deadline ?? null} showTime />
          </p>
        )}
        {isReadonly && (
          <p className="mt-2 rounded-md bg-yellow-accent/10 p-2 text-sm text-yellow-accent">
            Predictions are locked. The deadline has passed or the knockout stage is closed.
          </p>
        )}
        {!isReadonly && (
          <p className="mt-2 rounded-md bg-surface-light p-2 text-xs text-text-muted">
            Tip: pick a winner in each Round of 32 match and your picks flow forward — keep going
            round by round to crown your champion.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">{error}</div>
      )}

      <KnockoutBracket
        matches={matches}
        predictions={predictions}
        onPrediction={handlePrediction}
        readonly={isReadonly}
        goldenTicketMatchId={goldenTicket?.original_match_id}
        layout="columns"
        fullNames
      />

      {/* Knockout tiebreaker (required) */}
      {!isReadonly && (
        <div className="rounded-xl border border-border-custom bg-surface p-4">
          <label htmlFor="ko-tiebreaker" className="block text-sm font-medium text-foreground">
            Tiebreaker <span className="text-red-accent">*</span> — total goals scored in the Knockout Stage
          </label>
          <p className="mb-2 mt-1 text-xs text-text-muted">
            Your best guess for the combined goals scored across every knockout match (Round of 32
            through to the Final), <strong>excluding penalty shootouts</strong>. Required, and used
            to separate level scores.
          </p>
          <input
            id="ko-tiebreaker"
            type="number"
            min={0}
            inputMode="numeric"
            required
            value={koTiebreaker}
            onChange={(e) => {
              setKoTiebreaker(e.target.value)
              setDirty(true)
            }}
            placeholder="e.g. 90"
            className="w-32 rounded-md border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground"
          />
        </div>
      )}

      {/* Emergency Sub */}
      {goldenTicketWindowOpen && !goldenTicketUsed && eligibleSwaps.length > 0 && (
        <div className="rounded-xl border-2 border-gold bg-gold/10 p-4 text-center">
          <p className="mb-2 text-sm text-foreground">
            🔄 Your Emergency Sub is available! One of your predicted teams has been eliminated.
          </p>
          <Button
            onClick={() => setShowGoldenTicketModal(true)}
            className="bg-gold text-surface hover:bg-gold/90 font-bold"
          >
            🔄 Use Emergency Sub
          </Button>
        </div>
      )}

      {goldenTicketUsed && goldenTicket && (
        <div className="rounded-xl border border-gold/30 bg-gold/5 p-3 text-center text-sm text-text-muted">
          🔄 Emergency Sub used — swapped{' '}
          <span className="text-red-accent line-through">
            {(goldenTicket as GoldenTicket & { original_team?: { code: string } }).original_team?.code ?? '?'}
          </span>{' '}
          for{' '}
          <span className="font-medium text-green-accent">
            {(goldenTicket as GoldenTicket & { new_team?: { code: string } }).new_team?.code ?? '?'}
          </span>
        </div>
      )}

      {showGoldenTicketModal && (
        <GoldenTicketModal
          slug={slug}
          eligibleSwaps={eligibleSwaps}
          onClose={() => setShowGoldenTicketModal(false)}
          onSuccess={() => {
            setShowGoldenTicketModal(false)
            setGoldenTicketUsed(true)
            setGoldenTicketWindowOpen(false)
            // Reload predictions to reflect the swap
            window.location.reload()
          }}
        />
      )}

      {!isReadonly && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-xl border border-border-custom bg-surface p-4 shadow-lg shadow-black/30">
          <span className="text-sm text-text-secondary">
            {validPredictedCount} of {totalMatches} matches predicted
            {dirty && (
              <span className="ml-2 font-medium text-yellow-accent">· unsaved changes</span>
            )}
          </span>
          <Button onClick={handleSaveAll} loading={saving} disabled={!dirty}>
            Save Bracket
          </Button>
        </div>
      )}
    </div>
  )
}
