'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import type { GroupWithTeams, GroupPrediction, GroupResult } from '@/lib/types'

interface GroupPredictionCardProps {
  group: GroupWithTeams
  prediction?: GroupPrediction
  onPredict: (predicted_1st: string, predicted_2nd: string, predicted_3rd: string | null) => void
  readonly?: boolean
  results?: GroupResult[]
}

export function GroupPredictionCard({ group, prediction, onPredict, readonly, results }: GroupPredictionCardProps) {
  const teams = group.group_teams.map((gt) => gt.team)

  const [first, setFirst] = useState(prediction?.predicted_1st ?? '')
  const [second, setSecond] = useState(prediction?.predicted_2nd ?? '')
  const [third, setThird] = useState(prediction?.predicted_3rd ?? '')

  useEffect(() => {
    setFirst(prediction?.predicted_1st ?? '')
    setSecond(prediction?.predicted_2nd ?? '')
    setThird(prediction?.predicted_3rd ?? '')
  }, [prediction])

  const resultMap = new Map<string, GroupResult>()
  if (results) {
    for (const r of results) {
      resultMap.set(r.team_id, r)
    }
  }

  function getAvailableOptions(excludeIds: string[]) {
    return teams
      .filter((t) => !excludeIds.includes(t.id))
      .map((t) => ({
        value: t.id,
        label: `${t.flag_emoji ?? ''} ${t.name}`.trim(),
      }))
  }

  function getStatusColor(teamId: string, predictedPosition: number): string {
    if (!teamId || resultMap.size === 0) return ''
    const result = resultMap.get(teamId)
    if (!result) return ''
    if (result.qualified && result.final_position === predictedPosition) {
      return 'ring-2 ring-green-accent' // exact position
    }
    if (result.qualified) {
      return 'ring-2 ring-yellow-accent' // qualified but wrong position
    }
    return 'ring-2 ring-red-accent' // did not qualify
  }

  const hasAllRequired = first && second && third
  const changed =
    first !== (prediction?.predicted_1st ?? '') ||
    second !== (prediction?.predicted_2nd ?? '') ||
    third !== (prediction?.predicted_3rd ?? '')

  return (
    <Card
      header={
        <h3 className="text-base font-semibold text-foreground">{group.name}</h3>
      }
    >
      <div className="space-y-3">
        {/* Team list */}
        <div className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded bg-surface-light px-2 py-1 text-xs text-text-secondary">
              {t.flag_emoji && <span>{t.flag_emoji}</span>}
              {t.name}
            </span>
          ))}
        </div>

        {/* Position selects */}
        <div className={getStatusColor(first, 1)}>
          <Select
            label="1st Place"
            id={`${group.id}-1st`}
            placeholder="Select team..."
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            options={getAvailableOptions([second, third].filter(Boolean))}
            disabled={readonly}
          />
        </div>

        <div className={getStatusColor(second, 2)}>
          <Select
            label="2nd Place"
            id={`${group.id}-2nd`}
            placeholder="Select team..."
            value={second}
            onChange={(e) => setSecond(e.target.value)}
            options={getAvailableOptions([first, third].filter(Boolean))}
            disabled={readonly}
          />
        </div>

        <div className={getStatusColor(third, 3)}>
          <Select
            label="3rd Place"
            id={`${group.id}-3rd`}
            placeholder="Select team..."
            value={third}
            onChange={(e) => setThird(e.target.value)}
            options={getAvailableOptions([first, second].filter(Boolean))}
            disabled={readonly}
          />
        </div>

        {!readonly && (
          <Button
            size="sm"
            disabled={!hasAllRequired || !changed}
            onClick={() => onPredict(first, second, third || null)}
            className="w-full"
          >
            {prediction ? 'Update Prediction' : 'Save Prediction'}
          </Button>
        )}

        {prediction && (
          <p className="text-center text-xs text-green-accent">
            Saved
          </p>
        )}
      </div>
    </Card>
  )
}
