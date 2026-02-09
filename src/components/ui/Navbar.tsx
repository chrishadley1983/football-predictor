'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import type { Player } from '@/lib/types'

export function Navbar() {
  const pathname = usePathname()
  const [player, setPlayer] = useState<Player | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setPlayer(null)
        setIsAdmin(false)
        return
      }

      setIsAdmin(user.app_metadata?.role === 'admin')

      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      setPlayer(data ?? null)
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setPlayer(null)
    setIsAdmin(false)
    window.location.href = '/'
  }

  // Extract tournament slug from path if we're on a tournament page
  const tournamentMatch = pathname.match(/^\/tournament\/([^/]+)/)
  const tournamentSlug = tournamentMatch ? tournamentMatch[1] : null

  const linkClass = (active: boolean) =>
    cn(
      'text-sm font-medium transition-colors hover:text-gold',
      active ? 'text-gold' : 'text-text-secondary'
    )

  const mobileLinkClass = 'block rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-light'

  return (
    <nav className="border-b border-border-custom bg-surface/85 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-heading text-lg font-bold tracking-wider text-gold">
            Prediction Game
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <Link href="/honours" className={linkClass(pathname === '/honours')}>
              Honours
            </Link>

            {tournamentSlug && (
              <>
                <Link href={`/tournament/${tournamentSlug}`} className={linkClass(pathname === `/tournament/${tournamentSlug}`)}>
                  Overview
                </Link>
                <Link href={`/tournament/${tournamentSlug}/leaderboard`} className={linkClass(pathname.includes('/leaderboard'))}>
                  Leaderboard
                </Link>
                <Link href={`/tournament/${tournamentSlug}/predictions`} className={linkClass(pathname.includes('/predictions') && !pathname.includes('/predict/'))}>
                  Predictions
                </Link>
                <Link href={`/tournament/${tournamentSlug}/posts`} className={linkClass(pathname.includes('/posts'))}>
                  Posts
                </Link>
                <Link href={`/tournament/${tournamentSlug}/chat`} className={linkClass(pathname.includes('/chat'))}>
                  Chat
                </Link>
              </>
            )}

            {isAdmin && (
              <Link href="/admin" className={linkClass(pathname.startsWith('/admin'))}>
                Admin
              </Link>
            )}

            {player ? (
              <div className="flex items-center gap-3">
                <Link href="/profile" className="flex items-center gap-2 transition-colors hover:text-gold">
                  <PlayerAvatar avatarUrl={player.avatar_url} displayName={player.display_name} size="sm" />
                  <span className="text-sm text-text-secondary">
                    {player.display_name}
                  </span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-text-muted hover:text-red-accent"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/auth/login"
                  className="text-sm font-medium text-text-secondary hover:text-gold"
                >
                  Login
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-md bg-gold px-3 py-1.5 text-sm font-medium text-black hover:bg-gold-light"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:bg-surface-light md:hidden"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-border-custom md:hidden">
          <div className="space-y-1 px-4 py-3">
            <Link href="/honours" className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
              Honours
            </Link>

            {tournamentSlug && (
              <>
                <Link href={`/tournament/${tournamentSlug}`} className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
                  Overview
                </Link>
                <Link href={`/tournament/${tournamentSlug}/leaderboard`} className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
                  Leaderboard
                </Link>
                <Link href={`/tournament/${tournamentSlug}/predictions`} className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
                  Predictions
                </Link>
                <Link href={`/tournament/${tournamentSlug}/posts`} className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
                  Posts
                </Link>
                <Link href={`/tournament/${tournamentSlug}/chat`} className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
                  Chat
                </Link>
              </>
            )}

            {isAdmin && (
              <Link href="/admin" className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
                Admin
              </Link>
            )}

            {player ? (
              <div className="border-t border-border-custom pt-2">
                <Link href="/profile" className="flex items-center gap-2 px-3 py-1" onClick={() => setMenuOpen(false)}>
                  <PlayerAvatar avatarUrl={player.avatar_url} displayName={player.display_name} size="sm" />
                  <span className="text-sm text-text-muted">{player.display_name}</span>
                </Link>
                <button
                  onClick={() => { handleLogout(); setMenuOpen(false) }}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-accent hover:bg-surface-light"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="border-t border-border-custom pt-2">
                <Link href="/auth/login" className={mobileLinkClass} onClick={() => setMenuOpen(false)}>
                  Login
                </Link>
                <Link href="/auth/register" className="block rounded-md px-3 py-2 text-sm font-medium text-gold hover:bg-surface-light" onClick={() => setMenuOpen(false)}>
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
