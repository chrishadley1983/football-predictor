import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import type { Tournament, KnockoutRoundConfig } from '@/lib/types'

const ROUND_LABELS: Record<string, string> = {
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter-Finals',
  semi_final: 'Semi-Finals',
  final: 'Final',
}

export default async function RulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament, error: tournamentErr } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (tournamentErr) console.error('Failed to fetch tournament:', tournamentErr.message)
  if (!tournament) notFound()

  const t = tournament as Tournament

  // Maxes are computed from this tournament's actual config so the numbers
  // stay accurate across formats (WC2026 = 64+80=144, Euros 2024 = 32+64=96, etc.)
  const { data: groupsData } = await supabase
    .from('groups')
    .select('id')
    .eq('tournament_id', t.id)
  const groupCount = groupsData?.length ?? 0
  const thirdPlaceQualifiers = t.third_place_qualifiers_count ?? groupCount

  // 2 points per correctly-positioned qualifier: top 2 from every group + any
  // configured third-place qualifiers. Formula: (groups × 2 top spots × 2 pts)
  // + (third-place qualifiers × 2 pts).
  const groupMax = groupCount * 4 + thirdPlaceQualifiers * 2

  const { data: roundConfig } = await supabase
    .from('knockout_round_config')
    .select('*')
    .eq('tournament_id', t.id)
    .order('sort_order', { ascending: true })

  const rounds: KnockoutRoundConfig[] = roundConfig ?? []
  const knockoutMax = rounds.reduce((sum, r) => sum + r.points_value * r.match_count, 0)
  const knockoutBreakdown = rounds.map((r) => `${r.match_count}×${r.points_value}`).join(' + ')
  const totalMax = groupMax + knockoutMax

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-heading text-2xl font-bold text-foreground">{t.name} - Rules</h1>

      <Card header={<h2 className="font-semibold text-foreground">Group Stage Scoring</h2>}>
        <div className="space-y-3 text-sm text-text-secondary">
          <p>For each group, you predict which teams will finish 1st, 2nd, and 3rd.</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-custom">
                <th className="py-2 text-left font-medium">Outcome</th>
                <th className="py-2 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom">
              <tr>
                <td className="py-2">Correctly predict a team qualifies for knockouts</td>
                <td className="py-2 text-right font-bold text-gold">1 point</td>
              </tr>
              <tr>
                <td className="py-2">Correctly predict their exact finishing position</td>
                <td className="py-2 text-right font-bold text-gold">1 bonus point</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-text-muted">
            Maximum group-stage points: <strong className="text-foreground">{groupMax}</strong>
            {' '}({groupCount} groups × 2 spots × 2 points{thirdPlaceQualifiers > 0 ? ` + ${thirdPlaceQualifiers} 3rd-place qualifiers × 2 points` : ''}).
          </p>
        </div>
      </Card>

      <Card header={<h2 className="font-semibold text-foreground">Knockout Stage Scoring</h2>}>
        <div className="space-y-3 text-sm text-text-secondary">
          <p>Points double with each round. Predict the winner of every knockout match.</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-custom">
                <th className="py-2 text-left font-medium">Round</th>
                <th className="py-2 text-right font-medium">Points per correct pick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-custom">
              {rounds.length > 0 ? (
                rounds.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">{ROUND_LABELS[r.round] ?? r.round}</td>
                    <td className="py-2 text-right font-bold">{r.points_value} {r.points_value === 1 ? 'point' : 'points'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-2" colSpan={2}>Knockout configuration not yet set.</td>
                </tr>
              )}
            </tbody>
          </table>
          {knockoutMax > 0 && (
            <p className="text-xs text-text-muted">
              Maximum knockout points: <strong className="text-foreground">{knockoutMax}</strong>{knockoutBreakdown ? ` (${knockoutBreakdown})` : ''}.
              Maximum total: <strong className="text-foreground">{totalMax}</strong> points ({groupMax} group + {knockoutMax} knockout).
            </p>
          )}
        </div>
      </Card>

      <Card header={<h2 className="font-semibold text-foreground">Emergency Sub</h2>}>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            If you selected a team that was knocked out, you can replace that team with whoever
            knocked them out — but you can only do this <strong>once</strong>, so use it wisely.
          </p>
          <p>
            Using the Emergency Sub costs a <strong>6-point penalty</strong>. The replacement team
            will carry forward through all subsequent rounds.
          </p>
        </div>
      </Card>

      <Card header={<h2 className="font-semibold text-foreground">Tiebreaker</h2>}>
        <p className="text-sm text-text-secondary">
          If players are tied on total points, the tiebreaker is the <strong>closest prediction to total goals scored in the group stage</strong> (absolute difference, lower is better).
          If still tied, knockout points are used as a secondary tiebreaker.
        </p>
      </Card>

      <Card header={<h2 className="font-semibold text-foreground">Prizes</h2>}>
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            <strong>Overall Winner:</strong> {t.overall_prize_pct}% of the prize pool
          </p>
          <p>
            <strong>Group Stage Leader:</strong> {t.group_stage_prize_pct}% of the prize pool
          </p>
          <p className="text-xs text-text-muted">
            Entry fee: &pound;{t.entry_fee_gbp.toFixed(2)} per person.
          </p>
        </div>
      </Card>
    </div>
  )
}
