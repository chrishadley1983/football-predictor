'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const SOUND_KEY = 'chat-sound-enabled'

export function useChatSound() {
  const [enabled, setEnabled] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem(SOUND_KEY)
    setEnabled(stored === 'true')
  }, [])

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
