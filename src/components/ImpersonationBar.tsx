'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const COOKIE = 'impersonate_entry'

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

interface EntryOption {
  id: string
  name: string
}

/**
 * Admin-only "Step into [Player]" control (testing). Lets an admin view and play
 * the tournament as any entrant. Sets a cookie that the server pages/API routes
 * honour (admin-checked server-side, so a forged cookie does nothing).
 */
export function ImpersonationBar({ slug }: { slug: string }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [entries, setEntries] = useState<EntryOption[]>([])
  // Read once on mount (lazy init avoids a synchronous setState in an effect).
  const [current] = useState<string | null>(() =>
    typeof document !== 'undefined' ? readCookie(COOKIE) : null
  )
  const [selected, setSelected] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user?.app_metadata?.role !== 'admin') {
        setIsAdmin(false)
        return
      }
      setIsAdmin(true)
      const { data: tournament } = await supabase
        .from('tournaments')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (!tournament) return
      const { data: rows } = await supabase
        .from('tournament_entries')
        .select('id, player:players!tournament_entries_player_id_fkey ( display_name, nickname )')
        .eq('tournament_id', tournament.id)
      const list: EntryOption[] = (rows ?? [])
        .map((r) => {
          const p = r.player as unknown as { display_name: string; nickname: string | null } | null
          return { id: r.id, name: p?.nickname ?? p?.display_name ?? 'Unknown' }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
      setEntries(list)
    })
  }, [slug])

  if (!isAdmin) return null

  const currentName = entries.find((e) => e.id === current)?.name

  function stepInto() {
    if (!selected) return
    document.cookie = `${COOKIE}=${selected}; path=/; max-age=86400`
    window.location.reload()
  }
  function stop() {
    document.cookie = `${COOKIE}=; path=/; max-age=0`
    window.location.reload()
  }

  return (
    <div className="fixed bottom-3 left-3 z-50 max-w-[92vw] rounded-xl border border-gold/40 bg-surface/95 px-3 py-2 text-xs shadow-lg shadow-black/40 backdrop-blur">
      {current ? (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gold/20 px-2 py-0.5 font-bold text-gold">Admin</span>
          <span className="text-foreground">
            👤 Viewing as <strong>{currentName ?? 'player'}</strong>
          </span>
          <button
            onClick={stop}
            className="rounded-md bg-red-accent/20 px-2 py-1 font-medium text-red-accent hover:bg-red-accent/30"
          >
            Stop
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gold/20 px-2 py-0.5 font-bold text-gold">Admin</span>
          <span className="text-text-secondary">Step into a player:</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="max-w-[40vw] rounded-md border border-border-custom bg-surface-light px-2 py-1 text-foreground"
          >
            <option value="">— choose ({entries.length}) —</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            onClick={stepInto}
            disabled={!selected}
            className="rounded-md bg-gold px-2 py-1 font-medium text-surface hover:bg-gold/90 disabled:opacity-40"
          >
            Step in
          </button>
        </div>
      )}
    </div>
  )
}
