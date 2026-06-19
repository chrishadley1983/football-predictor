'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import { resolveParticipantIds, predictionsToRecord } from '@/lib/bracket'
import type { PredictionSummary, KnockoutMatch, Player, Team } from '@/lib/types'

interface Props {
  predictions: PredictionSummary[]
  knockoutMatches: KnockoutMatch[]
  teams: Team[]
}

type Finish = 'winner' | 'finalist' | 'semi' | 'quarter' | 'r16' | 'r32'

const COLUMNS: { key: Finish; label: string; accent: string; bg: string }[] = [
  { key: 'winner', label: 'Winner', accent: 'text-gold', bg: 'bg-gold/10' },
  { key: 'finalist', label: 'Beaten Finalist', accent: 'text-green-accent', bg: 'bg-green-accent/10' },
  { key: 'semi', label: 'Beaten Semi-Finalist', accent: 'text-green-accent', bg: 'bg-green-accent/10' },
  { key: 'quarter', label: 'Beaten Quarter-Finalist', accent: 'text-yellow-accent', bg: 'bg-yellow-accent/10' },
  { key: 'r16', label: 'Beaten in Round of 16', accent: 'text-yellow-accent', bg: 'bg-yellow-accent/10' },
  { key: 'r32', label: 'Beaten in Round of 32', accent: 'text-red-accent', bg: 'bg-red-accent/10' },
]

const ROUND_ORDER = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final']
// Deepest round a player predicted a country to WIN -> that country's finish.
const FINISH_BY_DEEPEST_WIN: Finish[] = ['r16', 'quarter', 'semi', 'finalist', 'winner']

function playerName(p: Player): string {
  return p.nickname ?? p.display_name ?? 'Unknown'
}

export function PredictionsByCountryKnockout({ predictions, knockoutMatches, teams }: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')

  // Resolve each later round from the player's OWN picks (not actual results):
  // keep the real Round-of-32 slots, but null the downstream team ids so they
  // flow from the player's predicted winners.
  const bracketMatches = useMemo(
    () =>
      knockoutMatches.map((m) =>
        m.round === 'round_of_32' ? m : { ...m, home_team_id: null, away_team_id: null }
      ),
    [knockoutMatches]
  )

  // The 32 teams actually placed into the Round of 32 (the qualifiers).
  const r32TeamIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of knockoutMatches) {
      if (m.round !== 'round_of_32') continue
      if (m.home_team_id) ids.add(m.home_team_id)
      if (m.away_team_id) ids.add(m.away_team_id)
    }
    return ids
  }, [knockoutMatches])

  const dropdownTeams = useMemo(
    () => teams.filter((t) => r32TeamIds.has(t.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [teams, r32TeamIds]
  )

  // Per player: the deepest round index they predicted each team to win.
  const deepestWinByPlayer = useMemo(() => {
    return predictions.map((summary) => {
      const rec = predictionsToRecord(
        summary.knockout_predictions.map((kp) => ({
          match_id: kp.match_id,
          predicted_winner_id: kp.predicted_winner_id,
        }))
      )
      const { validWinners } = resolveParticipantIds(bracketMatches, rec)
      const deepest = new Map<string, number>()
      for (const m of bracketMatches) {
        const w = validWinners.get(m.id)
        if (!w) continue
        const idx = ROUND_ORDER.indexOf(m.round)
        deepest.set(w, Math.max(deepest.get(w) ?? -1, idx))
      }
      return { player: summary.player, hasBracket: summary.knockout_predictions.length > 0, deepest }
    })
  }, [predictions, bracketMatches])

  const selectedTeam = dropdownTeams.find((t) => t.id === selectedTeamId) ?? null

  const buckets = useMemo(() => {
    const result: Record<Finish, Player[]> = { winner: [], finalist: [], semi: [], quarter: [], r16: [], r32: [] }
    if (!selectedTeamId) return result
    for (const entry of deepestWinByPlayer) {
      if (!entry.hasBracket) continue
      const d = entry.deepest.get(selectedTeamId)
      const finish: Finish = d === undefined ? 'r32' : FINISH_BY_DEEPEST_WIN[d]
      result[finish].push(entry.player)
    }
    for (const key of Object.keys(result) as Finish[]) {
      result[key].sort((a, b) => playerName(a).localeCompare(playerName(b)))
    }
    return result
  }, [deepestWinByPlayer, selectedTeamId])

  return (
    <div className="rounded-xl border border-border-custom">
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
            <label htmlFor="ko-country-select" className="text-sm text-text-secondary">
              Select a country to see how far players predicted them to go:
            </label>
            <select
              id="ko-country-select"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="rounded-lg border border-border-custom bg-surface-light px-3 py-2 text-sm text-foreground focus:border-border-light focus:outline-none"
            >
              <option value="">— Choose a country ({dropdownTeams.length}) —</option>
              {dropdownTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.flag_emoji ? `${team.flag_emoji} ` : ''}
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          {!selectedTeam && (
            <p className="text-sm text-text-muted">
              Pick a country from the dropdown above to see who predicted them as Winner, beaten
              finalist, and so on.
            </p>
          )}

          {selectedTeam && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COLUMNS.map((col) => {
                const players = buckets[col.key]
                return (
                  <div key={col.key} className="overflow-hidden rounded-lg border border-border-custom bg-surface">
                    <div className={cn('flex items-center justify-between px-3 py-2', col.bg)}>
                      <span className={cn('font-heading text-sm font-bold', col.accent)}>{col.label}</span>
                      <span className={cn('text-sm font-bold', col.accent)}>{players.length}</span>
                    </div>
                    <ul className="divide-y divide-border-custom">
                      {players.length === 0 && (
                        <li className="px-3 py-2 text-xs text-text-muted">No players</li>
                      )}
                      {players.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 px-3 py-1.5">
                          <PlayerAvatar avatarUrl={p.avatar_url ?? null} displayName={p.display_name ?? 'Unknown'} size="sm" />
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
