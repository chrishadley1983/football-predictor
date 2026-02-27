'use client'

import { useMemo } from 'react'
import type { Player } from '@/lib/types'

type PlayerInfo = Pick<Player, 'id' | 'display_name' | 'nickname'>

interface MentionAutocompleteProps {
  query: string
  players: PlayerInfo[]
  onSelect: (player: PlayerInfo) => void
  onClose: () => void
}

export function MentionAutocomplete({ query, players, onSelect, onClose }: MentionAutocompleteProps) {
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return players.filter((p) => {
      const dn = p.display_name.toLowerCase()
      const nn = (p.nickname || '').toLowerCase()
      return dn.includes(q) || nn.includes(q)
    }).slice(0, 6)
  }, [query, players])

  if (filtered.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-lg border border-border-custom bg-surface shadow-lg shadow-black/30">
      {filtered.map((player) => (
        <button
          key={player.id}
          onMouseDown={(e) => {
            e.preventDefault() // Prevent input blur
            onSelect(player)
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-surface-light"
        >
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gold text-[10px] font-bold text-black">
            {(player.nickname || player.display_name).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground">{player.display_name}</span>
            {player.nickname && player.nickname !== player.display_name && (
              <span className="ml-1.5 text-text-muted">({player.nickname})</span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
