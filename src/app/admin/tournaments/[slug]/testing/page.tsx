'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import type { TournamentStatus } from '@/lib/types'

interface TournamentState {
  id: string
  name: string
  slug: string
  status: TournamentStatus
  third_place_qualifiers_count: number | null
  entry_count: number
  groups_completed: number
  groups_total: number
  knockout_rounds: { round: string; decided: number; total: number }[]
  has_scores: boolean
}

interface LeaderboardEntry {
  rank: number | null
  name: string
  group_stage_points: number
  knockout_points: number
  total_points: number
  tiebreaker_diff: number | null
}

type Phase =
  | 'after_group_stage'
  | 'after_round_of_32'
  | 'after_round_of_16'
  | 'after_quarter_finals'
  | 'after_semi_finals'
  | 'completed'

const PHASES: { value: Phase; label: string; r32Only?: boolean }[] = [
  { value: 'after_group_stage', label: 'After Group Stage' },
  { value: 'after_round_of_32', label: 'After Round of 32', r32Only: true },
  { value: 'after_round_of_16', label: 'After Round of 16' },
  { value: 'after_quarter_finals', label: 'After Quarter Finals' },
  { value: 'after_semi_finals', label: 'After Semi Finals' },
  { value: 'completed', label: 'Completed' },
]

