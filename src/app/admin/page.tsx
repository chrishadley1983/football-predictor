import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import SeedButton from './SeedButton'
import type { Tournament } from '@/lib/types'

export default async function AdminPage() {
  const supabase = await createClient()

  // Check admin access
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'admin') {
    redirect('/')
  }

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .order('year', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <div className="flex gap-2">
          <SeedButton />
          <Link
            href="/admin/tournaments/new"
            className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-light"
          >
            New Tournament
          </Link>
        </div>
      </div>

      {(!tournaments || tournaments.length === 0) ? (
        <p className="py-8 text-center text-sm text-text-muted">No tournaments yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {(tournaments as Tournament[]).map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{t.name}</h3>
                  <p className="text-sm text-text-muted">/{t.slug}</p>
                </div>
                <div className="flex items-center gap-3">
                  <TournamentStatusBadge status={t.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/admin/tournaments/${t.slug}/manage`}
                  className="rounded bg-surface-light px-3 py-1 text-xs font-medium text-text-secondary hover:bg-border-custom"
                >
                  Manage
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/setup`}
                  className="rounded bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/30"
                >
                  Setup
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/results`}
                  className="rounded bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/30"
                >
                  Results & Simulate
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/entries`}
                  className="rounded bg-surface-light px-3 py-1 text-xs font-medium text-text-secondary hover:bg-border-custom"
                >
                  Entries
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/posts`}
                  className="rounded bg-surface-light px-3 py-1 text-xs font-medium text-text-secondary hover:bg-border-custom"
                >
                  Posts
                </Link>
                <Link
                  href={`/tournament/${t.slug}`}
                  className="rounded bg-green-accent/20 px-3 py-1 text-xs font-medium text-green-accent hover:bg-green-accent/30"
                >
                  View Public
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
