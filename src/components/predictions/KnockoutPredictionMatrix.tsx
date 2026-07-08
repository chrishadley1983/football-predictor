'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import type { EntryInfo } from '@/components/predictions/PredictionAnalyser'
import type {
  PredictionSummary,
  KnockoutMatch,
  KnockoutRound,
  GoldenTicket,
  Team,
} from '@/lib/types'

const ROUND_ORDER: KnockoutRound[] = [
  'round_of_32',
  'round_of_16',
  'quarter_final',
  'semi_final',
  'final',
]

const ROUND_NAMES: Record<string, string> = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  final: 'Final',
}

const ROUND_SHORT: Record<string, string> = {
  round_of_32: 'R32',
  round_of_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  final: '🏆 Final',
}

interface KnockoutPredictionMatrixProps {
  predictions: PredictionSummary[]
  knockoutMatches: KnockoutMatch[]
  teams: Team[]
  /** Emergency Subs played, so their picks are marked (🔄) rather than greyed. */
  goldenTickets?: GoldenTicket[]
  /**
   * Per-entry score data. When supplied, the grid gains an overall Total column
   * (group + knockout points) and defaults to sorting by it, so its order mirrors
   * the leaderboard. Omit it (e.g. in isolation tests) to fall back to sorting by
   * knockout points alone.
   */
  entries?: EntryInfo[]
}

type SortState = { col: string; dir: 'asc' | 'desc' } | null

/**
 * The all-players knockout predictions grid, oriented with MATCHES across the
 * x-axis and PLAYERS down the y-axis (the inverse of the group-stage grid). Each
 * match column can be sorted to cluster players by who they picked, and any
 * COMPLETED round can be collapsed to a single per-player points total
 * (expandable). Built for ~54 players × ~31 matches.
 */
