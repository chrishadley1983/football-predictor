import { NextResponse, after } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { scheduleAuditEmail } from '@/lib/email/audit'
import { sendUserBroadcast } from '@/lib/email/user'
import {
  buildKnockoutOpenEvents,
  buildTournamentCompletedEvents,
} from '@/lib/email/broadcasts'
import type { TournamentStatus } from '@/lib/types'

const VALID_STATUSES: TournamentStatus[] = [
  'draft',
  'group_stage_open',
  'group_stage_closed',
  'knockout_open',
  'knockout_closed',
  'completed',
]

// Valid status transitions
const VALID_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  draft: ['group_stage_open'],
  group_stage_open: ['group_stage_closed'],
  group_stage_closed: ['knockout_open'],
  knockout_open: ['knockout_closed'],
  knockout_closed: ['completed'],
  completed: [],
}

// PATCH: Update tournament status (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    const body = await request.json()

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // Get current tournament
    const { data: tournament } = await admin
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Validate the status transition
    const currentStatus = tournament.status as TournamentStatus
    const allowedTransitions = VALID_TRANSITIONS[currentStatus]
    if (!allowedTransitions.includes(body.status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from "${currentStatus}" to "${body.status}". Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`,
        },
        { status: 400 }
      )
    }

    const { data: updated, error } = await admin
      .from('tournaments')
      .update({ status: body.status })
      .eq('slug', slug)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Player-facing broadcasts on key transitions. Built before the audit email
    // so we can include the recipient count in the admin summary.
    const newStatus = body.status as TournamentStatus
    let broadcastRecipients = 0
    if (newStatus === 'knockout_open') {
      const events = await buildKnockoutOpenEvents(admin, tournament.id)
      broadcastRecipients = events.length
      // Defer the actual send so the HTTP response flushes first; sendUserBroadcast
      // never rejects, all errors are logged.
      after(() => sendUserBroadcast(events))
    } else if (newStatus === 'completed') {
      const events = await buildTournamentCompletedEvents(admin, tournament.id)
      broadcastRecipients = events.length
      after(() => sendUserBroadcast(events))
    }

    scheduleAuditEmail({
      event: 'admin_action',
      action: 'status_change',
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        year: tournament.year,
      },
      summary:
        broadcastRecipients > 0
          ? `Tournament status ${currentStatus} → ${body.status}. Broadcast sent to ${broadcastRecipients} player${broadcastRecipients === 1 ? '' : 's'}.`
          : `Tournament status ${currentStatus} → ${body.status}`,
      details: {
        old_status: currentStatus,
        new_status: body.status,
        broadcast_recipients: broadcastRecipients,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
