'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import type { Tournament } from '@/lib/types'

export default function EnterTournamentPage() {
  const { slug } = useParams<{ slug: string }>()
  const router = useRouter()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)
  const [entering, setEntering] = useState(false)
  const [error, setError] = useState('')
  const [alreadyEntered, setAlreadyEntered] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/tournaments/${slug}`)
      if (!res.ok) {
        setError('Tournament not found')
        setLoading(false)
        return
      }
      const data = await res.json()
      setTournament(data)

      // Check if already entered
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('auth_user_id', user.id)
          .single()

        if (player) {
          const { data: entry } = await supabase
            .from('tournament_entries')
            .select('id')
            .eq('tournament_id', data.id)
            .eq('player_id', player.id)
            .single()

          if (entry) setAlreadyEntered(true)
        }
      }

      setLoading(false)
    }
    load()
  }, [slug])

  async function handleEnter() {
    setEntering(true)
    setError('')

    const res = await fetch(`/api/tournaments/${slug}/enter`, {
      method: 'POST',
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to enter tournament')
      setEntering(false)
      return
    }

    router.push(`/tournament/${slug}/predict/groups`)
  }

  if (loading) {
    return <p className="py-12 text-center text-gray-500">Loading...</p>
  }

  if (!tournament) {
    return <p className="py-12 text-center text-red-600">Tournament not found</p>
  }

  return (
    <div className="mx-auto max-w-md pt-8">
      <Card header={<h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Enter {tournament.name}</h1>}>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="rounded-md bg-gray-50 p-4 dark:bg-gray-800">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">Entry Fee</h3>
            <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-400">
              &pound;{tournament.entry_fee_gbp.toFixed(2)}
            </p>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">Payment</h3>
            <p className="mt-1">
              Payment is collected manually by the tournament organiser. After registering,
              the admin will confirm your payment. You can still submit predictions before payment is confirmed.
            </p>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">What you get</h3>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>Predict group stage outcomes</li>
              <li>Fill in the knockout bracket</li>
              <li>Compete on the leaderboard</li>
              <li>Win prizes based on your predictions</li>
            </ul>
          </div>

          {alreadyEntered ? (
            <div className="rounded-md bg-green-50 p-3 text-center text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              You are already entered in this tournament.
            </div>
          ) : (
            <Button onClick={handleEnter} loading={entering} className="w-full" size="lg">
              Enter Tournament
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
