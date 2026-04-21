import type { AuditEvent } from '../audit'
import { renderSignUp } from './sign-up'
import { renderTournamentEntry } from './tournament-entry'
import { renderGroupPredictions } from './group-predictions'
import { renderKnockoutPredictions } from './knockout-predictions'
import { renderChatMessage } from './chat-message'

export function renderTemplate(event: AuditEvent): { subject: string; html: string; text: string } {
  switch (event.event) {
    case 'sign_up':
      return renderSignUp(event)
    case 'tournament_entry':
      return renderTournamentEntry(event)
    case 'group_predictions_submitted':
      return renderGroupPredictions(event)
    case 'knockout_predictions_submitted':
      return renderKnockoutPredictions(event)
    case 'chat_message':
      return renderChatMessage(event)
    default: {
      const _exhaustive: never = event
      throw new Error(`Unhandled audit event: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
