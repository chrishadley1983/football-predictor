'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface GifResult {
  id: string
  url: string
  preview: string
  width: number
  height: number
}

interface GifPickerProps {
  onSelect: (gifUrl: string) => void
  onClose: () => void
}

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GifResult[]>([])
  const [loading, setLoading] = useState(false)
  const [trending, setTrending] = useState<GifResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Load trending on mount
  useEffect(() => {
    fetchGifs('football soccer goal celebration').then(setTrending)
  }, [])

  async function fetchGifs(searchQuery: string): Promise<GifResult[]> {
    const apiKey = 'AIzaSyDnfNQBCz7W6GRqQ_TSfqvSCKNF3pnqsZc' // Tenor public API key
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQuery)}&key=${apiKey}&limit=20&media_filter=gif,tinygif&contentfilter=medium`
    try {
      const res = await fetch(url)
      if (!res.ok) return []
      const data = await res.json()
      return (data.results ?? []).map((r: Record<string, unknown>) => {
        const media = r.media_formats as Record<string, { url: string; dims: number[] }>
        return {
          id: r.id as string,
          url: media.gif?.url ?? '',
          preview: media.tinygif?.url ?? media.gif?.url ?? '',
          width: media.tinygif?.dims?.[0] ?? 200,
          height: media.tinygif?.dims?.[1] ?? 150,
        }
      })
    } catch {
      return []
    }
  }

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      const gifs = await fetchGifs(value)
      setResults(gifs)
      setLoading(false)
    }, 400)
  }, [])

  const displayGifs = query.trim() ? results : trending

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border border-border-custom bg-surface shadow-xl"
    >
      <div className="border-b border-border-custom p-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search GIFs..."
            autoFocus
            className="flex-1 rounded-md border border-border-custom bg-surface-light px-3 py-1.5 text-sm text-foreground placeholder:text-text-muted focus:border-gold focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-text-muted hover:text-foreground"
            aria-label="Close GIF picker"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {!query.trim() && (
          <p className="mt-1 text-[10px] text-text-muted">Trending football GIFs</p>
        )}
      </div>
      <div className="grid max-h-64 grid-cols-2 gap-1 overflow-y-auto p-2">
        {loading ? (
          <div className="col-span-2 py-8 text-center text-sm text-text-muted">Searching...</div>
        ) : displayGifs.length === 0 ? (
          <div className="col-span-2 py-8 text-center text-sm text-text-muted">
            {query.trim() ? 'No GIFs found' : 'Loading...'}
          </div>
        ) : (
          displayGifs.map((gif) => (
            <button
              key={gif.id}
              onClick={() => onSelect(gif.url)}
              className="overflow-hidden rounded-md transition-opacity hover:opacity-80"
            >
              <img
                src={gif.preview}
                alt="GIF"
                loading="lazy"
                className="h-auto w-full object-cover"
                style={{ aspectRatio: `${gif.width}/${gif.height}` }}
              />
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border-custom px-2 py-1">
        <p className="text-[9px] text-text-muted">Powered by Tenor</p>
      </div>
    </div>
  )
}
