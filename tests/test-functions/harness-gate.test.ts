import { describe, it, expect, afterEach, vi } from 'vitest'
import { testHarnessDisabledResponse } from '@/lib/test-harness-guard'

afterEach(() => vi.unstubAllEnvs())

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
