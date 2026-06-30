'use client'

import type { KnockoutMatchWithTeams, KnockoutPrediction } from '@/lib/types'
import { roundIndexOf } from '@/lib/bracket'
import { BracketTeam } from './BracketTeam'

interface BracketMatchProps {
  match: KnockoutMatchWithTeams
  prediction?: KnockoutPrediction
  onSelectWinner?: (matchId: string, teamId: string) => void
  readonly?: boolean
  /**
   * Locked "review my picks" mode: the card shows the player's PREDICTED matchup
   * (which can differ from the real one), so we don't grey teams by the actual
   * result. Instead we colour the player's pick correct/wrong and add a footer
   * naming the actual winner of the slot for comparison.
   */
  reviewMode?: boolean
  goldenTicketUsed?: boolean
  fullNames?: boolean
  /**
   * Real elimination round-depth per team id (from getEliminationRoundByTeam).
   * A predicted team shown in a round LATER than its real exit is greyed out and
   * struck through — it can't actually be there.
   */
  eliminationRoundByTeam?: Map<string, number>
}

export function BracketMatch({ match, prediction, onSelectWinner, readonly, reviewMode, goldenTicketUsed, fullNames, eliminationRoundByTeam }: BracketMatchProps) {
  const actualWinner = match.winner_team_id
  const predictedWinner = prediction?.predicted_winner_id

  // A team is "dead here" when it was really eliminated in an EARLIER round than
  // the one this card represents — i.e. it appears later in the player's bracket
  // than it could possibly survive. (Not flagged in its own exit round, where the
  // ✓/✗ correctness colour already tells the story.)
  const thisRoundDepth = roundIndexOf(match.round)
  function isEliminatedHere(teamId: string | null): boolean {
    if (!teamId || !eliminationRoundByTeam) return false
    const exitDepth = eliminationRoundByTeam.get(teamId)
    return exitDepth != null && thisRoundDepth > exitDepth
  }

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
  // In review mode the displayed teams are the player's predicted matchup, which
  // may differ from reality — so don't mark a "winner/loser" against the actual
  // result (that's conveyed by the per-pick colour + the footer instead), and
  // don't show the actual scoreline next to the wrong teams.
  const showResultHighlight = isDecided && !reviewMode
  const pickedCorrectly = !!predictedWinner && predictedWinner === actualWinner
  const actualWinnerTeam = match.winner_team

  return (
    <div className={`flex flex-col gap-0.5 rounded-xl border border-border-custom bg-surface p-1 ${fullNames ? 'w-52 sm:w-56' : 'w-36 sm:w-40'}`}>
      <div className="mb-0.5 text-center text-[10px] text-text-muted">
        {goldenTicketUsed && <span title="Emergency Sub used on this match">🔄 </span>}
        {match.round.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} #{match.match_number}
      </div>
      <BracketTeam
        team={match.home_team}
        score={reviewMode ? null : match.home_score}
        selected={predictedWinner === match.home_team_id}
        correct={getHomeCorrectness()}
        isWinner={showResultHighlight && actualWinner === match.home_team_id}
        isLoser={showResultHighlight && !!match.home_team_id && actualWinner !== match.home_team_id}
        isEliminated={isEliminatedHere(match.home_team_id)}
        clickable={!!canInteract}
        fullName={fullNames}
        onClick={() => match.home_team_id && onSelectWinner?.(match.id, match.home_team_id)}
      />
      <BracketTeam
        team={match.away_team}
        score={reviewMode ? null : match.away_score}
        selected={predictedWinner === match.away_team_id}
        correct={getAwayCorrectness()}
        isWinner={showResultHighlight && actualWinner === match.away_team_id}
        isLoser={showResultHighlight && !!match.away_team_id && actualWinner !== match.away_team_id}
        isEliminated={isEliminatedHere(match.away_team_id)}
        clickable={!!canInteract}
        fullName={fullNames}
        onClick={() => match.away_team_id && onSelectWinner?.(match.id, match.away_team_id)}
      />
      {/* Review footer: who actually won this slot, vs the player's pick. */}
      {reviewMode && isDecided && (
        <div className="mt-0.5 flex items-center justify-center gap-1 border-t border-border-custom pt-0.5 text-[9px]">
          <span className="text-text-muted">Actual:</span>
          <span className="font-medium text-foreground">
            {actualWinnerTeam ? (fullNames ? actualWinnerTeam.name : actualWinnerTeam.code) : '?'}
          </span>
          {match.home_score !== null && match.away_score !== null && (
            <span className="text-text-muted">({match.home_score}-{match.away_score})</span>
          )}
          {predictedWinner && (
            pickedCorrectly
              ? <span className="font-bold text-green-accent" title="Your pick was correct">✓</span>
              : <span className="font-bold text-red-accent" title="Your pick was wrong">✗</span>
          )}
        </div>
      )}
    </div>
  )
}