export function KnockoutPredictionMatrix({
  predictions,
  knockoutMatches,
  teams,
  goldenTickets = [],
  entries = [],
}: KnockoutPredictionMatrixProps) {
  // Overall total (group + knockout) per entry, when score data is supplied.
  const overallByEntry = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) m.set(e.entry_id, e.total_points)
    return m
  }, [entries])
  const hasTotals = overallByEntry.size > 0
  const overallPoints = (entryId: string) => overallByEntry.get(entryId) ?? 0

  // The knockout Pts column stays sticky next to Player; the overall Total column
  // slots between them, so the knockout column shifts right only when it's shown.
  const koStickyLeft = hasTotals ? 'left-[164px]' : 'left-[112px]'
  const teamCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of teams) m.set(t.id, t.code)
    return m
  }, [teams])
  const code = (teamId: string | null | undefined) => (teamId ? teamCode.get(teamId) ?? '?' : '-')

  // Matches grouped by round, in tournament order, each sorted by sort_order.
  const rounds = useMemo(() => {
    const byRound = new Map<string, KnockoutMatch[]>()
    for (const m of knockoutMatches) {
      const arr = byRound.get(m.round) ?? []
      arr.push(m)
      byRound.set(m.round, arr)
    }
    for (const arr of byRound.values()) arr.sort((a, b) => a.sort_order - b.sort_order)
    return ROUND_ORDER.filter((r) => byRound.has(r)).map((r) => ({
      round: r,
      matches: byRound.get(r)!,
      complete: byRound.get(r)!.every((m) => m.winner_team_id != null),
    }))
  }, [knockoutMatches])

  // A completed round starts collapsed (just its points total); players can
  // expand it to see the per-match detail.
  const [collapsedRounds, setCollapsedRounds] = useState<Set<string>>(
    () => new Set(rounds.filter((r) => r.complete).map((r) => r.round))
  )
  function toggleRound(round: string) {
    setCollapsedRounds((prev) => {
      const next = new Set(prev)
      if (next.has(round)) next.delete(round)
      else next.add(round)
      return next
    })
  }

  const [sort, setSort] = useState<SortState>(null)
  function handleSort(col: string, preferDesc: boolean) {
    setSort((prev) => {
      if (prev?.col === col) return { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { col, dir: preferDesc ? 'desc' : 'asc' }
    })
  }
  function indicator(col: string) {
    if (sort?.col !== col) return <span className="text-text-faint"> ⇅</span>
    return <span className="text-gold">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>
  }

  // ---- Per-player lookups -------------------------------------------------
  const predByEntryMatch = useMemo(() => {
    const m = new Map<string, { predicted_winner_id: string | null; points_earned: number }>()
    for (const p of predictions) {
      for (const kp of p.knockout_predictions) {
        m.set(`${p.entry_id}:${kp.match_id}`, {
          predicted_winner_id: kp.predicted_winner_id,
          points_earned: kp.points_earned,
        })
      }
    }
    return m
  }, [predictions])
  const pickFor = (entryId: string, matchId: string) =>
    predByEntryMatch.get(`${entryId}:${matchId}`) ?? null

  const roundPoints = (entryId: string, round: string) =>
    rounds
      .find((r) => r.round === round)
      ?.matches.reduce((sum, m) => sum + (pickFor(entryId, m.id)?.points_earned ?? 0), 0) ?? 0

  const totalPoints = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of predictions) {
      m.set(p.entry_id, p.knockout_predictions.reduce((s, kp) => s + kp.points_earned, 0))
    }
    return m
  }, [predictions])

  // Teams eliminated before a given round, for "impossible pick" greying.
  const eliminatedBeforeRound = useMemo(() => {
    const elim = new Map<string, number>()
    for (const m of knockoutMatches) {
      if (!m.winner_team_id) continue
      const loserId = m.home_team_id === m.winner_team_id ? m.away_team_id : m.home_team_id
      if (!loserId) continue
      const idx = ROUND_ORDER.indexOf(m.round)
      const existing = elim.get(loserId)
      if (idx >= 0 && (existing === undefined || idx < existing)) elim.set(loserId, idx)
    }
    return elim
  }, [knockoutMatches])

  const subByEntry = useMemo(() => {
    const m = new Map<string, { newTeamId: string; fromRoundIdx: number }>()
    for (const t of goldenTickets) {
      m.set(t.entry_id, { newTeamId: t.new_team_id, fromRoundIdx: ROUND_ORDER.indexOf(t.played_after_round) })
    }
    return m
  }, [goldenTickets])
  function isSubPick(entryId: string, round: KnockoutRound, winnerId: string | null): boolean {
    const s = subByEntry.get(entryId)
    if (!s || !winnerId) return false
    return winnerId === s.newTeamId && ROUND_ORDER.indexOf(round) >= s.fromRoundIdx
  }
  function isImpossible(round: KnockoutRound, winnerId: string | null): boolean {
    if (!winnerId) return false
    const elimAt = eliminatedBeforeRound.get(winnerId)
    return elimAt !== undefined && elimAt < ROUND_ORDER.indexOf(round)
  }

  function cellColor(round: KnockoutRound, winnerId: string | null, actualWinner: string | null, impossible: boolean): string {
    if (impossible) return 'bg-gray-700/40 text-gray-500 line-through'
    if (!winnerId || !actualWinner) return 'bg-surface-light'
    return winnerId === actualWinner ? 'bg-green-accent/20 text-green-accent' : 'bg-red-accent/20 text-red-accent'
  }

  function pointsColor(pts: number): string {
    if (pts > 0) return 'bg-green-accent/15 text-green-accent font-semibold'
    if (pts < 0) return 'bg-red-accent/15 text-red-accent font-semibold'
    return 'bg-surface-light text-text-muted'
  }

  // ---- Sorting ------------------------------------------------------------
  // Plain computation — the React Compiler memoises it; a manual useMemo here
  // can't list the helper closures it depends on without tripping the compiler.
  const sortedPlayers = (() => {
    const list = [...predictions]
    const dir = sort?.dir === 'asc' ? 1 : -1
    const byName = (a: PredictionSummary, b: PredictionSummary) =>
      a.player.display_name.localeCompare(b.player.display_name)

    const ko = (p: PredictionSummary) => totalPoints.get(p.entry_id) ?? 0
    if (!sort) {
      // Default: overall standing (group + knockout) when we have score data —
      // so the grid mirrors the leaderboard — otherwise most knockout points first.
      if (hasTotals) {
        return list.sort(
          (a, b) => overallPoints(b.entry_id) - overallPoints(a.entry_id) || ko(b) - ko(a) || byName(a, b)
        )
      }
      return list.sort((a, b) => ko(b) - ko(a) || byName(a, b))
    }
    if (sort.col === 'overall') {
      return list.sort((a, b) => dir * (overallPoints(a.entry_id) - overallPoints(b.entry_id)) || byName(a, b))
    }
    if (sort.col === 'total') {
      return list.sort((a, b) => dir * (ko(a) - ko(b)) || byName(a, b))
    }
    if (sort.col.startsWith('round:')) {
      const round = sort.col.slice('round:'.length)
      return list.sort((a, b) => dir * (roundPoints(a.entry_id, round) - roundPoints(b.entry_id, round)) || byName(a, b))
    }
    if (sort.col.startsWith('match:')) {
      const matchId = sort.col.slice('match:'.length)
      // Cluster players by who they picked (alphabetical by team code).
      return list.sort((a, b) => {
        const ca = code(pickFor(a.entry_id, matchId)?.predicted_winner_id)
        const cb = code(pickFor(b.entry_id, matchId)?.predicted_winner_id)
        if (ca !== cb) return dir * ca.localeCompare(cb)
        return byName(a, b)
      })
    }
    return list
  })()

  if (predictions.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">No predictions available yet.</p>
  }

  // Flatten the visible match/round "leaf" columns for the second header row + body.
  type Leaf =
    | { kind: 'match'; round: KnockoutRound; match: KnockoutMatch; idx: number }
    | { kind: 'roundTotal'; round: KnockoutRound }
  const leaves: Leaf[] = []
  for (const r of rounds) {
    if (collapsedRounds.has(r.round)) {
      leaves.push({ kind: 'roundTotal', round: r.round })
    } else {
      r.matches.forEach((match, idx) => leaves.push({ kind: 'match', round: r.round, match, idx }))
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        {hasTotals && (
          <>
            <span className="text-foreground">Total</span> is overall points (group + knockout);{' '}
            <span className="text-foreground">KO</span> is knockout points only.{' '}
          </>
        )}
        Click a <span className="text-gold">match header</span> to cluster players by their pick. Click a{' '}
        <span className="text-gold">completed round header</span> to collapse it to points totals (or expand it again).
      </p>
      <div className="max-h-[75vh] overflow-auto rounded-xl border border-border-custom">
        <table className="w-max text-xs">
          <thead className="sticky top-0 z-20">
            {/* Round group header */}
            <tr className="bg-surface-light">
              <th
                className="sticky left-0 z-30 w-[112px] bg-surface-light px-2 py-1.5 text-left font-medium text-text-muted"
                rowSpan={2}
              >
                Player
              </th>
              {hasTotals && (
                <th
                  className="sticky left-[112px] z-30 w-[52px] cursor-pointer select-none bg-surface-light px-2 py-1.5 text-center font-medium text-text-muted"
                  rowSpan={2}
                  onClick={() => handleSort('overall', true)}
                  title="Sort by total points (group + knockout)"
                >
                  Total{indicator('overall')}
                </th>
              )}
              <th
                className={cn(
                  'sticky z-30 w-[48px] cursor-pointer select-none bg-surface-light px-2 py-1.5 text-center font-medium text-text-muted',
                  koStickyLeft
                )}
                rowSpan={2}
                onClick={() => handleSort('total', true)}
                title="Sort by total knockout points"
              >
                KO{indicator('total')}
              </th>
              {rounds.map((r) => {
                const collapsed = collapsedRounds.has(r.round)
                const span = collapsed ? 1 : r.matches.length
                return (
                  <th
                    key={r.round}
                    colSpan={span}
                    onClick={() => r.complete && toggleRound(r.round)}
                    className={cn(
                      'border-l border-border-custom px-2 py-1.5 text-center font-heading font-bold text-gold',
                      r.complete && 'cursor-pointer select-none hover:bg-surface'
                    )}
                    title={
                      r.complete
                        ? collapsed
                          ? `${ROUND_NAMES[r.round]} — click to expand`
                          : `${ROUND_NAMES[r.round]} — click to collapse to points`
                        : `${ROUND_NAMES[r.round]} — in progress`
                    }
                  >
                    {r.complete && <span className="mr-1 text-text-muted">{collapsed ? '▸' : '▾'}</span>}
                    {ROUND_SHORT[r.round] ?? r.round}
                  </th>
                )
              })}
            </tr>
            {/* Per-leaf header (match or collapsed-round-total) */}
            <tr className="bg-surface-light">
              {leaves.map((leaf) => {
                if (leaf.kind === 'roundTotal') {
                  const col = `round:${leaf.round}`
                  return (
                    <th
                      key={col}
                      onClick={() => handleSort(col, true)}
                      className="cursor-pointer select-none border-l border-border-custom px-2 py-1 text-center font-medium text-text-muted"
                      title="Sort by points in this round"
                    >
                      Pts{indicator(col)}
                    </th>
                  )
                }
                const { match, idx } = leaf
                const known = !!match.home_team_id && !!match.away_team_id
                const col = `match:${match.id}`
                return (
                  <th
                    key={col}
                    onClick={() => handleSort(col, false)}
                    className="cursor-pointer select-none border-l border-border-custom px-1.5 py-1 text-center font-mono text-[10px] text-text-secondary hover:bg-surface"
                    title={
                      known
                        ? `${code(match.home_team_id)} v ${code(match.away_team_id)} — click to sort by pick`
                        : `Match ${idx + 1} — click to sort by pick`
                    }
                  >
                    {known ? (
                      <div className="leading-tight">
                        <div>{code(match.home_team_id)}</div>
                        <div className="text-text-faint">{code(match.away_team_id)}</div>
                      </div>
                    ) : (
                      <div>#{idx + 1}</div>
                    )}
                    {indicator(col)}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-custom bg-surface">
            {sortedPlayers.map((p) => (
              <tr key={p.entry_id}>
                <td className="sticky left-0 z-10 w-[112px] bg-surface px-2 py-1 text-foreground">
                  <div className="flex items-center gap-1.5">
                    <PlayerAvatar avatarUrl={p.player.avatar_url} displayName={p.player.display_name} size="sm" />
                    <span className="max-w-[72px] truncate">{p.player.display_name.split(' ')[0]}</span>
                  </div>
                </td>
                {hasTotals && (
                  <td className="sticky left-[112px] z-10 w-[52px] bg-surface px-2 py-1 text-center font-mono font-bold text-foreground">
                    {overallPoints(p.entry_id)}
                  </td>
                )}
                <td
                  className={cn(
                    'sticky z-10 w-[48px] bg-surface px-2 py-1 text-center font-mono font-bold',
                    koStickyLeft,
                    hasTotals ? 'text-text-secondary' : 'text-foreground'
                  )}
                >
                  {totalPoints.get(p.entry_id) ?? 0}
                </td>
                {leaves.map((leaf) => {
                  if (leaf.kind === 'roundTotal') {
                    const pts = roundPoints(p.entry_id, leaf.round)
                    return (
                      <td
                        key={`${p.entry_id}-${leaf.round}-total`}
                        className={cn('border-l border-border-custom px-2 py-1 text-center font-mono', pointsColor(pts))}
                      >
                        {pts}
                      </td>
                    )
                  }
                  const { match, round } = leaf
                  const pick = pickFor(p.entry_id, match.id)
                  const winnerId = pick?.predicted_winner_id ?? null
                  const sub = isSubPick(p.entry_id, round, winnerId)
                  const impossible = !sub && isImpossible(round, winnerId)
                  return (
                    <td
                      key={`${p.entry_id}-${match.id}`}
                      className={cn(
                        'border-l border-border-custom px-1.5 py-1 text-center font-mono',
                        cellColor(round, winnerId, match.winner_team_id, impossible)
                      )}
                    >
                      {sub && <span title="Emergency Sub pick" className="mr-0.5">🔄</span>}
                      {winnerId ? code(winnerId) : '-'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
