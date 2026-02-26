'use client'

import { cn } from '@/lib/utils'
import type { KnockoutMatchWithTeams, KnockoutPrediction } from '@/lib/types'
import { BracketTeam } from './BracketTeam'

interface BracketMatchProps {
  match: KnockoutMatchWithTeams
  prediction?: KnockoutPrediction
  onSelectWinner?: (matchId: string, teamId: string) => void
  readonly?: boolean
}

export function BracketMatch({ match, prediction, onSelectWinner, readonly }: BracketMatchProps) {
  const actualWinner = match.winner_team_id
  const predictedWinner = prediction?.predicted_winner_id

  function getTeamCorrectness(teamId: string | null): boolean | null {
    if (!teamId || !predictedWinner) return null
    if (!actualWinner) return null // no result yet
    if (predictedWinner === teamId) {
      return predictedWinner === actualWinner // true if correct, false if wrong
    }
    return null
  }

  function getHomeCorrectness(): boolean | null {
    return match.home_team_id ? getTeamCorrectness(match.home_team_id) : null
  }

  function getAwayCorrectness(): boolean | null {
    return match.away_team_id ? getTeamCorrectness(match.away_team_id) : null
  }

  const canInteract = !readonly && !actualWinner && match.home_team && match.away_team
  const isDecided = !!actualWinner

  return (
    <div className="flex w-36 flex-col gap-0.5 rounded-xl border border-border-custom bg-surface p-1 sm:w-40">
      <div className="mb-0.5 text-center text-[10px] text-text-muted">
        {match.round.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} #{match.match_number}
      </div>
      <BracketTeam
        team={match.home_team}
        score={match.home_score}
        selected={predictedWinner === match.home_team_id}
        correct={getHomeCorrectness()}
        isWinner={isDecided && actualWinner === match.home_team_id}
        isLoser={isDecided && !!match.home_team_id && actualWinner !== match.home_team_id}
        clickable={!!canInteract}
        onClick={() => match.home_team_id && onSelectWinner?.(match.id, match.home_team_id)}
      />
      <BracketTeam
        team={match.away_team}
        score={match.away_score}
        selected={predictedWinner === match.away_team_id}
        correct={getAwayCorrectness()}
        isWinner={isDecided && actualWinner === match.away_team_id}
        isLoser={isDecided && !!match.away_team_id && actualWinner !== match.away_team_id}
        clickable={!!canInteract}
        onClick={() => match.away_team_id && onSelectWinner?.(match.id, match.away_team_id)}
      />
    </div>
  )
}
