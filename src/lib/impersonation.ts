import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Cookie holding the entry_id an admin is "stepping into" (testing only). */
export const IMPERSONATE_COOKIE = 'impersonate_entry'

/**
 * If the current user is an admin AND has the impersonation cookie set, return
 * the entry_id they are stepping into — otherwise null. The admin check means a
 * non-admin who forges the cookie is ignored everywhere this is used.
 */
export async function getImpersonatedEntryId(): Promise<string | null> {
  const store = await cookies()
  const entryId = store.get(IMPERSONATE_COOKIE)?.value
  if (!entryId) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user?.app_metadata?.role !== 'admin') return null

  return entryId
}

/**
 * Resolve the effective entry for a player in a tournament: the admin-impersonated
 * entry when one is active and valid for this tournament, otherwise the player's
 * own entry. Returns the entry id and whether impersonation is in effect (callers
 * use admin-client writes when impersonating, since RLS only lets a player write
 * their own rows).
 */
export async function resolveEffectiveEntry(
  tournamentId: string,
  ownPlayerId: string
): Promise<{ entryId: string | null; impersonating: boolean }> {
  const admin = createAdminClient()

  const impEntryId = await getImpersonatedEntryId()
  if (impEntryId) {
    const { data } = await admin
      .from('tournament_entries')
      .select('id')
      .eq('id', impEntryId)
      .eq('tournament_id', tournamentId)
      .maybeSingle()
    if (data) return { entryId: data.id, impersonating: true }
  }

  const { data: own } = await admin
    .from('tournament_entries')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('player_id', ownPlayerId)
    .maybeSingle()
  return { entryId: own?.id ?? null, impersonating: false }
}
