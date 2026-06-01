'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Toggles email_notifications_enabled = false for the player whose
 * unsubscribe_token matches. Authorisation is by possession of the token
 * (an unguessable UUID emailed to the player).
 *
 * Returns silently on success — the page rerenders and shows the "done" state.
 * Validation of the token's existence happens in the page itself; this action
 * trusts the input and idempotently sets the flag.
 */
export async function unsubscribeAction(token: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('players')
    .update({ email_notifications_enabled: false })
    .eq('unsubscribe_token', token)

  if (error) {
    console.error('[unsubscribe] update failed', { token, error })
    throw new Error('Could not update preferences. Please try again.')
  }

  revalidatePath(`/unsubscribe/${token}`)
}
