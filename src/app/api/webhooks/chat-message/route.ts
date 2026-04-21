import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAuditEmail } from '@/lib/email/audit'
import type { ChatMessageType } from '@/lib/email/audit'

// POST: Called by Supabase trigger (via pg_net) after a chat_messages row is inserted.
// Hydrates the message, skips pundit/system messages, and fires the chat audit email.
// Idempotent-ish: re-delivery will just re-send the email; acceptable for audit-only use.
export async function POST(request: Request) {
  const expected = process.env.CHAT_AUDIT_WEBHOOK_SECRET
  if (!expected) {
    console.error('[chat-webhook] CHAT_AUDIT_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const received = request.headers.get('x-audit-secret')
  if (received !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { message_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const messageId = body.message_id
  if (!messageId || typeof messageId !== 'string') {
    return NextResponse.json({ error: 'message_id required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: msg, error } = await admin
    .from('chat_messages')
    .select(
      `
        id, content, message_type, created_at, metadata, reply_to_id,
        player:players!chat_messages_player_id_fkey (id, display_name, nickname, email),
        tournament:tournaments!chat_messages_tournament_id_fkey (id, name, slug, year)
      `
    )
    .eq('id', messageId)
    .maybeSingle()

  if (error) {
    console.error('[chat-webhook] hydration failed', { messageId, error })
    return NextResponse.json({ error: 'Hydration failed' }, { status: 500 })
  }
  if (!msg) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  const messageType = msg.message_type as ChatMessageType
  if (messageType === 'pundit' || messageType === 'system') {
    return NextResponse.json({ skipped: messageType }, { status: 200 })
  }

  // The select above returns arrays for joined single-FK relations in some Supabase
  // type modes. Normalize to a single object or null.
  const player = Array.isArray(msg.player) ? msg.player[0] : msg.player
  const tournament = Array.isArray(msg.tournament) ? msg.tournament[0] : msg.tournament

  if (!player) {
    console.warn('[chat-webhook] no player for message', { messageId })
    return NextResponse.json({ error: 'Message has no player' }, { status: 400 })
  }

  // If there's a reply, fetch the parent message in a separate query (self-refs
  // on chat_messages are clunkier through PostgREST embedding).
  let replyTo: { content: string; authorName: string | null } | null = null
  if (msg.reply_to_id) {
    const { data: parent } = await admin
      .from('chat_messages')
      .select(`content, player:players!chat_messages_player_id_fkey (display_name)`)
      .eq('id', msg.reply_to_id)
      .maybeSingle()
    if (parent) {
      const parentPlayer = Array.isArray(parent.player) ? parent.player[0] : parent.player
      replyTo = {
        content: parent.content,
        authorName: parentPlayer?.display_name ?? null,
      }
    }
  }

  await sendAuditEmail({
    event: 'chat_message',
    player: {
      id: player.id,
      displayName: player.display_name,
      nickname: player.nickname,
      email: player.email,
    },
    tournament: tournament
      ? {
          id: tournament.id,
          name: tournament.name,
          slug: tournament.slug,
          year: tournament.year,
        }
      : null,
    message: {
      id: msg.id,
      content: msg.content,
      messageType,
      createdAt: msg.created_at,
      replyTo,
      metadata: (msg.metadata as Record<string, unknown> | null) ?? null,
    },
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}
