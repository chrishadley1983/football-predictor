import { createClient } from '@/lib/supabase/server'
import type { Player } from '@/lib/types'

export async function getCurrentPlayer(): Promise<Player | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  return player ?? null
}

export async function requireAuth(): Promise<Player> {
  const player = await getCurrentPlayer()
  if (!player) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return player
}

export async function requireAdmin(): Promise<void> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Admin is identified by having role = 'admin' in app_metadata (matches the DB is_admin() function)
  const isAdmin = user.app_metadata?.role === 'admin'
  if (!isAdmin) {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
