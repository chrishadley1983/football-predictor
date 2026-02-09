'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Tournament, GroupWithTeams, KnockoutMatchWithTeams } from '@/lib/types'

interface TournamentData extends Tournament {
  groups: GroupWithTeams[]
  knockout_matches: KnockoutMatchWithTeams[]
}

// Draft state types
interface DraftTeam {
  name: string
  code: string
  flag_emoji: string
}

interface DraftMatch {
  home: string
  away: string
  date: string
  time: string
  venue: string
}

interface DraftGroup {
  name: string
  teams: DraftTeam[]
  matches: DraftMatch[]
}

interface DraftKnockoutMatch {
  round: string
  matchNumber: number
  date: string
  time: string
  venue: string
}

interface DraftSetup {
  groupCount: number
  teamsPerGroup: number
  groups: DraftGroup[]
  knockoutDates: DraftKnockoutMatch[]
}

function buildKnockoutConfig(groupCount: number) {
  if (groupCount === 12) {
    return [
      { round: 'round_of_32', points_value: 1, match_count: 16 },
      { round: 'round_of_16', points_value: 2, match_count: 8 },
      { round: 'quarter_final', points_value: 4, match_count: 4 },
      { round: 'semi_final', points_value: 8, match_count: 2 },
      { round: 'final', points_value: 16, match_count: 1 },
    ]
  }
  if (groupCount === 8) {
    return [
      { round: 'round_of_16', points_value: 2, match_count: 8 },
      { round: 'quarter_final', points_value: 4, match_count: 4 },
      { round: 'semi_final', points_value: 8, match_count: 2 },
      { round: 'final', points_value: 16, match_count: 1 },
    ]
  }
  // 6 groups or other
  return [
    { round: 'round_of_16', points_value: 2, match_count: 8 },
    { round: 'quarter_final', points_value: 4, match_count: 4 },
    { round: 'semi_final', points_value: 8, match_count: 2 },
    { round: 'final', points_value: 16, match_count: 1 },
  ]
}

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export default function SetupPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [tournament, setTournament] = useState<TournamentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [seedLoading, setSeedLoading] = useState(false)
  const [publishLoading, setPublishLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Draft state
  const [draft, setDraft] = useState<DraftSetup | null>(null)
  const [importUrl, setImportUrl] = useState('')

  // Structure config
  const [groupCountSelect, setGroupCountSelect] = useState(12)
  const [teamsPerGroupSelect, setTeamsPerGroupSelect] = useState(4)

  // Admin auth check
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.role !== 'admin') {
        router.replace('/')
      }
    })
  }, [router])

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
      const tournamentRes = await fetch(`/api/tournaments/${data.tournament.slug}`)
      if (tournamentRes.ok) {
        const tournamentData = await tournamentRes.json()
        setTournament(tournamentData)
      }
    }
    setSeedLoading(false)
  }

  function handleInitializeGroups() {
    const groups: DraftGroup[] = []
    for (let i = 0; i < groupCountSelect; i++) {
      const teams: DraftTeam[] = []
      for (let j = 0; j < teamsPerGroupSelect; j++) {
        teams.push({ name: '', code: '', flag_emoji: '' })
      }
      groups.push({
        name: `Group ${GROUP_LETTERS[i]}`,
        teams,
        matches: [],
      })
    }
    setDraft({
      groupCount: groupCountSelect,
      teamsPerGroup: teamsPerGroupSelect,
      groups,
      knockoutDates: [],
    })
    setError('')
    setSuccess('')
  }

  function handleEditExisting() {
    if (!tournament || tournament.groups.length === 0) return
    const groups: DraftGroup[] = tournament.groups.map((g) => ({
      name: g.name,
      teams: g.group_teams.map((gt) => ({
        name: gt.team.name,
        code: gt.team.code,
        flag_emoji: gt.team.flag_emoji || '',
      })),
      matches: [],
    }))
    const teamsPerGroup = Math.max(...groups.map((g) => g.teams.length), 0)
    setDraft({
      groupCount: groups.length,
      teamsPerGroup,
      groups,
      knockoutDates: [],
    })
    setError('')
    setSuccess('')
  }

  async function handleImportUrl() {
    if (!importUrl.trim()) return
    setImportLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/import-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Import failed')
      } else {
        const groups: DraftGroup[] = data.groups.map(
          (g: { name: string; teams: DraftTeam[]; matches?: DraftMatch[] }) => ({
            name: g.name,
            teams: g.teams.map((t: DraftTeam) => ({
              name: t.name,
              code: t.code,
              flag_emoji: t.flag_emoji || '',
            })),
            matches: g.matches || [],
          })
        )

        setDraft({
          groupCount: data.groupCount,
          teamsPerGroup: data.teamsPerGroup,
          groups,
          knockoutDates: data.knockoutDates || [],
        })
        setSuccess(`Imported ${data.groupCount} groups with up to ${data.teamsPerGroup} teams each`)
      }
    } catch {
      setError('Failed to import from URL')
    }

    setImportLoading(false)
  }

  function updateTeam(groupIndex: number, teamIndex: number, field: keyof DraftTeam, value: string) {
    if (!draft) return
    setDraft({
      ...draft,
      groups: draft.groups.map((g, gi) =>
        gi === groupIndex
          ? {
              ...g,
              teams: g.teams.map((t, ti) =>
                ti === teamIndex ? { ...t, [field]: value } : t
              ),
            }
          : g
      ),
    })
  }

  function removeTeam(groupIndex: number, teamIndex: number) {
    if (!draft) return
    setDraft({
      ...draft,
      groups: draft.groups.map((g, gi) =>
        gi === groupIndex
          ? { ...g, teams: g.teams.filter((_, ti) => ti !== teamIndex) }
          : g
      ),
    })
  }

  function addTeam(groupIndex: number) {
    if (!draft) return
    setDraft({
      ...draft,
      groups: draft.groups.map((g, gi) =>
        gi === groupIndex
          ? { ...g, teams: [...g.teams, { name: '', code: '', flag_emoji: '' }] }
          : g
      ),
    })
  }

  function validateDraft(): string | null {
    if (!draft) return 'No draft to validate'

    const allCodes: string[] = []
    for (const group of draft.groups) {
      if (group.teams.length === 0) {
        return `${group.name} has no teams`
      }
      for (const team of group.teams) {
        if (!team.name.trim()) {
          return `All teams must have a name (check ${group.name})`
        }
        if (!team.code.trim()) {
          return `All teams must have a code (check ${group.name}: ${team.name})`
        }
        const code = team.code.trim().toUpperCase()
        if (allCodes.includes(code)) {
          return `Duplicate team code: ${code}`
        }
        allCodes.push(code)
      }
    }

    return null
  }

  async function handlePublish() {
    if (!draft) return

    const validationError = validateDraft()
    if (validationError) {
      setError(validationError)
      return
    }

    setPublishLoading(true)
    setError('')
    setSuccess('')

    // Auto-uppercase codes
    const groups = draft.groups.map((g) => ({
      name: g.name,
      teams: g.teams.map((t) => ({
        name: t.name.trim(),
        code: t.code.trim().toUpperCase(),
        flag_emoji: t.flag_emoji.trim(),
      })),
      matches: g.matches.map((m) => ({
        home: m.home,
        away: m.away,
        scheduled_at: m.date && m.time
          ? new Date(`${m.date}T${m.time}:00Z`).toISOString()
          : m.date
            ? new Date(`${m.date}T00:00:00Z`).toISOString()
            : undefined,
        venue: m.venue || undefined,
      })),
    }))

    const knockout_config = buildKnockoutConfig(draft.groupCount)

    const knockout_dates = draft.knockoutDates.map((kd) => ({
      match_number: kd.matchNumber,
      scheduled_at: kd.date && kd.time
        ? new Date(`${kd.date}T${kd.time}:00Z`).toISOString()
        : kd.date
          ? new Date(`${kd.date}T00:00:00Z`).toISOString()
          : undefined,
      venue: kd.venue || undefined,
    }))

    try {
      const res = await fetch(`/api/admin/tournaments/${slug}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups, knockout_config, knockout_dates }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Setup failed')
      } else {
        setSuccess(
          `Published: ${data.counts.groups} groups, ${data.counts.teams} teams, ${data.counts.knockout_matches} knockout matches`
        )
        setDraft(null)
        await loadTournament()
      }
    } catch {
      setError('Failed to publish setup')
    }

    setPublishLoading(false)
  }

  if (loading) return <p className="py-12 text-center text-text-muted">Loading...</p>
  if (!tournament) return <p className="py-12 text-center text-red-accent">{error || 'Tournament not found'}</p>

  const groupCount = tournament.groups?.length ?? 0
  const teamCount = tournament.groups?.reduce((sum, g) => sum + g.group_teams.length, 0) ?? 0
  const matchCount = tournament.knockout_matches?.length ?? 0

  const roundOrder = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final']
  const roundLabels: Record<string, string> = {
    round_of_32: 'Round of 32',
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

  const totalDraftTeams = draft?.groups.reduce((sum, g) => sum + g.teams.length, 0) ?? 0
  const filledDraftTeams = draft?.groups.reduce(
    (sum, g) => sum + g.teams.filter((t) => t.name.trim() && t.code.trim()).length,
    0
  ) ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Setup: {tournament.name}
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            <Link href={`/admin/tournaments/${slug}/manage`} className="text-gold hover:underline">
              Back to Manage
            </Link>
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-accent/10 p-3 text-sm text-green-accent">
          {success}
        </div>
      )}

      {/* URL Import Card */}
      <Card header={<h2 className="font-semibold text-foreground">Import from URL</h2>}>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-text-muted">
              Paste a Wikipedia tournament page URL (e.g. 2026 FIFA World Cup)
            </label>
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://en.wikipedia.org/wiki/2026_FIFA_World_Cup"
              className="w-full rounded-md border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
            />
          </div>
          <Button
            onClick={handleImportUrl}
            loading={importLoading}
            variant="secondary"
            disabled={!importUrl.trim()}
          >
            Import from URL
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          Parses group tables from static HTML pages. Works best with Wikipedia. Imported data populates a draft for review before publishing.
        </p>
      </Card>

      {/* Structure Config Card - shown when no draft exists */}
      {!draft && (
        <Card header={<h2 className="font-semibold text-foreground">Structure Config</h2>}>
          <div className="flex items-end gap-4">
            <div>
              <label className="mb-1 block text-xs text-text-muted">Number of groups</label>
              <select
                value={groupCountSelect}
                onChange={(e) => setGroupCountSelect(Number(e.target.value))}
                className="rounded-md border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              >
                {[4, 6, 8, 12, 16].map((n) => (
                  <option key={n} value={n}>
                    {n} groups
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">Teams per group</label>
              <select
                value={teamsPerGroupSelect}
                onChange={(e) => setTeamsPerGroupSelect(Number(e.target.value))}
                className="rounded-md border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
              >
                {[3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} teams
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={handleInitializeGroups} variant="primary">
              Initialize Groups
            </Button>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Creates {groupCountSelect} empty groups with {teamsPerGroupSelect} blank team slots each ({groupCountSelect * teamsPerGroupSelect} teams total).
          </p>
        </Card>
      )}

      {/* Draft Group Editor */}
      {draft && (
        <Card
          header={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-foreground">Draft Editor</h2>
                <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium text-gold">
                  DRAFT
                </span>
                <span className="text-xs text-text-muted">
                  {filledDraftTeams}/{totalDraftTeams} teams filled
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => {
                    setDraft(null)
                    setError('')
                    setSuccess('')
                  }}
                  variant="ghost"
                  size="sm"
                >
                  Discard Draft
                </Button>
                <Button onClick={handlePublish} loading={publishLoading} variant="primary" size="sm">
                  Publish
                </Button>
              </div>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {draft.groups.map((group, gi) => (
              <div
                key={gi}
                className="rounded-md border border-border-custom bg-surface-light/50 p-3"
              >
                <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                  {group.name}
                </h3>
                <div className="space-y-1.5">
                  {group.teams.map((team, ti) => (
                    <div key={ti} className="flex items-center gap-1">
                      <input
                        type="text"
                        value={team.flag_emoji}
                        onChange={(e) => updateTeam(gi, ti, 'flag_emoji', e.target.value)}
                        placeholder="Flag"
                        className="w-12 rounded border border-border-custom bg-surface px-1.5 py-1 text-center text-sm text-foreground placeholder:text-text-muted/50 focus:border-gold focus:outline-none"
                      />
                      <input
                        type="text"
                        value={team.name}
                        onChange={(e) => updateTeam(gi, ti, 'name', e.target.value)}
                        placeholder="Team name"
                        className="min-w-0 flex-1 rounded border border-border-custom bg-surface px-2 py-1 text-sm text-foreground placeholder:text-text-muted/50 focus:border-gold focus:outline-none"
                      />
                      <input
                        type="text"
                        value={team.code}
                        onChange={(e) => updateTeam(gi, ti, 'code', e.target.value.toUpperCase())}
                        placeholder="COD"
                        maxLength={3}
                        className="w-14 rounded border border-border-custom bg-surface px-1.5 py-1 text-center text-sm uppercase text-foreground placeholder:text-text-muted/50 focus:border-gold focus:outline-none"
                      />
                      <button
                        onClick={() => removeTeam(gi, ti)}
                        className="rounded p-1 text-text-muted hover:bg-red-accent/10 hover:text-red-accent"
                        title="Remove team"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addTeam(gi)}
                  className="mt-2 text-xs text-gold hover:underline"
                >
                  + Add Team
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Setup - only when no draft */}
      {!draft && (
        <Card header={<h2 className="font-semibold text-foreground">Quick Setup</h2>}>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button onClick={handleSeedWC2022} loading={seedLoading} variant="primary">
                Seed WC 2022 Data
              </Button>
              <span className="text-xs text-text-muted">Creates a test tournament with all 32 teams and bracket</span>
            </div>
            <div className="rounded-md bg-surface-light p-3">
              <h3 className="text-sm font-medium text-text-secondary">Current Status</h3>
              <div className="mt-2 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="font-heading text-2xl font-bold text-foreground">{groupCount}</div>
                  <div className="text-xs text-text-muted">Groups</div>
                </div>
                <div>
                  <div className="font-heading text-2xl font-bold text-foreground">{teamCount}</div>
                  <div className="text-xs text-text-muted">Teams</div>
                </div>
                <div>
                  <div className="font-heading text-2xl font-bold text-foreground">{matchCount}</div>
                  <div className="text-xs text-text-muted">Knockout Matches</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Groups Overview - only when no draft and groups exist */}
      {!draft && (
        <Card header={<h2 className="font-semibold text-foreground">Groups</h2>}>
          {groupCount === 0 ? (
            <p className="text-sm text-text-muted">No groups set up yet. Use the Structure Config or URL Import above.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {tournament.groups.map((group) => (
                  <div key={group.id} className="rounded-md border border-border-custom p-3">
                    <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                      {group.name}
                    </h3>
                    <div className="space-y-1">
                      {group.group_teams.map((gt) => (
                        <div key={gt.team.id} className="flex items-center gap-2 text-sm text-text-secondary">
                          <span>{gt.team.flag_emoji}</span>
                          <span>{gt.team.name}</span>
                          <span className="text-xs text-text-muted">({gt.team.code})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleEditExisting} variant="secondary" size="sm">
                  Edit in Draft
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Bracket Preview - only when no draft and matches exist */}
      {!draft && matchCount > 0 && (
        <Card header={<h2 className="font-semibold text-foreground">Bracket Preview</h2>}>
          <div className="space-y-4">
            {roundOrder
              .filter((round) => matchesByRound[round])
              .map((round) => (
                <div key={round}>
                  <h3 className="mb-2 text-sm font-semibold text-text-secondary">
                    {roundLabels[round] ?? round}
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      ({matchesByRound[round].length} matches)
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {matchesByRound[round]
                      .sort((a, b) => a.match_number - b.match_number)
                      .map((match) => (
                        <div
                          key={match.id}
                          className="flex items-center gap-2 rounded bg-surface-light p-2 text-sm"
                        >
                          <span className="w-6 text-xs text-text-muted">#{match.match_number}</span>
                          <span className="flex-1 text-foreground">
                            {match.home_team
                              ? `${match.home_team.flag_emoji ?? ''} ${match.home_team.code}`
                              : match.home_source ?? 'TBD'}
                          </span>
                          <span className="text-xs text-text-muted">vs</span>
                          <span className="flex-1 text-foreground">
                            {match.away_team
                              ? `${match.away_team.flag_emoji ?? ''} ${match.away_team.code}`
                              : match.away_source ?? 'TBD'}
                          </span>
                          {match.winner_team && (
                            <span className="text-xs font-medium text-green-accent">
                              W: {match.winner_team.code}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  )
}
