'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { PlayerAvatar } from '@/components/ui/PlayerAvatar'
import type { Player } from '@/lib/types'

export default function ProfilePage() {
  const router = useRouter()
  const [player, setPlayer] = useState<Player | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState('')
  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setAuthUserId(user.id)

      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()

      if (data) {
        setPlayer(data)
        setDisplayName(data.display_name)
        setNickname(data.nickname ?? '')
        setAvatarUrl(data.avatar_url)
      }
      setLoading(false)
    }

    load()
  }, [router])

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !authUserId) return

    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' })
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be 2MB or smaller' })
      return
    }

    setUploading(true)
    setMessage(null)

    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const filePath = `${authUserId}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      setMessage({ type: 'error', text: `Upload failed: ${uploadError.message}` })
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath)

    // Append cache-buster to force reload
    const freshUrl = `${publicUrl}?t=${Date.now()}`
    setAvatarUrl(freshUrl)
    setUploading(false)
    setMessage({ type: 'success', text: 'Avatar uploaded — click Save to apply' })
  }

  async function handleSave() {
    if (!player) return
    setSaving(true)
    setMessage(null)

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: displayName,
        nickname: nickname || null,
        avatar_url: avatarUrl,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setMessage({ type: 'error', text: data.error || 'Failed to save' })
    } else {
      setPlayer(data)
      setMessage({ type: 'success', text: 'Profile updated!' })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-text-muted">Loading profile...</p>
      </div>
    )
  }

  if (!player) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-text-muted">Player not found.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-bold tracking-wider text-gold">
        Edit Profile
      </h1>

      <Card>
        <div className="space-y-6">
          {/* Avatar section */}
          <div className="flex flex-col items-center gap-3">
            <PlayerAvatar avatarUrl={avatarUrl} displayName={displayName || 'U'} size="lg" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
            >
              {uploading ? 'Uploading...' : 'Change Avatar'}
            </Button>
            <p className="text-xs text-text-muted">Max 2MB, image files only</p>
          </div>

          {/* Form fields */}
          <Input
            id="display_name"
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
          />

          <Input
            id="nickname"
            label="Nickname (optional)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
            placeholder="Shown in chat and leaderboard"
          />

          {/* Message */}
          {message && (
            <p className={message.type === 'success' ? 'text-sm text-green-accent' : 'text-sm text-red-accent'}>
              {message.text}
            </p>
          )}

          {/* Save button */}
          <Button onClick={handleSave} loading={saving} className="w-full">
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
