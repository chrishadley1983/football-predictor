import { describe, it, expect } from 'vitest'
import { BADGE_INFO, BADGE_ORDER } from '@/lib/badge-info'

// The set of badge types the achievements engine can award.
const BADGE_TYPES = [
  'perfect_group',
  'early_bird',
  'last_minute',
  'lone_wolf',
  'hive_mind',
  'crystal_ball',
  'giant_killer',
  'hot_streak',
  'dead_heat',
  'contrarian',
  'golden_touch',
] as const

describe('badge-info', () => {
  it('has display info for every badge type', () => {
    for (const type of BADGE_TYPES) {
      expect(BADGE_INFO[type], `missing BADGE_INFO for ${type}`).toBeDefined()
      expect(BADGE_INFO[type].emoji.length).toBeGreaterThan(0)
      expect(BADGE_INFO[type].name.length).toBeGreaterThan(0)
      expect(BADGE_INFO[type].hint.length).toBeGreaterThan(0)
    }
  })

  it('BADGE_ORDER lists each badge type exactly once', () => {
    expect([...BADGE_ORDER].sort()).toEqual([...BADGE_TYPES].sort())
    expect(new Set(BADGE_ORDER).size).toBe(BADGE_ORDER.length)
  })

  it('BADGE_ORDER only references known badges', () => {
    for (const key of BADGE_ORDER) {
      expect(BADGE_INFO[key]).toBeDefined()
    }
  })
})
