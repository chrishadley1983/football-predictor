import type { TournamentStatus } from './types'

const STATUS_ORDER: TournamentStatus[] = [
  'draft',
  'group_stage_open',
  'group_stage_closed',
  'knockout_open',
  'knockout_closed',
  'completed',
]

export type PredictionStage = 'group' | 'knockout'

export interface PredictionProgress {
  /** Whether the stage's card/button is applicable for this tournament status at all. */
  show: boolean
  /** Stage is locked — read-only "view your picks" mode. */
  view: boolean
  /** Verb-led label suitable for both the overview card title and the predict-page button. */
  title: string
  /** Supporting subtitle for the overview card. */
  subtitle: string
}

/**
 * Derives the dynamic state of a prediction stage for the current user, shared by
 * the tournament overview cards and the floating submit buttons on the predict pages.
 *
 * Open-window states (predictions can be edited):
 *  - 0 predicted        → "Make ... Predictions"   — Not started, predict before the deadline
 *  - 1..total-1         → "Finish ... Predictions"  — x of y predicted, finish before the deadline
 *  - total              → "Update ... Predictions"  — all predicted
 * Locked states (stage closed/later) → "View ... Predictions".
 * Before the window opens (e.g. knockout during the group stage) → not shown.
 */
export function getPredictionProgress(
  stage: PredictionStage,
  status: TournamentStatus,
  predicted: number,
  total: number,
): PredictionProgress {
  const isGroup = stage === 'group'
  const openStatus: TournamentStatus = isGroup ? 'group_stage_open' : 'knockout_open'
  const stageWord = isGroup ? 'Group' : 'Knockout'
  const unit = isGroup ? 'groups' : 'matches'

  const openIdx = STATUS_ORDER.indexOf(openStatus)
  const curIdx = STATUS_ORDER.indexOf(status)

  // Nothing to predict or view before this stage's window opens.
  if (curIdx < openIdx) {
    return { show: false, view: false, title: '', subtitle: '' }
  }

  // Locked: read-only "view" state once the window has closed.
  if (status !== openStatus) {
    return {
      show: true,
      view: true,
      title: `View ${stageWord} Predictions`,
      subtitle:
        predicted > 0
          ? `${stageWord} stage locked — ${predicted}/${total} ${unit} predicted`
          : `${stageWord} stage locked`,
    }
  }

  // Open for predictions.
  if (predicted <= 0) {
    return {
      show: true,
      view: false,
      title: `Make ${stageWord} Predictions`,
      subtitle: 'Not started — predict before the deadline!',
    }
  }
  if (predicted < total) {
    return {
      show: true,
      view: false,
      title: `Finish ${stageWord} Predictions`,
      subtitle: `${predicted} of ${total} ${unit} predicted — finish before the deadline!`,
    }
  }
  return {
    show: true,
    view: false,
    title: `Update ${stageWord} Predictions`,
    subtitle: `All ${total} ${unit} predicted`,
  }
}
