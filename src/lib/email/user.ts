import 'server-only'
import { after } from 'next/server'
import { AUDIT_RECIPIENTS } from './recipients'
import { getResendClient, isAuditEmailEnabled } from './client'
import { getPlayerEmailFrom } from './sender'
import { renderUserTemplate } from './user-templates'
import type { GroupPredictionChange, KnockoutPredictionChange } from './audit'
import type { PrizeType } from '@/lib/types'

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

export type TournamentRef = {
  id: string
  name: string
  slug: string
  year: number
}

export type WelcomeEvent = {
  event: 'welcome'
  player: PlayerEmailRef
}

export type GroupPredictionsConfirmationEvent = {
  event: 'group_predictions_confirmation'
  player: PlayerEmailRef
  tournament: TournamentRef
  changes: GroupPredictionChange[]
  tiebreaker: number | null
  /** True when no prior group prediction existed for this entry — drives the subject wording. */
  isFirstSubmission: boolean
}

export type KnockoutPredictionsConfirmationEvent = {
  event: 'knockout_predictions_confirmation'
  player: PlayerEmailRef
  tournament: TournamentRef
  changes: KnockoutPredictionChange[]
  isFirstSubmission: boolean
}

export type KnockoutOpenAnnouncementEvent = {
  event: 'knockout_open_announcement'
  player: PlayerEmailRef
  tournament: TournamentRef & { knockoutDeadline: string | null }
}

export type TournamentCompletedEvent = {
  event: 'tournament_completed'
  player: PlayerEmailRef
  tournament: TournamentRef
  myFinish: {
    rank: number | null
    totalPoints: number
  }
  myHonours: Array<{
    prizeType: PrizeType | string
    prizeAmountGbp: number | null
    description: string | null
  }>
  topThree: Array<{
    rank: number
    displayName: string
    totalPoints: number
  }>
}

export type UserEmailEvent =
  | WelcomeEvent
  | GroupPredictionsConfirmationEvent
  | KnockoutPredictionsConfirmationEvent
  | KnockoutOpenAnnouncementEvent
  | TournamentCompletedEvent

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

/**
 * Schedule a fan-out send to multiple players in a single Resend batch call.
 *
 * Used for tournament-wide announcements (knockout open, tournament completed)
 * where every player gets a similarly-shaped (but potentially personalised) email.
 *
 * Does NOT bcc admin per-message — at 50+ players that would flood your inbox.
 * Fire a separate admin audit email summarising the broadcast.
 *
 * Resend's batch endpoint accepts up to 100 messages per call; this helper
 * chunks larger broadcasts automatically.
 */
export function scheduleUserBroadcast(events: UserEmailEvent[]): void {
  after(() => sendUserBroadcast(events))
}

export async function sendUserBroadcast(events: UserEmailEvent[]): Promise<void> {
  try {
    if (!isAuditEmailEnabled()) return

    const eligible = events.filter((e) => e.player.notificationsEnabled)
    if (eligible.length === 0) return

    const resend = getResendClient()
    if (!resend) return

    const from = getPlayerEmailFrom()
    const messages = eligible.map((event) => {
      const { subject, html, text } = renderUserTemplate(event)
      return {
        from,
        to: [event.player.email],
        subject,
        html,
        text,
      }
    })

    const BATCH_LIMIT = 100
    for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
      const chunk = messages.slice(i, i + BATCH_LIMIT)
      const { error } = await resend.batch.send(chunk)
      if (error) {
        console.error('[user-email] broadcast batch failed', {
          batchStart: i,
          batchSize: chunk.length,
          error,
        })
      }
    }
  } catch (err) {
    console.error('[user-email] broadcast unexpected error', err)
  }
}
