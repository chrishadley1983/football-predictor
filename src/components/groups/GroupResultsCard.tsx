import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import type { GroupWithTeams, GroupResult } from '@/lib/types'

interface GroupResultsCardProps {
  group: GroupWithTeams
  results: GroupResult[]
}

export function GroupResultsCard({ group, results }: GroupResultsCardProps) {
  const teams = group.group_teams.map((gt) => gt.team)
  const resultMap = new Map<string, GroupResult>()
  for (const r of results) {
    resultMap.set(r.team_id, r)
  }

  // Sort teams by final_position
  const sortedTeams = [...teams].sort((a, b) => {
    const ra = resultMap.get(a.id)
    const rb = resultMap.get(b.id)
    return (ra?.final_position ?? 99) - (rb?.final_position ?? 99)
  })

  return (
    <Card header={<h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{group.name}</h3>}>
      <div className="space-y-2">
        {sortedTeams.map((team) => {
          const result = resultMap.get(team.id)
          return (
            <div
              key={team.id}
              className={cn(
                'flex items-center justify-between rounded px-3 py-2',
                result?.qualified
                  ? 'bg-green-50 dark:bg-green-950'
                  : 'bg-gray-50 dark:bg-gray-800'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm font-bold text-gray-500">
                  {result?.final_position ?? '-'}
                </span>
                {team.flag_emoji && <span className="text-sm">{team.flag_emoji}</span>}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{team.name}</span>
              </div>
              {result?.qualified && (
                <Badge variant="green">Qualified</Badge>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
