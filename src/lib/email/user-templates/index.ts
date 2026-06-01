import type { UserEmailEvent } from '../user'
import { renderWelcome } from './welcome'
import { renderGroupPredictionsConfirmation } from './group-predictions-confirmation'
import { renderKnockoutPredictionsConfirmation } from './knockout-predictions-confirmation'
import { renderKnockoutOpenAnnouncement } from './knockout-open-announcement'
import { renderTournamentCompleted } from './tournament-completed'

export function renderUserTemplate(event: UserEmailEvent): { subject: string; html: string; text: string } {
  switch (event.event) {
    case 'welcome':
      return renderWelcome(event)
    case 'group_predictions_confirmation':
      return renderGroupPredictionsConfirmation(event)
    case 'knockout_predictions_confirmation':
      return renderKnockoutPredictionsConfirmation(event)
    case 'knockout_open_announcement':
      return renderKnockoutOpenAnnouncement(event)
    case 'tournament_completed':
      return renderTournamentCompleted(event)
    default: {
      const _exhaustive: never = event
      throw new Error(`Unhandled user email event: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
