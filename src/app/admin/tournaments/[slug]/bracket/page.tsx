'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface R32Match {
  id: string
  match_number: number
  home_source: string | null
  away_source: string | null
  home_team_id: string | null
  away_team_id: string | null
}

interface TeamOption {
  id: string
  code: string
  name: string
}

export default function BracketSetupPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()

  const [matches, setMatches] = useState<R32Match[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  // matchId -> { home, away } selected team ids
  const [picks, setPicks] = useState<Record<string, { home: string; away: string }>>({})
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tournamentName, setTournamentName] = useState('')

  // Admin gate
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.role !== 'admin') router.replace('/')
    })
  }, [router])

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id, name')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      setError('Tournament not found')
      setLoading(false)
      return
    }
    setTournamentName(tournament.name)

    const { data: koMatches } = await supabase
      .from('knockout_matches')
      .select('id, match_number, home_source, away_source, home_team_id, away_team_id, round')
      .eq('tournament_id', tournament.id)
      .eq('round', 'round_of_32')
      .order('match_number')

    const r32 = (koMatches ?? []) as R32Match[]
    setMatches(r32)

    const initialPicks: Record<string, { home: string; away: string }> = {}
    for (const m of r32) {
      initialPicks[m.id] = { home: m.home_team_id ?? '', away: m.away_team_id ?? '' }
    }
    setPicks(initialPicks)

    // Team pool: every team assigned to a group in this tournament
    const { data: groups } = await supabase
      .from('groups')
      .select('id')
      .eq('tournament_id', tournament.id)
    const groupIds = (groups ?? []).map((g) => g.id)
    if (groupIds.length > 0) {
      const { data: gts } = await supabase
        .from('group_teams')
        .select('team:teams ( id, code, name )')
        .in('group_id', groupIds)
      const pool: TeamOption[] = []
      const seen = new Set<string>()
      for (const gt of gts ?? []) {
        const team = gt.team as unknown as TeamOption | null
        if (team && !seen.has(team.id)) {
          seen.add(team.id)
          pool.push(team)
        }
      }
      pool.sort((a, b) => a.code.localeCompare(b.code))
      setTeams(pool)
    }

    setLoading(false)
  }, [slug])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  // Count how many times each team is currently selected (to flag duplicates).
  const usage = new Map<string, number>()
  for (const p of Object.values(picks)) {
    for (const id of [p.home, p.away]) {
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1)
    }
  }
  const duplicateIds = new Set([...usage.entries()].filter(([, n]) => n > 1).map(([id]) => id))
  const totalSelected = Object.values(picks).reduce(
    (n, p) => n + (p.home ? 1 : 0) + (p.away ? 1 : 0),
    0
  )

  function setPick(matchId: string, side: 'home' | 'away', teamId: string) {
    setPicks((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [side]: teamId } }))
    setSuccess('')
  }

  async function handleAutoFill() {
    setActionLoading('auto')
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto' }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Auto-fill failed')
      else {
        setSuccess(`Auto-filled ${data.r32_slots_filled} slots from group results.`)
        await load()
      }
    } catch {
      setError('Auto-fill request failed')
    }
    setActionLoading(null)
  }

  async function handleSave() {
    if (duplicateIds.size > 0) {
      setError('Each team can only be placed in one slot. Resolve the highlighted duplicates first.')
      return
    }
    setActionLoading('save')
    setError('')
    setSuccess('')
    try {
      const assignments = matches.map((m) => ({
        match_id: m.id,
        home_team_id: picks[m.id]?.home || null,
        away_team_id: picks[m.id]?.away || null,
      }))
      const res = await fetch(`/api/admin/tournaments/${slug}/bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'manual', assignments }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Save failed')
      else {
        setSuccess(`Saved — ${data.matches_updated} matches updated.`)
        await load()
      }
    } catch {
      setError('Save request failed')
    }
    setActionLoading(null)
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading bracket…</p>
  if (matches.length === 0)
    return (
      <p className="py-12 text-center text-red-accent">
        {error || 'No Round of 32 matches found — run tournament setup first.'}
      </p>
    )

  function teamSelect(matchId: string, side: 'home' | 'away', source: string | null) {
    const value = picks[matchId]?.[side] ?? ''
    const isDupe = value !== '' && duplicateIds.has(value)
    return (
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 font-mono text-[11px] text-text-muted">{source ?? '—'}</span>
        <select
          value={value}
          onChange={(e) => setPick(matchId, side, e.target.value)}
          className={`min-w-0 flex-1 rounded-md border bg-surface-light px-2 py-1.5 text-sm text-foreground ${
            isDupe ? 'border-red-accent ring-1 ring-red-accent' : 'border-border-custom'
          }`}
        >
          <option value="">— pick team —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Bracket Setup: {tournamentName}</h1>
          <p className="mt-1 text-sm text-text-muted">
            Place each qualifying team into its Round of 32 slot. Later rounds fill automatically from
            the winners.
          </p>
        </div>
        <a
          href={`/admin/tournaments/${slug}/testing`}
          className="rounded-md bg-surface-light px-4 py-2 text-sm font-medium text-text-secondary hover:bg-border-custom"
        >
          Testing
        </a>
      </div>

      {error && <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">{error}</div>}
      {success && <div className="rounded-md bg-green-accent/10 p-3 text-sm text-green-accent">{success}</div>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-text-secondary">
            {totalSelected} / {matches.length * 2} slots filled
            {duplicateIds.size > 0 && (
              <span className="ml-2 font-medium text-red-accent">· {duplicateIds.size} duplicate team(s)</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAutoFill}
              loading={actionLoading === 'auto'}
              disabled={!!actionLoading}
            >
              Auto-fill from group results
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              loading={actionLoading === 'save'}
              disabled={!!actionLoading}
            >
              Save bracket
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {matches.map((m) => (
          <Card key={m.id}>
            <div className="mb-2 text-xs font-semibold text-gold">Round of 32 · Match #{m.match_number}</div>
            <div className="space-y-2">
              {teamSelect(m.id, 'home', m.home_source)}
              <div className="pl-16 text-[11px] text-text-muted">vs</div>
              {teamSelect(m.id, 'away', m.away_source)}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={actionLoading === 'save'} disabled={!!actionLoading}>
          Save bracket
        </Button>
      </div>
    </div>
  )
}