export default function TestingPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const [state, setState] = useState<TournamentState | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [phase, setPhase] = useState<Phase>('after_group_stage')
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resultLog, setResultLog] = useState<string[]>([])

  // Check admin access
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.role !== 'admin') {
        router.replace('/')
      }
    })
  }, [router])

  const loadState = useCallback(async () => {
    try {
      const supabase = createClient()

      // Get tournament
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('id, name, slug, status, third_place_qualifiers_count')
        .eq('slug', slug)
        .single()

      if (!tournament) {
        setError('Tournament not found')
        setLoading(false)
        return
      }

      // Count entries
      const { count: entryCount } = await supabase
        .from('tournament_entries')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)

      // Count completed groups
      const { data: groups } = await supabase
        .from('groups')
        .select('id')
        .eq('tournament_id', tournament.id)

      const groupIds = (groups ?? []).map((g) => g.id)
      let groupsCompleted = 0
      if (groupIds.length > 0) {
        const { data: results } = await supabase
          .from('group_results')
          .select('group_id')
          .in('group_id', groupIds)

        const completedGroups = new Set((results ?? []).map((r) => r.group_id))
        groupsCompleted = completedGroups.size
      }

      // Get knockout round status
      const { data: knockoutMatches } = await supabase
        .from('knockout_matches')
        .select('round, winner_team_id')
        .eq('tournament_id', tournament.id)

      const roundMap = new Map<string, { decided: number; total: number }>()
      for (const m of knockoutMatches ?? []) {
        const entry = roundMap.get(m.round) ?? { decided: 0, total: 0 }
        entry.total++
        if (m.winner_team_id) entry.decided++
        roundMap.set(m.round, entry)
      }

      const knockoutRounds = Array.from(roundMap.entries())
        .map(([round, stats]) => ({ round, ...stats }))

      // Check if any entries have scores
      const { data: scoredEntries } = await supabase
        .from('tournament_entries')
        .select('total_points')
        .eq('tournament_id', tournament.id)
        .gt('total_points', 0)
        .limit(1)

      setState({
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        status: tournament.status,
        third_place_qualifiers_count: tournament.third_place_qualifiers_count,
        entry_count: entryCount ?? 0,
        groups_completed: groupsCompleted,
        groups_total: groupIds.length,
        knockout_rounds: knockoutRounds,
        has_scores: (scoredEntries ?? []).length > 0,
      })

      setLoading(false)
    } catch {
      setError('Failed to load tournament state')
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    loadState()
  }, [loadState])

  function clearMessages() {
    setError('')
    setSuccess('')
    setResultLog([])
    setLeaderboard([])
  }

  async function handleTimeMachine() {
    clearMessages()
    setActionLoading('time-machine')

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/time-machine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Time machine failed')
      } else {
        setSuccess(`Time machine complete: ${phase}`)
        setResultLog(data.log ?? [])
        setLeaderboard(data.leaderboard ?? [])
        await loadState()
      }
    } catch {
      setError('Time machine request failed')
    }
    setActionLoading(null)
  }

  async function handleSeedEntries() {
    clearMessages()
    setActionLoading('seed-entries')

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/seed-entries`, {
        method: 'POST',
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Seed entries failed')
      } else {
        setSuccess(`Created ${data.players_created} players, ${data.entries_created} entries, ${data.predictions_created} predictions`)
        await loadState()
      }
    } catch {
      setError('Seed entries request failed')
    }
    setActionLoading(null)
  }

  async function handleSeedResults(targetPhase: Phase) {
    clearMessages()
    setActionLoading('seed-results')

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/seed-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: targetPhase }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Seed results failed')
      } else {
        setSuccess(`Results seeded to: ${targetPhase}`)
        setResultLog(data.log ?? [])
        setLeaderboard(data.leaderboard ?? [])
        await loadState()
      }
    } catch {
      setError('Seed results request failed')
    }
    setActionLoading(null)
  }

  async function handleReset() {
    if (!resetConfirm) {
      setResetConfirm(true)
      return
    }

    clearMessages()
    setResetConfirm(false)
    setActionLoading('reset')

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/reset-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Reset failed')
      } else {
        setSuccess(`Reset complete. ${data.entries_deleted} entries deleted.`)
        await loadState()
      }
    } catch {
      setError('Reset request failed')
    }
    setActionLoading(null)
  }

  async function handleRecalculate() {
    clearMessages()
    setActionLoading('recalculate')

    try {
      const res = await fetch(`/api/tournaments/${slug}/score`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Scoring failed')
      } else {
        setSuccess('Scores recalculated')
        await loadState()
      }
    } catch {
      setError('Scoring request failed')
    }
    setActionLoading(null)
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading...</p>
  if (!state) return <p className="py-12 text-center text-red-accent">{error || 'Tournament not found'}</p>

  const hasR32 = state.knockout_rounds.some((r) => r.round === 'round_of_32')
  const availablePhases = PHASES.filter((p) => !p.r32Only || hasR32)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Testing: {state.name}</h1>
          <div className="mt-1"><TournamentStatusBadge status={state.status} /></div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/admin/tournaments/${slug}/manage`}
            className="rounded-md bg-surface-light px-4 py-2 text-sm font-medium text-text-secondary hover:bg-border-custom"
          >
            Manage
          </a>
          <a
            href={`/tournament/${slug}/leaderboard`}
            className="rounded-md bg-green-accent/20 px-4 py-2 text-sm font-medium text-green-accent hover:bg-green-accent/30"
          >
            View Leaderboard
          </a>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">{error}</div>}
      {success && <div className="rounded-md bg-green-accent/10 p-3 text-sm text-green-accent">{success}</div>}

      {/* Time Machine */}
      <Card header={<h2 className="font-semibold text-foreground">Time Machine</h2>}>
        <p className="mb-4 text-sm text-text-muted">
          One-click reset + seed entries + seed results to any tournament phase. This will delete all existing entries and results first.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="phase" className="mb-1 block text-xs font-medium text-text-secondary">
              Target Phase
            </label>
            <select
              id="phase"
              className="rounded-md border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground"
              value={phase}
              onChange={(e) => setPhase(e.target.value as Phase)}
            >
              {availablePhases.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleTimeMachine}
            loading={actionLoading === 'time-machine'}
            disabled={!!actionLoading}
            variant="primary"
          >
            Launch Time Machine
          </Button>
        </div>
      </Card>

      {/* Results Log */}
      {resultLog.length > 0 && (
        <Card header={<h2 className="font-semibold text-foreground">Execution Log</h2>}>
          <ul className="space-y-1 text-xs font-mono text-text-muted">
            {resultLog.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Leaderboard Preview */}
      {leaderboard.length > 0 && (
        <Card header={<h2 className="font-semibold text-foreground">Leaderboard Preview</h2>}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted">
                <th className="pb-2 pr-3">#</th>
                <th className="pb-2 pr-3">Player</th>
                <th className="pb-2 pr-3 text-right">Group</th>
                <th className="pb-2 pr-3 text-right">KO</th>
                <th className="pb-2 pr-3 text-right">Total</th>
                <th className="pb-2 text-right">TB Diff</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((entry, i) => (
                <tr key={i} className="border-t border-border-custom">
                  <td className="py-1.5 pr-3 text-text-muted">{entry.rank ?? '-'}</td>
                  <td className="py-1.5 pr-3 font-medium text-foreground">{entry.name}</td>
                  <td className="py-1.5 pr-3 text-right text-text-secondary">{entry.group_stage_points}</td>
                  <td className="py-1.5 pr-3 text-right text-text-secondary">{entry.knockout_points}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold text-gold">{entry.total_points}</td>
                  <td className="py-1.5 text-right text-text-muted">{entry.tiebreaker_diff ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Individual Actions */}
      <Card header={<h2 className="font-semibold text-foreground">Individual Actions</h2>}>
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-medium text-text-secondary">Seed Test Entries</h3>
            <p className="mb-2 text-xs text-text-muted">
              Creates 10 test players with group predictions and tiebreaker guesses. Safe to run multiple times (skips duplicates).
            </p>
            <Button
              onClick={handleSeedEntries}
              loading={actionLoading === 'seed-entries'}
              disabled={!!actionLoading}
              variant="secondary"
              size="sm"
            >
              Seed Entries
            </Button>
          </div>

          <div className="border-t border-border-custom pt-4">
            <h3 className="mb-2 text-sm font-medium text-text-secondary">Seed Results</h3>
            <p className="mb-2 text-xs text-text-muted">
              Seed random results up to a phase. Requires entries to exist. Also generates knockout predictions.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              {availablePhases.map((p) => (
                <Button
                  key={p.value}
                  onClick={() => handleSeedResults(p.value)}
                  loading={actionLoading === 'seed-results'}
                  disabled={!!actionLoading}
                  variant="ghost"
                  size="sm"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t border-border-custom pt-4">
            <h3 className="mb-2 text-sm font-medium text-text-secondary">Reset Test Data</h3>
            <p className="mb-2 text-xs text-text-muted">
              Deletes all entries, predictions, results, and scores. Preserves tournament structure. Resets status to group_stage_open.
            </p>
            <Button
              onClick={handleReset}
              loading={actionLoading === 'reset'}
              disabled={!!actionLoading}
              variant={resetConfirm ? 'danger' : 'secondary'}
              size="sm"
            >
              {resetConfirm ? 'Confirm Reset' : 'Reset Test Data'}
            </Button>
            {resetConfirm && (
              <button
                className="ml-2 text-xs text-text-muted hover:text-foreground"
                onClick={() => setResetConfirm(false)}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Current State */}
      <Card header={<h2 className="font-semibold text-foreground">Current State</h2>}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Status</span>
            <TournamentStatusBadge status={state.status} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Entries</span>
            <span className="font-medium text-foreground">{state.entry_count}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Groups Completed</span>
            <span className="font-medium text-foreground">{state.groups_completed} / {state.groups_total}</span>
          </div>
          {state.knockout_rounds.length > 0 && (
            <div>
              <span className="text-text-muted">Knockout Rounds</span>
              <div className="mt-1 space-y-1">
                {state.knockout_rounds.map((r) => (
                  <div key={r.round} className="flex items-center justify-between rounded bg-surface-light px-2 py-1">
                    <span className="text-xs text-text-secondary">{r.round.replace(/_/g, ' ')}</span>
                    <span className={`text-xs font-medium ${r.decided === r.total && r.total > 0 ? 'text-green-accent' : 'text-text-muted'}`}>
                      {r.decided} / {r.total}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Scores Calculated</span>
            <span className={`font-medium ${state.has_scores ? 'text-green-accent' : 'text-text-muted'}`}>
              {state.has_scores ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="border-t border-border-custom pt-3">
            <Button
              onClick={handleRecalculate}
              loading={actionLoading === 'recalculate'}
              disabled={!!actionLoading}
              variant="secondary"
              size="sm"
            >
              Recalculate Scores
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
