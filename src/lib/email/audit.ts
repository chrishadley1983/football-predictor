import 'server-only'
import { getResendClient, isAuditEmailEnabled } from './client'
import { AUDIT_FROM, AUDIT_RECIPIENTS } from './recipients'
import { renderTemplate } from './templates'

export type PlayerRef = {
  id: string
  displayName: string
  nickname: string | null
  email: string
}

export type TournamentRef = {
  id: string
  name: string
  slug: string
  year: number
}

export type GroupPredictionSnapshot = {
  first: string | null
  second: string | null
  third: string | null
}

export type GroupPredictionChange = {
  groupName: string
  old: GroupPredictionSnapshot | null
  new: GroupPredictionSnapshot
  changed: boolean
}

export type KnockoutPredictionChange = {
  matchLabel: string
  old: string | null
  new: string
  changed: boolean
}

export type ChatMessageType = 'user' | 'pundit' | 'system'

export type SignUpEvent = {
  event: 'sign_up'
  player: PlayerRef
  createdAt: string
}

export type TournamentEntryEvent = {
  event: 'tournament_entry'
  player: PlayerRef
  tournament: TournamentRef
  entryId: string
  entryFeeGbp: number | null
}

export type GroupPredictionsEvent = {
  event: 'group_predictions_submitted'
  player: PlayerRef
  tournament: TournamentRef
  changes: GroupPredictionChange[]
  tiebreaker: { old: number | null; new: number | null; changed: boolean } | null
}

export type KnockoutPredictionsEvent = {
  event: 'knockout_predictions_submitted'
  player: PlayerRef
  tournament: TournamentRef
  changes: KnockoutPredictionChange[]
}

export type ChatMessageEvent = {
  event: 'chat_message'
  player: PlayerRef
  tournament: TournamentRef | null
  message: {
    id: string
    content: string
    messageType: ChatMessageType
    createdAt: string
    replyTo: { content: string; authorName: string | null } | null
    metadata: Record<string, unknown> | null
  }
}

export type PaymentStatus = 'pending' | 'paid' | 'refunded'

export type PaymentStatusEvent = {
  event: 'payment_status_changed'
  player: PlayerRef
  tournament: TournamentRef
  entryId: string
  old: PaymentStatus
  new: PaymentStatus
}

export type ProfileField = 'display_name' | 'nickname' | 'avatar_url'

export type ProfileUpdatedEvent = {
  event: 'profile_updated'
  player: PlayerRef
  changes: Array<{ field: ProfileField; old: string | null; new: string | null }>
}

export type GoldenTicketEvent = {
  event: 'golden_ticket_played'
  player: PlayerRef
  tournament: TournamentRef
  swap: {
    round: string
    matchLabel: string
    oldTeam: string | null
    newTeam: string
  }
}

export type AdminAction =
  | 'seed_tournament'
  | 'reset_test_data'
  | 'force_complete'
  | 'status_change'

export type AdminActionEvent = {
  event: 'admin_action'
  action: AdminAction
  tournament: TournamentRef | null
  summary: string
  details?: Record<string, string | number | boolean | null>
}

export type AuditEvent =
  | SignUpEvent
  | TournamentEntryEvent
  | GroupPredictionsEvent
  | KnockoutPredictionsEvent
  | ChatMessageEvent
  | PaymentStatusEvent
  | ProfileUpdatedEvent
  | GoldenTicketEvent
  | AdminActionEvent

/**
 * Fire-and-forget audit email. Never rejects — all failures are logged.
 * Call sites should use `void sendAuditEmail(...)` and continue.
 */
export async function sendAuditEmail(event: AuditEvent): Promise<void> {
  try {
    if (!isAuditEmailEnabled()) return

    const resend = getResendClient()
    if (!resend) return

    const { subject, html, text } = renderTemplate(event)

    const { error } = await resend.emails.send({
      from: AUDIT_FROM,
      to: [...AUDIT_RECIPIENTS],
      subject,
      html,
      text,
    })

    if (error) {
      console.error('[audit-email] send failed', { event: event.event, error })
    }
  } catch (err) {
    console.error('[audit-email] unexpected error', { event: event.event, err })
  }
}
