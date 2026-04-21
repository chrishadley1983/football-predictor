'use client'

import { useState } from 'react'

type SeedTarget = { label: string; endpoint: string; className: string }

const TARGETS: SeedTarget[] = [
  {
    label: 'Seed WC 2026',
    endpoint: '/api/admin/seed/wc2026',
    className: 'bg-gold text-black hover:bg-gold-light',
  },
  {
    label: 'Seed WC 2022',
    endpoint: '/api/admin/seed/wc2022',
    className: 'bg-orange-600 text-white hover:bg-orange-700',
  },
]

export default function SeedButton() {
  const [loadingEndpoint, setLoadingEndpoint] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function handleSeed(target: SeedTarget) {
    setLoadingEndpoint(target.endpoint)
    setResult(null)
    try {
      const res = await fetch(target.endpoint, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const parts = [
          `${data.counts.teams} teams`,
          `${data.counts.groups} groups`,
          data.counts.group_matches != null ? `${data.counts.group_matches} group matches` : null,
          `${data.counts.knockout_matches} knockout matches`,
        ].filter(Boolean)
        setResult(`${target.label}: ${parts.join(', ')}`)
      } else {
        setResult(`Error: ${data.error}`)
      }
    } catch {
      setResult('Network error')
    }
    setLoadingEndpoint(null)
  }

  return (
    <div className="relative flex gap-2">
      {TARGETS.map((target) => (
        <button
          key={target.endpoint}
          onClick={() => handleSeed(target)}
          disabled={loadingEndpoint !== null}
          className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${target.className}`}
        >
          {loadingEndpoint === target.endpoint ? 'Seeding...' : target.label}
        </button>
      ))}
      {result && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded border border-border-custom bg-surface p-2 text-xs shadow-lg">
          {result}
        </div>
      )}
    </div>
  )
}
