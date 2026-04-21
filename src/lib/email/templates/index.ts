import type { AuditEvent } from '../audit'
import { renderSignUp } from './sign-up'
import { renderTournamentEntry } from './tournament-entry'
import { renderGroupPredictions } from './group-predictions'
import { renderKnockoutPredictions } from './knockout-predictions'
import { renderChatMessage } from './chat-message'
import { renderPayment } from './payment'
import { renderProfileUpdated } from './profile-updated'
import { renderGoldenTicket } from './golden-ticket'
import { renderAdminAction } from './admin-action'

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
    case 'payment_status_changed':
      return renderPayment(event)
    case 'profile_updated':
      return renderProfileUpdated(event)
    case 'golden_ticket_played':
      return renderGoldenTicket(event)
    case 'admin_action':
      return renderAdminAction(event)
    default: {
      const _exhaustive: never = event
      throw new Error(`Unhandled audit event: ${JSON.stringify(_exhaustive)}`)
    }
  }
}
