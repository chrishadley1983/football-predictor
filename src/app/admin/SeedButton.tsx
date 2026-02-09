'use client'

import { useState } from 'react'

export default function SeedButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleSeed() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/admin/seed/wc2022', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResult(`Seeded: ${data.counts.teams} teams, ${data.counts.groups} groups, ${data.counts.knockout_matches} matches`)
      } else {
        setResult(`Error: ${data.error}`)
      }
    } catch {
      setResult('Network error')
    }
    setLoading(false)
  }

  return (
    <div className="relative">
      <button
        onClick={handleSeed}
        disabled={loading}
        className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
      >
        {loading ? 'Seeding...' : 'Seed WC 2022'}
      </button>
      {result && (
        <div className="absolute right-0 top-full mt-1 w-64 rounded border bg-white p-2 text-xs shadow-lg dark:bg-gray-800 dark:border-gray-600">
          {result}
        </div>
      )}
    </div>
  )
}
