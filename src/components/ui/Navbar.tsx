'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
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

  return (
    <nav className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-green-700 dark:text-green-400">
            Prediction Game
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <Link
              href="/honours"
              className={cn(
                'text-sm font-medium transition-colors hover:text-green-600',
                pathname === '/honours' ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'
              )}
            >
              Honours
            </Link>

            {tournamentSlug && (
              <>
                <Link
                  href={`/tournament/${tournamentSlug}`}
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-green-600',
                    pathname === `/tournament/${tournamentSlug}` ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  Overview
                </Link>
                <Link
                  href={`/tournament/${tournamentSlug}/leaderboard`}
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-green-600',
                    pathname.includes('/leaderboard') ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  Leaderboard
                </Link>
                <Link
                  href={`/tournament/${tournamentSlug}/predictions`}
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-green-600',
                    pathname.includes('/predictions') && !pathname.includes('/predict/') ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  Predictions
                </Link>
                <Link
                  href={`/tournament/${tournamentSlug}/posts`}
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-green-600',
                    pathname.includes('/posts') ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'
                  )}
                >
                  Posts
                </Link>
              </>
            )}

            {isAdmin && (
              <Link
                href="/admin"
                className={cn(
                  'text-sm font-medium transition-colors hover:text-green-600',
                  pathname.startsWith('/admin') ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-300'
                )}
              >
                Admin
              </Link>
            )}

            {player ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {player.display_name}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-sm font-medium text-gray-500 hover:text-red-600 dark:text-gray-400"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/auth/login"
                  className="text-sm font-medium text-gray-600 hover:text-green-600 dark:text-gray-300"
                >
                  Login
                </Link>
                <Link
                  href="/auth/register"
                  className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
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
        <div className="border-t border-gray-200 md:hidden dark:border-gray-700">
          <div className="space-y-1 px-4 py-3">
            <Link href="/honours" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
              Honours
            </Link>

            {tournamentSlug && (
              <>
                <Link href={`/tournament/${tournamentSlug}`} className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
                  Overview
                </Link>
                <Link href={`/tournament/${tournamentSlug}/leaderboard`} className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
                  Leaderboard
                </Link>
                <Link href={`/tournament/${tournamentSlug}/predictions`} className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
                  Predictions
                </Link>
                <Link href={`/tournament/${tournamentSlug}/posts`} className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
                  Posts
                </Link>
              </>
            )}

            {isAdmin && (
              <Link href="/admin" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
                Admin
              </Link>
            )}

            {player ? (
              <>
                <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                  <span className="block px-3 py-1 text-sm text-gray-500 dark:text-gray-400">{player.display_name}</span>
                  <button
                    onClick={() => { handleLogout(); setMenuOpen(false) }}
                    className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                <Link href="/auth/login" className="block rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
                  Login
                </Link>
                <Link href="/auth/register" className="block rounded-md px-3 py-2 text-sm font-medium text-green-600 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={() => setMenuOpen(false)}>
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
