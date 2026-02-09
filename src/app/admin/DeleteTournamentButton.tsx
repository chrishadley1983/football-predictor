'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteTournamentButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true)
      return
    }

    setDeleting(true)
    const res = await fetch(`/api/admin/tournaments/${slug}`, { method: 'DELETE' })

    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to delete tournament')
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      onBlur={() => setConfirming(false)}
      disabled={deleting}
      className={
        confirming
          ? 'rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700'
          : 'rounded bg-red-accent/20 px-3 py-1 text-xs font-medium text-red-accent hover:bg-red-accent/30'
      }
    >
      {deleting ? 'Deleting...' : confirming ? `Delete ${name}?` : 'Delete'}
    </button>
  )
}
