import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { unsubscribeAction } from './actions'

export const dynamic = 'force-dynamic'

type Player = {
  display_name: string
  email: string
  email_notifications_enabled: boolean
}

async function loadPlayer(token: string): Promise<Player | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('players')
    .select('display_name, email, email_notifications_enabled')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  return data
}

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const player = await loadPlayer(token)

  if (!player) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <Card header={<h1 className="text-xl font-bold text-foreground">Link not found</h1>}>
          <p className="text-sm text-text-secondary">
            This unsubscribe link is invalid or has expired. If you&apos;re trying to stop emails
            from Freemo&apos;s Prediction Game, sign in and update your preferences in your profile.
          </p>
        </Card>
      </div>
    )
  }

  if (!player.email_notifications_enabled) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <Card header={<h1 className="text-xl font-bold text-foreground">You&apos;re unsubscribed</h1>}>
          <p className="text-sm text-text-secondary">
            <strong className="text-foreground">{player.email}</strong> won&apos;t receive any
            more transactional emails from Freemo&apos;s Prediction Game. You can re-enable them
            from your profile page after signing in.
          </p>
        </Card>
      </div>
    )
  }

  // Bind the token into the server action so the form has no client-side state.
  const submit = unsubscribeAction.bind(null, token)

  return (
    <div className="mx-auto max-w-md pt-12">
      <Card header={<h1 className="text-xl font-bold text-foreground">Unsubscribe</h1>}>
        <p className="mb-4 text-sm text-text-secondary">
          Stop sending transactional emails (welcome, prediction confirmations, knockout
          announcements) to <strong className="text-foreground">{player.email}</strong>?
        </p>
        <form action={submit}>
          <Button type="submit" className="w-full">
            Confirm unsubscribe
          </Button>
        </form>
        <p className="mt-4 text-xs text-text-secondary">
          You can re-enable emails any time from your profile page after signing in.
        </p>
      </Card>
    </div>
  )
}
