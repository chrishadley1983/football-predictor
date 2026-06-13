'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Flag } from '@/components/ui/Flag'
import type { GroupWithTeams, GroupPrediction, GroupResult } from '@/lib/types'

interface GroupPredictionCardProps {
  group: GroupWithTeams
  prediction?: GroupPrediction
  onPredict: (predicted_1st: string, predicted_2nd: string, predicted_3rd: string | null) => void
  readonly?: boolean
  results?: GroupResult[]
  thirdPlaceQualifies?: boolean
  onThirdPlaceToggle?: (checked: boolean) => void
  canToggleThirdPlace?: boolean
  /** When true, hides the per-card save button (parent handles submission) */
  hideSubmitButton?: boolean
  /**
   * Team ids whose group-stage fate is actually settled. Only these get a
   * status ring — a team mid-group stays unringed instead of showing red
   * before its group is decided. When undefined, all results are treated as
   * settled (legacy behaviour).
   */
  decidedTeamIds?: string[]
}

export function GroupPredictionCard({ group, prediction, onPredict, readonly, results, thirdPlaceQualifies, onThirdPlaceToggle, canToggleThirdPlace, hideSubmitButton, decidedTeamIds }: GroupPredictionCardProps) {
  const hasThirdPlaceFeature = thirdPlaceQualifies !== undefined
  const teams = group.group_teams.map((gt) => gt.team)

  const [first, setFirst] = useState(prediction?.predicted_1st ?? '')
  const [second, setSecond] = useState(prediction?.predicted_2nd ?? '')
  const [third, setThird] = useState(prediction?.predicted_3rd ?? '')

  useEffect(() => {
    setFirst(prediction?.predicted_1st ?? '')
    setSecond(prediction?.predicted_2nd ?? '')
    setThird(prediction?.predicted_3rd ?? '')
  }, [prediction])

  // Notify parent of draft changes whenever selections change
  useEffect(() => {
    if (hideSubmitButton) {
      onPredict(first, second, (hasThirdPlaceFeature && !thirdPlaceQualifies) ? null : (third || null))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, second, third, thirdPlaceQualifies, hideSubmitButton])

  const resultMap = new Map<string, GroupResult>()
  if (results) {
    for (const r of results) {
      resultMap.set(r.team_id, r)
    }
  }

  // Undefined prop => no gating (treat all results as settled).
  const decidedSet = decidedTeamIds ? new Set(decidedTeamIds) : null
  const isDecided = (teamId: string) => !decidedSet || decidedSet.has(teamId)

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
    if (!isDecided(teamId)) return ''
    const result = resultMap.get(teamId)
    if (!result) return ''
    if (result.qualified && result.final_position === predictedPosition) {
      return 'ring-2 ring-green-accent'
    }
    if (result.qualified) {
      return 'ring-2 ring-yellow-accent'
    }
    return 'ring-2 ring-red-accent'
  }

  const hasAllRequired = hasThirdPlaceFeature
    ? first && second && (thirdPlaceQualifies ? !!third : true)
    : first && second && third
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
            <span key={t.id} className="inline-flex items-center gap-1.5 rounded bg-surface-light px-2 py-1 text-xs text-text-secondary">
              <Flag emoji={t.flag_emoji} name={t.name} />
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

        {hasThirdPlaceFeature && (
          <label className="flex items-center gap-2 rounded bg-surface-light px-3 py-2 text-xs">
            <input
              type="checkbox"
              checked={thirdPlaceQualifies}
              onChange={(e) => {
                if (onThirdPlaceToggle) {
                  onThirdPlaceToggle(e.target.checked)
                  if (!e.target.checked) setThird('')
                }
              }}
              disabled={readonly || (!thirdPlaceQualifies && !canToggleThirdPlace)}
              className="h-4 w-4 rounded border-border-custom accent-green-accent"
            />
            <span className="text-text-secondary">3rd place qualifies for knockouts</span>
          </label>
        )}

        <div className={getStatusColor(third, 3)}>
          <Select
            label="3rd Place"
            id={`${group.id}-3rd`}
            placeholder={hasThirdPlaceFeature && !thirdPlaceQualifies ? 'Not qualifying...' : 'Select team...'}
            value={third}
            onChange={(e) => setThird(e.target.value)}
            options={getAvailableOptions([first, second].filter(Boolean))}
            disabled={readonly || (hasThirdPlaceFeature && !thirdPlaceQualifies)}
          />
        </div>

        {!readonly && !hideSubmitButton && (
          <Button
            size="sm"
            disabled={!hasAllRequired || !changed}
            onClick={() => onPredict(first, second, (hasThirdPlaceFeature && !thirdPlaceQualifies) ? null : (third || null))}
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
