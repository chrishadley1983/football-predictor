import { describe, it, expect } from 'vitest'
import { secureEquals } from '@/lib/secure-compare'

describe('secureEquals (constant-time secret comparison)', () => {
  it('returns true for identical strings', () => {
    expect(secureEquals('s3cr3t-token', 's3cr3t-token')).toBe(true)
  })
  it('returns false for different strings of equal length', () => {
    expect(secureEquals('aaaaaa', 'aaaaab')).toBe(false)
  })
  it('returns false for different-length strings (hashed → no length leak / no throw)', () => {
    expect(secureEquals('short', 'a-much-longer-secret-value')).toBe(false)
  })
  it('returns true for two empty strings', () => {
    expect(secureEquals('', '')).toBe(true)
  })
})
