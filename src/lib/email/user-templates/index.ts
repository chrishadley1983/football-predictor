import type { UserEmailEvent } from '../user'
import { renderWelcome } from './welcome'

export function renderUserTemplate(event: UserEmailEvent): { subject: string; html: string; text: string } {
  switch (event.event) {
    case 'welcome':
      return renderWelcome(event)
    default: {
      const _exhaustive: never = event.event
      throw new Error(`Unhandled user email event: ${_exhaustive}`)
    }
  }
}
