'use client'

import { useCallback, useRef, useState } from 'react'

const SOUND_KEY = 'chat-sound-enabled'

export function useChatSound() {
  // Lazy initializer: read the persisted preference once during render.
  // Guarded for SSR (no `window` on the server) so it never throws.
  const [enabled, setEnabled] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem(SOUND_KEY) === 'true'
  )
  const audioRef = useRef<AudioContext | null>(null)

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      localStorage.setItem(SOUND_KEY, String(next))
      return next
    })
  }, [])

  const play = useCallback(() => {
    if (!enabled) return
    if (document.hidden) return

    try {
      if (!audioRef.current) {
        audioRef.current = new AudioContext()
      }
      const ctx = audioRef.current
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()

      oscillator.connect(gain)
      gain.connect(ctx.destination)

      // Short pleasant ping
      oscillator.frequency.setValueAtTime(880, ctx.currentTime)
      oscillator.frequency.setValueAtTime(1320, ctx.currentTime + 0.05)
      oscillator.type = 'sine'
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.15)
    } catch {
      // AudioContext not available
    }
  }, [enabled])

  return { enabled, toggle, play }
}
