'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [error, setError] = useState('')

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Please enter your email address')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMagicLinkSent(true)
    setLoading(false)
  }

  if (magicLinkSent) {
    return (
      <div className="mx-auto max-w-md pt-12">
        <Card>
          <div className="text-center">
            <h2 className="text-lg font-bold text-foreground">Check your email</h2>
            <p className="mt-2 text-sm text-text-secondary">
              We sent a login link to <strong>{email}</strong>. Click the link to sign in.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md pt-12">
      <Card header={<h1 className="text-xl font-bold text-foreground">Login</h1>}>
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">
              {error}
            </div>
          )}

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
            placeholder="Enter your password"
          />

          <Button type="submit" loading={loading} className="w-full">
            Sign in with password
          </Button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-custom" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-surface px-2 text-text-muted">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            loading={loading}
            onClick={handleMagicLink}
            className="w-full"
          >
            Send magic link
          </Button>

          <p className="text-center text-sm text-text-secondary">
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" className="font-medium text-gold hover:text-gold-light">
              Register
            </Link>
          </p>
        </form>
      </Card>
    </div>
  )
}
