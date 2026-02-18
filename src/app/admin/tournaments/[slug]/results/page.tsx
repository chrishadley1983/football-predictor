'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import type { Tournament, GroupWithTeams, GroupResult, KnockoutMatchWithTeams, KnockoutRound } from '@/lib/types'

interface TournamentData extends Tournament {
  groups: GroupWithTeams[]
  knockout_matches: KnockoutMatchWithTeams[]
}

const KNOCKOUT_ROUNDS: { key: KnockoutRound; label: string }[] = [
  { key: 'round_of_16', label: 'Round of 16' },
  { key: 'quarter_final', label: 'Quarter Finals' },
  { key: 'semi_final', label: 'Semi Finals' },
  { key: 'final', label: 'Final' },
]

export default function ResultsPage() {
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

  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [groupResults, setGroupResults] = useState<GroupResult[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState('')
  const [scoringLoading, setScoringLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function loadData() {
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

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const thirdPlaceCount = tournament?.third_place_qualifiers_count ?? null

  async function handleSetGroupResult(groupId: string, teamId: string, position: number, qualifiedOverride?: boolean) {
    setError('')
    // For tournaments with 3rd place qualifiers, position 3 qualification is manually toggled
    const qualified = qualifiedOverride !== undefined ? qualifiedOverride : position <= 2
    const res = await fetch(`/api/admin/tournaments/${slug}/game-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'group',
        group_id: groupId,
        team_id: teamId,
        final_position: position,
        qualified,
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to save group result')
      return
    }
    setSuccess('Group result saved')
    setTimeout(() => setSuccess(''), 2000)
    // Refresh group results
    const supabase = createClient()
    const groupIds = (tournament?.groups ?? []).map((g) => g.id)
    const { data: results } = await supabase
      .from('group_results')
      .select('*')
      .in('group_id', groupIds)
    if (results) setGroupResults(results)
  }

  async function handleSetKnockoutWinner(matchId: string, winnerId: string) {
    setError('')
    const res = await fetch(`/api/admin/tournaments/${slug}/game-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'knockout',
        match_id: matchId,
        winner_team_id: winnerId,
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to save knockout result')
      return
    }
    setSuccess('Knockout result saved (winner advanced)')
    setTimeout(() => setSuccess(''), 3000)
    await loadData()
  }

  async function handleForceCompleteGroups() {
    setActionLoading('group_stage')
    setError('')
    setSuccess('')
    const res = await fetch(`/api/admin/tournaments/${slug}/force-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'group_stage' }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Force-complete failed')
    } else {
      setSuccess(data.message || 'Group stage force-completed')
      await loadData()
    }
    setActionLoading('')
  }

  async function handleForceCompleteRound(round: KnockoutRound) {
    setActionLoading(round)
    setError('')
    setSuccess('')
    const res = await fetch(`/api/admin/tournaments/${slug}/force-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase: 'knockout_round', round }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Force-complete failed')
    } else {
      setSuccess(data.message || `${round} force-completed`)
      await loadData()
    }
    setActionLoading('')
  }

  async function handleRecalculateScores() {
    setScoringLoading(true)
    setError('')
    setSuccess('')
    const res = await fetch(`/api/tournaments/${slug}/score`, { method: 'POST' })
    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Scoring failed')
    } else {
      setSuccess('Scores recalculated successfully')
      setTimeout(() => setSuccess(''), 3000)
    }
    setScoringLoading(false)
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading...</p>
  if (!tournament) return <p className="py-12 text-center text-red-accent">{error || 'Tournament not found'}</p>

  const matchesByRound: Record<string, KnockoutMatchWithTeams[]> = {}
  for (const m of tournament.knockout_matches ?? []) {
    if (!matchesByRound[m.round]) matchesByRound[m.round] = []
    matchesByRound[m.round].push(m)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Results & Simulation: {tournament.name}
          </h1>
          <div className="mt-1"><TournamentStatusBadge status={tournament.status} /></div>
        </div>
        <a
          href={`/admin/tournaments/${slug}/manage`}
          className="rounded bg-surface-light px-3 py-1 text-xs font-medium text-text-secondary hover:bg-border-custom"
        >
          Back to Manage
        </a>
      </div>

      {error && <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">{error}</div>}
      {success && <div className="rounded-md bg-green-accent/10 p-3 text-sm text-green-accent">{success}</div>}

      {/* Force Complete Controls */}
      <Card header={<h2 className="font-semibold text-foreground">Force Complete (Simulation)</h2>}>
        <p className="mb-4 text-sm text-text-muted">
          Randomly assign results to speed up testing. Results are randomly generated.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={handleForceCompleteGroups}
            loading={actionLoading === 'group_stage'}
            variant="secondary"
            size="sm"
          >
            Force Complete Group Stage
          </Button>
          {KNOCKOUT_ROUNDS.map((r) => (
            <Button
              key={r.key}
              onClick={() => handleForceCompleteRound(r.key)}
              loading={actionLoading === r.key}
              variant="secondary"
              size="sm"
            >
              Force Complete {r.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 border-t border-border-custom pt-3">
          <Button
            onClick={handleRecalculateScores}
            loading={scoringLoading}
            variant="primary"
            size="sm"
          >
            Recalculate Scores
          </Button>
        </div>
      </Card>

      {/* Group Results */}
      {tournament.groups && tournament.groups.length > 0 && (
        <Card header={<h2 className="font-semibold text-foreground">Group Results</h2>}>
          <div className="space-y-6">
            {tournament.groups.map((group) => (
              <div key={group.id}>
                <h3 className="mb-2 text-sm font-semibold text-text-secondary">{group.name}</h3>
                <div className="space-y-2">
                  {group.group_teams.map((gt) => {
                    const result = groupResults.find((r) => r.group_id === group.id && r.team_id === gt.team.id)
                    return (
                      <div key={gt.team.id} className="flex items-center gap-3 rounded bg-surface-light p-2">
                        <span className="w-24 text-sm text-foreground">
                          {gt.team.flag_emoji} {gt.team.name}
                        </span>
                        <select
                          className="rounded border border-border-custom bg-surface-light px-2 py-1 text-xs text-foreground"
                          value={result?.final_position ?? ''}
                          onChange={(e) => {
                            const pos = parseInt(e.target.value, 10)
                            if (!isNaN(pos)) {
                              handleSetGroupResult(group.id, gt.team.id, pos)
                            }
                          }}
                        >
                          <option value="">Position</option>
                          <option value="1">1st</option>
                          <option value="2">2nd</option>
                          <option value="3">3rd</option>
                          <option value="4">4th</option>
                        </select>
                        {result && result.final_position === 3 && thirdPlaceCount !== null && (
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={result.qualified}
                              onChange={(e) => handleSetGroupResult(group.id, gt.team.id, 3, e.target.checked)}
                              className="h-3 w-3 accent-green-accent"
                            />
                            <span className="text-text-muted">Qual?</span>
                          </label>
                        )}
                        {result && (
                          <span className={`text-xs font-medium ${result.qualified ? 'text-green-accent' : 'text-text-muted'}`}>
                            {result.qualified ? 'Qualified' : 'Eliminated'}
                          </span>
                        )}
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
      {KNOCKOUT_ROUNDS.map((round) => {
        const matches = matchesByRound[round.key]
        if (!matches || matches.length === 0) return null
        return (
          <Card key={round.key} header={<h2 className="font-semibold text-foreground">{round.label}</h2>}>
            <div className="space-y-3">
              {matches.sort((a, b) => a.match_number - b.match_number).map((match) => (
                <div key={match.id} className="flex items-center gap-3 rounded bg-surface-light p-3">
                  <span className="w-12 text-xs font-medium text-text-muted">#{match.match_number}</span>
                  <div className="flex flex-1 items-center gap-2">
                    <span className={`text-sm ${match.winner_team_id === match.home_team_id ? 'font-bold text-green-accent' : 'text-foreground'}`}>
                      {match.home_team ? `${match.home_team.flag_emoji ?? ''} ${match.home_team.name}` : `(${match.home_source ?? 'TBD'})`}
                    </span>
                    <span className="text-xs text-text-muted">vs</span>
                    <span className={`text-sm ${match.winner_team_id === match.away_team_id ? 'font-bold text-green-accent' : 'text-foreground'}`}>
                      {match.away_team ? `${match.away_team.flag_emoji ?? ''} ${match.away_team.name}` : `(${match.away_source ?? 'TBD'})`}
                    </span>
                  </div>
                  {match.home_team_id && match.away_team_id && (
                    <select
                      className="rounded border border-border-custom bg-surface-light px-2 py-1 text-xs text-foreground"
                      value={match.winner_team_id ?? ''}
                      onChange={(e) => {
                        if (e.target.value) handleSetKnockoutWinner(match.id, e.target.value)
                      }}
                    >
                      <option value="">Pick winner</option>
                      <option value={match.home_team_id}>{match.home_team?.name ?? 'Home'}</option>
                      <option value={match.away_team_id}>{match.away_team?.name ?? 'Away'}</option>
                    </select>
                  )}
                  {match.winner_team_id && (
                    <span className="text-xs font-bold text-green-accent">
                      Winner: {match.winner_team?.name ?? '?'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
