import { formatCurrency } from '@/lib/utils'
import type { HonoursWithDetails } from '@/lib/types'

interface HonoursBoardProps {
  honours: HonoursWithDetails[]
}

export function HonoursBoard({ honours }: HonoursBoardProps) {
  if (honours.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No historical records yet.</p>
  }

  // Group by tournament
  const byTournament = new Map<string, HonoursWithDetails[]>()
  for (const h of honours) {
    const key = h.tournament_id
    if (!byTournament.has(key)) byTournament.set(key, [])
    byTournament.get(key)!.push(h)
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Year
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Tournament
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Prize
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Winner
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
          {honours.map((h) => (
            <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                {h.tournament.year}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                {h.tournament.name}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                {h.prize_type === 'overall_winner' ? 'Overall Winner' : 'Group Stage Winner'}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                {h.player.display_name}
                {h.player.nickname && (
                  <span className="ml-1 text-xs text-gray-400">({h.player.nickname})</span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-green-700 dark:text-green-400">
                {h.prize_amount_gbp !== null ? formatCurrency(h.prize_amount_gbp) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
