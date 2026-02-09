import { formatCurrency } from '@/lib/utils'
import type { HonoursWithDetails, PrizeType } from '@/lib/types'

interface HonoursBoardProps {
  honours: HonoursWithDetails[]
}

const PRIZE_LABELS: Record<PrizeType, string> = {
  overall_winner: 'Champion',
  runner_up: 'Runner Up',
  third_place: 'Third Place',
  group_stage_winner: 'Group Stage King',
  knockout_stage_winner: 'Knockout King',
  best_tiebreaker: 'Crystal Ball',
  wooden_spoon: 'Wooden Spoon',
  worst_tiebreaker: 'Smashed Crystal Ball',
  hipster: 'Hipster Award',
  bandwagon: 'Bandwagon Award',
  nearly_man: 'Nearly Man',
  custom: 'Special Award',
}

const PRIZE_EMOJI: Record<PrizeType, string> = {
  overall_winner: '\uD83C\uDFC6',
  runner_up: '\uD83E\uDD48',
  third_place: '\uD83E\uDD49',
  group_stage_winner: '\uD83D\uDCCA',
  knockout_stage_winner: '\u26A1',
  best_tiebreaker: '\uD83D\uDD2E',
  wooden_spoon: '\uD83E\uDD44',
  worst_tiebreaker: '\uD83D\uDCA5',
  hipster: '\uD83E\uDDD4',
  bandwagon: '\uD83D\uDE8C',
  nearly_man: '\uD83D\uDE2D',
  custom: '\u2B50',
}

const MAIN_AWARDS: PrizeType[] = [
  'overall_winner',
  'runner_up',
  'third_place',
  'group_stage_winner',
  'knockout_stage_winner',
  'best_tiebreaker',
]

const FUN_AWARDS: PrizeType[] = [
  'wooden_spoon',
  'worst_tiebreaker',
  'hipster',
  'bandwagon',
  'nearly_man',
  'custom',
]

function getPlayerDisplay(h: HonoursWithDetails): string {
  if (h.player) {
    return h.player.nickname || h.player.display_name
  }
  return h.player_name || 'Unknown'
}

export function HonoursBoard({ honours }: HonoursBoardProps) {
  if (honours.length === 0) {
    return <p className="py-8 text-center text-sm text-text-muted">No historical records yet.</p>
  }

  // Group by tournament, sorted by year descending
  const tournaments = new Map<string, { name: string; year: number; honours: HonoursWithDetails[] }>()
  for (const h of honours) {
    const key = h.tournament_id
    if (!tournaments.has(key)) {
      tournaments.set(key, { name: h.tournament.name, year: h.tournament.year, honours: [] })
    }
    tournaments.get(key)!.honours.push(h)
  }

  // Sort each tournament's honours by sort_order
  for (const t of tournaments.values()) {
    t.honours.sort((a, b) => a.sort_order - b.sort_order)
  }

  // Sort tournaments by year descending
  const sortedTournaments = [...tournaments.entries()].sort(
    (a, b) => b[1].year - a[1].year
  )

  return (
    <div className="space-y-10">
      {sortedTournaments.map(([tournamentId, tournament]) => {
        const mainHonours = tournament.honours.filter((h) => MAIN_AWARDS.includes(h.prize_type))
        const funHonours = tournament.honours.filter((h) => FUN_AWARDS.includes(h.prize_type))

        return (
          <div key={tournamentId}>
            <h2 className="mb-4 font-heading text-xl font-bold text-foreground">
              {tournament.name} ({tournament.year})
            </h2>

            {/* Main Awards */}
            {mainHonours.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold">
                  Roll of Honour
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {mainHonours.map((h) => (
                    <div
                      key={h.id}
                      className={`rounded-xl border p-4 ${
                        h.prize_type === 'overall_winner'
                          ? 'border-gold bg-gold/10'
                          : h.prize_type === 'runner_up'
                            ? 'border-border-light bg-surface-light'
                            : h.prize_type === 'third_place'
                              ? 'border-orange-700/50 bg-orange-900/20'
                              : 'border-border-custom bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{PRIZE_EMOJI[h.prize_type]}</span>
                        <div>
                          <p className="text-xs font-medium uppercase text-text-muted">
                            {PRIZE_LABELS[h.prize_type]}
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {getPlayerDisplay(h)}
                          </p>
                        </div>
                        {h.points !== null && (
                          <span className="ml-auto rounded-full bg-green-accent/20 px-2.5 py-0.5 text-sm font-semibold text-green-accent">
                            {h.points}pts
                          </span>
                        )}
                      </div>
                      {h.description && (
                        <p className="mt-2 text-sm italic text-text-secondary">
                          {h.description}
                        </p>
                      )}
                      {h.prize_amount_gbp !== null && h.prize_amount_gbp > 0 && (
                        <p className="mt-1 text-sm font-medium text-gold">
                          Prize: {formatCurrency(h.prize_amount_gbp)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fun Awards */}
            {funHonours.length > 0 && (
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gold">
                  Wall of Shame
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {funHonours.map((h) => (
                    <div
                      key={h.id}
                      className={`rounded-xl border p-4 ${
                        h.prize_type === 'wooden_spoon'
                          ? 'border-red-accent/30 bg-red-accent/10'
                          : 'border-border-custom bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{PRIZE_EMOJI[h.prize_type]}</span>
                        <div>
                          <p className="text-xs font-medium uppercase text-text-muted">
                            {PRIZE_LABELS[h.prize_type]}
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {getPlayerDisplay(h)}
                          </p>
                        </div>
                        {h.points !== null && (
                          <span className="ml-auto rounded-full bg-surface-light px-2.5 py-0.5 text-sm font-semibold text-text-secondary">
                            {h.points}pts
                          </span>
                        )}
                      </div>
                      {h.description && (
                        <p className="mt-2 text-sm italic text-text-secondary">
                          {h.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
