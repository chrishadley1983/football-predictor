import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TournamentStatusBadge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Admin Dashboard</h1>
        <Link
          href="/admin/tournaments/new"
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          New Tournament
        </Link>
      </div>

      {(!tournaments || tournaments.length === 0) ? (
        <p className="py-8 text-center text-sm text-gray-500">No tournaments yet. Create one to get started.</p>
      ) : (
        <div className="space-y-3">
          {(tournaments as Tournament[]).map((t) => (
            <Card key={t.id}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">/{t.slug}</p>
                </div>
                <div className="flex items-center gap-3">
                  <TournamentStatusBadge status={t.status} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/admin/tournaments/${t.slug}/manage`}
                  className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Manage
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/entries`}
                  className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Entries
                </Link>
                <Link
                  href={`/admin/tournaments/${t.slug}/posts`}
                  className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Posts
                </Link>
                <Link
                  href={`/tournament/${t.slug}`}
                  className="rounded bg-green-100 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
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
