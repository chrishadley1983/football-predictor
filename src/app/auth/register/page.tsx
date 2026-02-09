'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export default function RegisterPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!displayName.trim()) {
      setError('Display name is required')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    const supabase = createClient()

    // Register with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (!authData.user) {
      setError('Registration failed. Please try again.')
      setLoading(false)
      return
    }

    // Create player record
    const { error: playerError } = await supabase.from('players').insert({
      auth_user_id: authData.user.id,
      display_name: displayName.trim(),
      nickname: nickname.trim() || null,
      email,
    })

    if (playerError) {
      setError(playerError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-md pt-12">
      <Card header={<h1 className="text-xl font-bold text-foreground">Register</h1>}>
        <form onSubmit={handleRegister} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">
              {error}
            </div>
          )}

          <Input
            label="Display Name"
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="John Smith"
          />

          <Input
            label="Nickname (optional)"
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Kelly the Octopus"
          />

          <Input
            label="Email"
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />

          <Input
            label="Password"
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="At least 6 characters"
          />

          <Button type="submit" loading={loading} className="w-full">
            Create Account
          </Button>

          <p className="text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-medium text-gold hover:text-gold-light">
              Login
            </Link>
          </p>
        </form>
      </Card>
    </div>
  )
}
