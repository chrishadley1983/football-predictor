import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  testHarnessDisabledResponse,
  isTestTournamentSlug,
  nonTestTournamentResponse,
} from '@/lib/test-harness-guard'

afterEach(() => vi.unstubAllEnvs())

describe('test-tournament slug guard', () => {
  it('recognises only slugs ending in -test', () => {
    expect(isTestTournamentSlug('wc-2026-test')).toBe(true)
    expect(isTestTournamentSlug('wc-2022-test')).toBe(true)
    expect(isTestTournamentSlug('wc-2026')).toBe(false)
    expect(isTestTournamentSlug('euros-2024')).toBe(false)
  })

  it('blocks a real tournament with 403, allows a test tournament', () => {
    const blocked = nonTestTournamentResponse('wc-2026')
    expect(blocked).not.toBeNull()
    expect(blocked!.status).toBe(403)
    expect(nonTestTournamentResponse('wc-2026-test')).toBeNull()
  })
})

describe('testHarnessDisabledResponse', () => {
  it('is enabled (returns null) outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('ENABLE_TEST_HARNESS', '')
    expect(testHarnessDisabledResponse()).toBeNull()
  })

  it('is DISABLED (403) in production without the flag', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_TEST_HARNESS', '')
    const res = testHarnessDisabledResponse()
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
  })

  it('is enabled in production when ENABLE_TEST_HARNESS=true', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ENABLE_TEST_HARNESS', 'true')
    expect(testHarnessDisabledResponse()).toBeNull()
  })
})
