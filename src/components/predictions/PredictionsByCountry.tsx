'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import type { PredictionSummary, GroupWithTeams, Player, Team } from '@/lib/types'

interface PredictionsByCountryProps {
  predictions: PredictionSummary[]
  groups: GroupWithTeams[]
}

type Bucket = '1st' | '2nd' | '3rd' | 'notQualifying'

const COLUMNS: { key: Bucket; label: string; accent: string; bg: string }[] = [
  { key: '1st', label: '1st', accent: 'text-green-accent', bg: 'bg-green-accent/10' },
  { key: '2nd', label: '2nd', accent: 'text-yellow-accent', bg: 'bg-yellow-accent/10' },
  { key: '3rd', label: '3rd', accent: 'text-yellow-accent', bg: 'bg-yellow-accent/10' },
  { key: 'notQualifying', label: 'Not Qualifying', accent: 'text-red-accent', bg: 'bg-red-accent/10' },
]

function playerName(p: Player): string {
  return p.nickname ?? p.display_name ?? 'Unknown'
}

export function PredictionsByCountry({ predictions, groups }: PredictionsByCountryProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')

  // All teams across all groups, sorted alphabetically for the dropdown.
  const teams = useMemo(() => {
    const map = new Map<string, Team>()
    for (const g of groups) {
      for (const gt of g.group_teams) {
        if (gt.team) map.set(gt.team.id, gt.team)
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [groups])

  // Which group each team belongs to.
  const teamGroupId = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of groups) {
      for (const gt of g.group_teams) {
        if (gt.team) map.set(gt.team.id, g.id)
      }
    }
    return map
  }, [groups])

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? null

  // Bucket every player by where they predicted the selected team to finish.
  const buckets = useMemo(() => {
    const result: Record<Bucket, Player[]> = {
      '1st': [],
      '2nd': [],
      '3rd': [],
      notQualifying: [],
    }
    if (!selectedTeamId) return result

    const groupId = teamGroupId.get(selectedTeamId)
    if (!groupId) return result

    for (const summary of predictions) {
      const gp = summary.group_predictions.find((p) => p.group_id === groupId)
      let bucket: Bucket
      if (gp?.predicted_1st === selectedTeamId) bucket = '1st'
      else if (gp?.predicted_2nd === selectedTeamId) bucket = '2nd'
      else if (gp?.predicted_3rd === selectedTeamId) bucket = '3rd'
      else bucket = 'notQualifying'
      result[bucket].push(summary.player)
    }

    for (const key of Object.keys(result) as Bucket[]) {
      result[key].sort((a, b) => playerName(a).localeCompare(playerName(b)))
    }
    return result
  }, [predictions, selectedTeamId, teamGroupId])

  return (
    <div className="rounded-xl border border-border-custom">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <h2 className="font-heading text-lg font-bold text-foreground">Predictions by Country</h2>
        <svg
          className={cn('h-5 w-5 text-text-muted transition-transform', isOpen && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-border-custom px-4 pb-4 pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="country-select" className="text-sm text-text-secondary">
              Select a country to see how players ranked them in their group:
            </label>
            <select
              id="country-select"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded-lg border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground focus:border-border-light focus:outline-none"
            >
              <option value="">— Choose a country ({teams.length}) —</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.flag_emoji ? `${team.flag_emoji} ` : ''}
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {!selectedTeam && (
            <p className="text-sm text-text-muted">
              Pick a country from the dropdown above to populate the table.
            </p>
          )}

          {selectedTeam && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {COLUMNS.map((col) => {
                const players = buckets[col.key]
                return (
                  <div
                    key={col.key}
                    className="overflow-hidden rounded-lg border border-border-custom bg-surface"
                  >
                    <div
                      className={cn(
                        'flex items-center justify-between px-3 py-2',
                        col.bg
                      )}
                    >
                      <span className={cn('font-heading text-sm font-bold', col.accent)}>
                        {col.label}
                      </span>
                      <span className={cn('text-sm font-bold', col.accent)}>{players.length}</span>
                    </div>
                    <ul className="divide-y divide-border-custom">
                      {players.length === 0 && (
                        <li className="px-3 py-2 text-xs text-text-muted">No players</li>
                      )}
                      {players.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                          <PlayerAvatar
                            avatarUrl={p.avatar_url ?? null}
                            displayName={p.display_name ?? 'Unknown'}
                            size="sm"
                          />
                          <span className="truncate text-xs text-foreground">{playerName(p)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
