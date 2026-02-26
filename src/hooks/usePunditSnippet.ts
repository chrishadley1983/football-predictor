'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PunditKey, PunditCategory } from '@/lib/types'

export interface PunditSnippetData {
  pundit_key: PunditKey
  name: string
  content: string
  category: PunditCategory
  color: string
}

export function usePunditSnippet(tournamentSlug: string) {
  const [snippet, setSnippet] = useState<PunditSnippetData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSnippet = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentSlug}/pundit`)
      if (!res.ok) {
        setSnippet(null)
        return
      }
      const data = await res.json()
      if (data.pundit_key) {
        setSnippet(data as PunditSnippetData)
      } else {
        setSnippet(null)
      }
    } catch {
      setSnippet(null)
    } finally {
      setLoading(false)
    }
  }, [tournamentSlug])

  useEffect(() => {
    fetchSnippet()
  }, [fetchSnippet])

  const refresh = useCallback(() => {
    setLoading(true)
    fetchSnippet()
  }, [fetchSnippet])

  return { snippet, loading, refresh }
}
