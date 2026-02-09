'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import type { Tournament, TournamentStatus, GroupWithTeams, GroupResult, KnockoutMatchWithTeams } from '@/lib/types'

const STATUS_TRANSITIONS: Record<TournamentStatus, { next: TournamentStatus; label: string } | null> = {
  draft: { next: 'group_stage_open', label: 'Open Group Stage' },
  group_stage_open: { next: 'group_stage_closed', label: 'Close Group Stage' },
  group_stage_closed: { next: 'knockout_open', label: 'Open Knockout Stage' },
  knockout_open: { next: 'knockout_closed', label: 'Close Knockout Stage' },
  knockout_closed: { next: 'completed', label: 'Mark Completed' },
  completed: null,
}

interface TournamentData extends Tournament {
  groups: GroupWithTeams[]
  knockout_matches: KnockoutMatchWithTeams[]
}

export default function ManageTournamentPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [groupResults, setGroupResults] = useState<GroupResult[]>([])
  const [totalGoals, setTotalGoals] = useState('')
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [scoringLoading, setScoringLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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

      // Load group results
      const supabase = createClient()
      const groupIds = (data.groups ?? []).map((g: GroupWithTeams) => g.id)
      if (groupIds.length > 0) {
        const { data: results } = await supabase
          .from('group_results')
          .select('*')
          .in('group_id', groupIds)
        if (results) setGroupResults(results)
      }

      // Load total goals
      const { data: stats } = await supabase
        .from('tournament_stats')
        .select('total_group_stage_goals')
        .eq('tournament_id', data.id)
        .single()
      if (stats?.total_group_stage_goals !== null && stats?.total_group_stage_goals !== undefined) {
        setTotalGoals(stats.total_group_stage_goals.toString())
      }

      setLoading(false)
    }
    load()
  }, [slug])

  async function handleStatusChange() {
    if (!tournament) return
    const transition = STATUS_TRANSITIONS[tournament.status]
    if (!transition) return

    setStatusLoading(true)
    setError('')
    setSuccess('')

    const res = await fetch(`/api/admin/tournaments/${slug}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: transition.next }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to update status')
    } else {
      const updated = await res.json()
      setTournament({ ...tournament, status: updated.status })
      setSuccess(`Status updated to ${updated.status}`)
    }
    setStatusLoading(false)
  }

  async function handleSaveGroupResult(groupId: string, teamId: string, position: number, qualified: boolean) {
    setError('')
    const supabase = createClient()

    // Upsert group result
    const existing = groupResults.find((r) => r.group_id === groupId && r.team_id === teamId)
    if (existing) {
      await supabase
        .from('group_results')
        .update({ final_position: position, qualified })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('group_results')
        .insert({ group_id: groupId, team_id: teamId, final_position: position, qualified })
    }

    // Refresh results
    const groupIds = (tournament?.groups ?? []).map((g) => g.id)
    const { data: results } = await supabase
      .from('group_results')
      .select('*')
      .in('group_id', groupIds)
    if (results) setGroupResults(results)

    setSuccess('Group result saved')
    setTimeout(() => setSuccess(''), 2000)
  }

  async function handleSaveKnockoutResult(matchId: string, winnerId: string) {
    setError('')
    const supabase = createClient()

    const { error: updateErr } = await supabase
      .from('knockout_matches')
      .update({ winner_team_id: winnerId })
      .eq('id', matchId)

    if (updateErr) {
      setError(updateErr.message)
      return
    }

    // Refresh tournament data
    const res = await fetch(`/api/tournaments/${slug}`)
    if (res.ok) {
      const data = await res.json()
      setTournament(data)
    }

    setSuccess('Knockout result saved')
    setTimeout(() => setSuccess(''), 2000)
  }

  async function handleSaveTotalGoals() {
    if (!tournament) return
    setError('')
    const goals = parseInt(totalGoals, 10)
    if (isNaN(goals) || goals < 0) {
      setError('Invalid goals number')
      return
    }

    const supabase = createClient()
    const { data: existing } = await supabase
      .from('tournament_stats')
      .select('id')
      .eq('tournament_id', tournament.id)
      .single()

    if (existing) {
      await supabase
        .from('tournament_stats')
        .update({ total_group_stage_goals: goals })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('tournament_stats')
        .insert({ tournament_id: tournament.id, total_group_stage_goals: goals })
    }

    setSuccess('Total goals saved')
    setTimeout(() => setSuccess(''), 2000)
  }

  async function handleTriggerScoring() {
    if (!tournament) return
    setScoringLoading(true)
    setError('')
    setSuccess('')

    // Call the scoring API (using server-side scoring engine)
    const res = await fetch(`/api/tournaments/${slug}/leaderboard`, {
      method: 'POST',
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to trigger scoring')
    } else {
      setSuccess('Scoring calculation completed!')
    }
    setScoringLoading(false)
  }

  if (loading) return <p className="py-12 text-center text-gray-500">Loading...</p>
  if (!tournament) return <p className="py-12 text-center text-red-600">{error || 'Tournament not found'}</p>

  const transition = STATUS_TRANSITIONS[tournament.status]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Manage: {tournament.name}</h1>
          <div className="mt-1"><TournamentStatusBadge status={tournament.status} /></div>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}
      {success && <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{success}</div>}

      {/* Status Management */}
      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Tournament Status</h2>}>
        <div className="flex items-center gap-4">
          <TournamentStatusBadge status={tournament.status} />
          {transition && (
            <Button onClick={handleStatusChange} loading={statusLoading} variant="primary" size="sm">
              {transition.label}
            </Button>
          )}
          {!transition && (
            <span className="text-sm text-gray-500">Tournament is completed.</span>
          )}
        </div>
      </Card>

      {/* Scoring */}
      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Scoring</h2>}>
        <div className="space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input
                label="Total group stage goals (tiebreaker)"
                id="totalGoals"
                type="number"
                min="0"
                value={totalGoals}
                onChange={(e) => setTotalGoals(e.target.value)}
                placeholder="e.g. 120"
              />
            </div>
            <Button onClick={handleSaveTotalGoals} size="sm" variant="secondary">
              Save
            </Button>
          </div>
          <Button onClick={handleTriggerScoring} loading={scoringLoading}>
            Recalculate All Scores
          </Button>
        </div>
      </Card>

      {/* Group Results */}
      {tournament.groups && tournament.groups.length > 0 && (
        <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Group Results</h2>}>
          <div className="space-y-6">
            {tournament.groups.map((group) => (
              <div key={group.id}>
                <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{group.name}</h3>
                <div className="space-y-2">
                  {group.group_teams.map((gt) => {
                    const result = groupResults.find((r) => r.group_id === group.id && r.team_id === gt.team.id)
                    return (
                      <div key={gt.team.id} className="flex items-center gap-3 rounded bg-gray-50 p-2 dark:bg-gray-800">
                        <span className="w-20 text-sm">
                          {gt.team.flag_emoji} {gt.team.code}
                        </span>
                        <select
                          className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700"
                          value={result?.final_position ?? ''}
                          onChange={(e) => {
                            const pos = parseInt(e.target.value, 10)
                            if (!isNaN(pos)) {
                              handleSaveGroupResult(group.id, gt.team.id, pos, pos <= 2)
                            }
                          }}
                        >
                          <option value="">Position</option>
                          <option value="1">1st</option>
                          <option value="2">2nd</option>
                          <option value="3">3rd</option>
                          <option value="4">4th</option>
                        </select>
                        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                          <input
                            type="checkbox"
                            checked={result?.qualified ?? false}
                            onChange={(e) => {
                              handleSaveGroupResult(
                                group.id,
                                gt.team.id,
                                result?.final_position ?? 4,
                                e.target.checked
                              )
                            }}
                          />
                          Qualified
                        </label>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Knockout Results */}
      {tournament.knockout_matches && tournament.knockout_matches.length > 0 && (
        <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Knockout Results</h2>}>
          <div className="space-y-3">
            {tournament.knockout_matches.map((match) => (
              <div key={match.id} className="flex items-center gap-3 rounded bg-gray-50 p-2 dark:bg-gray-800">
                <span className="w-28 text-xs text-gray-500">
                  {match.round.replace(/_/g, ' ')} #{match.match_number}
                </span>
                <span className="w-16 text-xs">
                  {match.home_team ? `${match.home_team.flag_emoji ?? ''} ${match.home_team.code}` : 'TBD'}
                </span>
                <span className="text-xs text-gray-400">vs</span>
                <span className="w-16 text-xs">
                  {match.away_team ? `${match.away_team.flag_emoji ?? ''} ${match.away_team.code}` : 'TBD'}
                </span>
                <select
                  className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700"
                  value={match.winner_team_id ?? ''}
                  onChange={(e) => {
                    if (e.target.value) handleSaveKnockoutResult(match.id, e.target.value)
                  }}
                  disabled={!match.home_team_id || !match.away_team_id}
                >
                  <option value="">Select winner</option>
                  {match.home_team_id && (
                    <option value={match.home_team_id}>
                      {match.home_team?.code ?? 'Home'}
                    </option>
                  )}
                  {match.away_team_id && (
                    <option value={match.away_team_id}>
                      {match.away_team?.code ?? 'Away'}
                    </option>
                  )}
                </select>
                {match.winner_team_id && (
                  <span className="text-xs font-medium text-green-600">
                    Winner: {match.winner_team?.code ?? '?'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
