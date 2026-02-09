'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card } from '@/components/ui/Card'
import { slugify } from '@/lib/utils'

export default function NewTournamentPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.app_metadata?.role !== 'admin') {
        window.location.href = '/'
      }
    })
  }, [])

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [type, setType] = useState('world_cup')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [entryFee, setEntryFee] = useState('10.00')
  const [groupPrizePct, setGroupPrizePct] = useState('25')
  const [overallPrizePct, setOverallPrizePct] = useState('75')
  const [groupDeadline, setGroupDeadline] = useState('')
  const [knockoutDeadline, setKnockoutDeadline] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleNameChange(value: string) {
    setName(value)
    setSlug(slugify(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        slug,
        type,
        year: parseInt(year, 10),
        entry_fee_gbp: parseFloat(entryFee),
        group_stage_prize_pct: parseInt(groupPrizePct, 10),
        overall_prize_pct: parseInt(overallPrizePct, 10),
        group_stage_deadline: groupDeadline || null,
        knockout_stage_deadline: knockoutDeadline || null,
        status: 'draft',
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Failed to create tournament')
      setLoading(false)
      return
    }

    router.push('/admin')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-heading text-2xl font-bold text-foreground">Create New Tournament</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-accent/10 p-3 text-sm text-red-accent">
              {error}
            </div>
          )}

          <Input
            label="Tournament Name"
            id="name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            placeholder="e.g. World Cup 2026"
          />

          <Input
            label="Slug"
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            placeholder="e.g. wc-2026"
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Type"
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={[
                { value: 'world_cup', label: 'World Cup' },
                { value: 'euros', label: 'Euros' },
              ]}
            />

            <Input
              label="Year"
              id="year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Entry Fee (GBP)"
              id="entryFee"
              type="number"
              step="0.01"
              min="0"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              required
            />

            <Input
              label="Overall Prize %"
              id="overallPrizePct"
              type="number"
              min="0"
              max="100"
              value={overallPrizePct}
              onChange={(e) => setOverallPrizePct(e.target.value)}
              required
            />

            <Input
              label="Group Prize %"
              id="groupPrizePct"
              type="number"
              min="0"
              max="100"
              value={groupPrizePct}
              onChange={(e) => setGroupPrizePct(e.target.value)}
              required
            />
          </div>

          <Input
            label="Group Stage Deadline"
            id="groupDeadline"
            type="datetime-local"
            value={groupDeadline}
            onChange={(e) => setGroupDeadline(e.target.value)}
          />

          <Input
            label="Knockout Stage Deadline"
            id="knockoutDeadline"
            type="datetime-local"
            value={knockoutDeadline}
            onChange={(e) => setKnockoutDeadline(e.target.value)}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Create Tournament
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push('/admin')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
