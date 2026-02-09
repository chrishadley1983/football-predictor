'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Tournament, GroupWithTeams, KnockoutMatchWithTeams } from '@/lib/types'

interface TournamentData extends Tournament {
  groups: GroupWithTeams[]
  knockout_matches: KnockoutMatchWithTeams[]
}

export default function SetupPage() {
  const { slug } = useParams<{ slug: string }>()
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [seedLoading, setSeedLoading] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Admin auth check
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.role !== 'admin') {
        window.location.href = '/'
      }
    })
  }, [])

  const loadTournament = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${slug}`)
    if (!res.ok) {
      setError('Tournament not found')
      setLoading(false)
      return
    }
    const data = await res.json()
    setTournament(data)
    setLoading(false)
  }, [slug])

  useEffect(() => {
    loadTournament()
  }, [loadTournament])

  async function handleSeedWC2022() {
    setSeedLoading(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/admin/seed/wc2022', { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Failed to seed data')
    } else {
      setSuccess(
        `Seeded WC 2022: ${data.counts.teams} teams, ${data.counts.groups} groups, ${data.counts.knockout_matches} matches`
      )
      // Reload the tournament data for the seeded tournament
      const tournamentRes = await fetch(`/api/tournaments/${data.tournament.slug}`)
      if (tournamentRes.ok) {
        const tournamentData = await tournamentRes.json()
        setTournament(tournamentData)
      }
    }
    setSeedLoading(false)
  }

  async function handleSetupFromGroups() {
    if (!tournament) return
    setSetupLoading(true)
    setError('')
    setSuccess('')

    // Build the setup payload from existing groups
    const groups = tournament.groups.map((g) => ({
      name: g.name,
      teams: g.group_teams.map((gt) => ({
        name: gt.team.name,
        code: gt.team.code,
        flag_emoji: gt.team.flag_emoji || '',
      })),
    }))

    const knockout_config = [
      { round: 'round_of_16', points_value: 2, match_count: 8 },
      { round: 'quarter_final', points_value: 4, match_count: 4 },
      { round: 'semi_final', points_value: 8, match_count: 2 },
      { round: 'final', points_value: 16, match_count: 1 },
    ]

    const res = await fetch(`/api/admin/tournaments/${slug}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups, knockout_config }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Setup failed')
    } else {
      setSuccess(`Setup complete: ${data.counts.groups} groups, ${data.counts.knockout_matches} matches`)
      await loadTournament()
    }
    setSetupLoading(false)
  }

  if (loading) return <p className="py-12 text-center text-gray-500">Loading...</p>
  if (!tournament) return <p className="py-12 text-center text-red-600">{error || 'Tournament not found'}</p>

  const groupCount = tournament.groups?.length ?? 0
  const teamCount = tournament.groups?.reduce((sum, g) => sum + g.group_teams.length, 0) ?? 0
  const matchCount = tournament.knockout_matches?.length ?? 0

  const roundOrder = ['round_of_16', 'quarter_final', 'semi_final', 'final']
  const roundLabels: Record<string, string> = {
    round_of_16: 'Round of 16',
    quarter_final: 'Quarter Finals',
    semi_final: 'Semi Finals',
    final: 'Final',
  }

  // Group matches by round
  const matchesByRound: Record<string, KnockoutMatchWithTeams[]> = {}
  for (const m of tournament.knockout_matches ?? []) {
    if (!matchesByRound[m.round]) matchesByRound[m.round] = []
    matchesByRound[m.round].push(m)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Setup: {tournament.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            <Link href={`/admin/tournaments/${slug}/manage`} className="text-green-600 hover:underline">
              Back to Manage
            </Link>
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {success}
        </div>
      )}

      {/* Section 1: Quick Setup */}
      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Quick Setup</h2>}>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleSeedWC2022} loading={seedLoading} variant="primary">
              Seed WC 2022 Data
            </Button>
            <span className="text-xs text-gray-500">Creates a test tournament with all 32 teams and bracket</span>
          </div>
          <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-800">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Status</h3>
            <div className="mt-2 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{groupCount}</div>
                <div className="text-xs text-gray-500">Groups</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{teamCount}</div>
                <div className="text-xs text-gray-500">Teams</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{matchCount}</div>
                <div className="text-xs text-gray-500">Knockout Matches</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section 2: Groups Overview */}
      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Groups</h2>}>
        {groupCount === 0 ? (
          <p className="text-sm text-gray-500">No groups set up yet. Use Quick Setup above.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {tournament.groups.map((group) => (
                <div key={group.id} className="rounded-md border border-gray-200 p-3 dark:border-gray-700">
                  <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {group.name}
                  </h3>
                  <div className="space-y-1">
                    {group.group_teams.map((gt) => (
                      <div key={gt.team.id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span>{gt.team.flag_emoji}</span>
                        <span>{gt.team.name}</span>
                        <span className="text-xs text-gray-400">({gt.team.code})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {groupCount > 0 && matchCount === 0 && (
              <Button onClick={handleSetupFromGroups} loading={setupLoading} variant="secondary">
                Generate Knockout Bracket
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Section 3: Bracket Preview */}
      {matchCount > 0 && (
        <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Bracket Preview</h2>}>
          <div className="space-y-4">
            {roundOrder
              .filter((round) => matchesByRound[round])
              .map((round) => (
                <div key={round}>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {roundLabels[round] ?? round}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {matchesByRound[round]
                      .sort((a, b) => a.match_number - b.match_number)
                      .map((match) => (
                        <div
                          key={match.id}
                          className="flex items-center gap-2 rounded bg-gray-50 p-2 text-sm dark:bg-gray-800"
                        >
                          <span className="w-6 text-xs text-gray-400">#{match.match_number}</span>
                          <span className="flex-1">
                            {match.home_team
                              ? `${match.home_team.flag_emoji ?? ''} ${match.home_team.code}`
                              : match.home_source ?? 'TBD'}
                          </span>
                          <span className="text-xs text-gray-400">vs</span>
                          <span className="flex-1">
                            {match.away_team
                              ? `${match.away_team.flag_emoji ?? ''} ${match.away_team.code}`
                              : match.away_source ?? 'TBD'}
                          </span>
                          {match.winner_team && (
                            <span className="text-xs font-medium text-green-600">
                              W: {match.winner_team.code}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            <Button onClick={handleSetupFromGroups} loading={setupLoading} variant="secondary" size="sm">
              Regenerate Bracket
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
