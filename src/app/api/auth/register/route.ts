import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAuditEmail } from '@/lib/email/audit'

type Body = {
  email?: string
  password?: string
  displayName?: string
  nickname?: string | null
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password
  const displayName = body.displayName?.trim()
  const nickname = body.nickname?.trim() || null

  if (!email || !password || !displayName) {
    return NextResponse.json(
      { error: 'Email, password, and display name are required' },
      { status: 400 }
    )
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: 'Password must be at least 6 characters' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Step 1: create pre-confirmed auth user
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })

  if (authError || !created.user) {
    const msg = authError?.message ?? 'Failed to create account'
    const status = /already/i.test(msg) ? 409 : 400
    return NextResponse.json({ error: msg }, { status })
  }

  // Step 2: create player row (service role bypasses RLS)
  const { data: player, error: playerError } = await admin
    .from('players')
    .insert({
      auth_user_id: created.user.id,
      display_name: displayName,
      nickname,
      email,
    })
    .select()
    .single()

  if (playerError || !player) {
    // Rollback the orphaned auth user
    const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id)
    if (cleanupError) {
      console.error('[register] orphan auth user — cleanup failed', {
        authUserId: created.user.id,
        email,
        cleanupError,
      })
    }
    return NextResponse.json(
      { error: `Failed to create player: ${playerError?.message}` },
      { status: 500 }
    )
  }

  // Step 3: fire audit email (fire-and-forget)
  void sendAuditEmail({
    event: 'sign_up',
    player: {
      id: player.id,
      displayName: player.display_name,
      nickname: player.nickname,
      email: player.email,
    },
    createdAt: player.created_at,
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
