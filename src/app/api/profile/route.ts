import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { sendAuditEmail } from '@/lib/email/audit'
import type { ProfileField } from '@/lib/email/audit'

export async function PATCH(request: Request) {
  try {
    const player = await requireAuth()
    const body = await request.json()
    const supabase = await createClient()

    const updates: Record<string, string | null> = {}

    if ('display_name' in body) {
      const displayName = String(body.display_name).trim()
      if (!displayName) {
        return NextResponse.json({ error: 'Display name cannot be empty' }, { status: 400 })
      }
      if (displayName.length > 50) {
        return NextResponse.json({ error: 'Display name must be 50 characters or less' }, { status: 400 })
      }
      updates.display_name = displayName
    }

    if ('nickname' in body) {
      const nickname = body.nickname ? String(body.nickname).trim() : null
      if (nickname && nickname.length > 30) {
        return NextResponse.json({ error: 'Nickname must be 30 characters or less' }, { status: 400 })
      }
      updates.nickname = nickname
    }

    if ('avatar_url' in body) {
      if (body.avatar_url) {
        const avatarUrl = String(body.avatar_url)
        try {
          const parsed = new URL(avatarUrl)
          if (parsed.protocol !== 'https:') {
            return NextResponse.json({ error: 'avatar_url must use HTTPS' }, { status: 400 })
          }
        } catch {
          return NextResponse.json({ error: 'avatar_url must be a valid URL' }, { status: 400 })
        }
        updates.avatar_url = avatarUrl
      } else {
        updates.avatar_url = null
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('players')
      .update(updates)
      .eq('id', player.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit: diff against the pre-update player row, skip if no actual change.
    const changes: Array<{ field: ProfileField; old: string | null; new: string | null }> = []
    for (const field of Object.keys(updates) as ProfileField[]) {
      const oldValue = player[field] as string | null | undefined
      const newValue = updates[field]
      if ((oldValue ?? null) !== (newValue ?? null)) {
        changes.push({ field, old: oldValue ?? null, new: newValue })
      }
    }

    if (changes.length > 0) {
      void sendAuditEmail({
        event: 'profile_updated',
        player: {
          id: data.id,
          displayName: data.display_name,
          nickname: data.nickname,
          email: data.email,
        },
        changes,
      })
    }

    return NextResponse.json(data)
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
