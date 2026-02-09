import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/Card'
import type { Tournament } from '@/lib/types'

export default async function RulesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!tournament) notFound()

  const t = tournament as Tournament

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t.name} - Rules</h1>

      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Group Stage Scoring</h2>}>
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>For each group, you predict which teams will finish 1st, 2nd, and 3rd.</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 text-left font-medium">Outcome</th>
                <th className="py-2 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <tr>
                <td className="py-2">Correctly predict a team qualifies for knockouts</td>
                <td className="py-2 text-right font-bold text-green-700 dark:text-green-400">1 point</td>
              </tr>
              <tr>
                <td className="py-2">Correctly predict their exact finishing position</td>
                <td className="py-2 text-right font-bold text-green-700 dark:text-green-400">1 bonus point</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500">
            Maximum: 2 points per qualifying team predicted correctly in the right position.
          </p>
        </div>
      </Card>

      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Knockout Stage Scoring</h2>}>
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
          <p>Points double with each round. Predict the winner of every knockout match.</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="py-2 text-left font-medium">Round</th>
                <th className="py-2 text-right font-medium">Points per correct pick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              <tr>
                <td className="py-2">Round of 16</td>
                <td className="py-2 text-right font-bold">2 points</td>
              </tr>
              <tr>
                <td className="py-2">Quarter-Finals</td>
                <td className="py-2 text-right font-bold">4 points</td>
              </tr>
              <tr>
                <td className="py-2">Semi-Finals</td>
                <td className="py-2 text-right font-bold">8 points</td>
              </tr>
              <tr>
                <td className="py-2">Final</td>
                <td className="py-2 text-right font-bold">16 points</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-500">
            Maximum knockout points: 64 (8x2 + 4x4 + 2x8 + 1x16).
            Maximum total: 96 points (32 group + 64 knockout).
          </p>
        </div>
      </Card>

      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Tiebreaker</h2>}>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          If players are tied on total points, the tiebreaker is the <strong>closest prediction to total goals scored in the group stage</strong> (absolute difference, lower is better).
          If still tied, knockout points are used as a secondary tiebreaker.
        </p>
      </Card>

      <Card header={<h2 className="font-semibold text-gray-900 dark:text-gray-100">Prizes</h2>}>
        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>
            <strong>Overall Winner:</strong> {t.overall_prize_pct}% of the prize pool
          </p>
          <p>
            <strong>Group Stage Leader:</strong> {t.group_stage_prize_pct}% of the prize pool
          </p>
          <p className="text-xs text-gray-500">
            Entry fee: &pound;{t.entry_fee_gbp.toFixed(2)} per person.
          </p>
        </div>
      </Card>
    </div>
  )
}
