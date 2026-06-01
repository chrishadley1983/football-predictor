import 'server-only'
import { after } from 'next/server'
import { AUDIT_RECIPIENTS } from './recipients'
import { getResendClient, isAuditEmailEnabled } from './client'
import { getPlayerEmailFrom } from './sender'
import { renderUserTemplate } from './user-templates'

/**
 * Reference to a player as the RECIPIENT of a transactional email.
 *
 * Carries everything the helper needs to decide whether to send and how to
 * render — including the player's opt-in flag and unsubscribe token — so the
 * helper itself never touches the database. Callers already have these fields
 * from the player row they just inserted/loaded.
 */
export type PlayerEmailRef = {
  id: string
  displayName: string
  email: string
  unsubscribeToken: string
  /** Mirrors players.email_notifications_enabled. False = skip the send. */
  notificationsEnabled: boolean
}

export type WelcomeEvent = {
  event: 'welcome'
  player: PlayerEmailRef
}

// Discriminated union — extended in follow-ups to cover (b/c/d).
export type UserEmailEvent = WelcomeEvent

/**
 * Schedule a player-facing email from inside a route handler. Uses Next.js
 * `after()` so the send runs after the HTTP response has been flushed. Never
 * rejects — failures are logged.
 *
 * Distinct from `scheduleAuditEmail` because:
 *  - recipient is the player, not the admin list
 *  - sender domain may differ (PLAYER_EMAIL_FROM vs AUDIT_FROM)
 *  - send is suppressed when the player has opted out
 *
 * Admin audit mail is still BCC'd (silent to the player) for traceability —
 * lets you see in your inbox that a welcome went out, without revealing the
 * admin address in the player's headers.
 */
export function scheduleUserEmail(event: UserEmailEvent): void {
  after(() => sendUserEmail(event))
}

/**
 * Awaitable variant. Never rejects. Prefer scheduleUserEmail in request handlers.
 */
export async function sendUserEmail(event: UserEmailEvent): Promise<void> {
  try {
    if (!isAuditEmailEnabled()) return
    if (!event.player.notificationsEnabled) return

    const resend = getResendClient()
    if (!resend) return

    const { subject, html, text } = renderUserTemplate(event)

    const { error } = await resend.emails.send({
      from: getPlayerEmailFrom(),
      to: [event.player.email],
      bcc: [...AUDIT_RECIPIENTS],
      subject,
      html,
      text,
    })

    if (error) {
      console.error('[user-email] send failed', { event: event.event, playerId: event.player.id, error })
    }
  } catch (err) {
    console.error('[user-email] unexpected error', { event: event.event, playerId: event.player.id, err })
  }
}
