import { NextResponse } from 'next/server'

/**
 * Guards destructive test/seed/reset routes so they cannot run in production
 * by accident. These routes perform mass deletes (entries, predictions,
 * results, even test players) against the live database and are intended only
 * for development/demo use.
 *
 * Enabled when EITHER:
 *   - ENABLE_TEST_HARNESS === 'true' (explicit opt-in, e.g. a staging env), OR
 *   - NODE_ENV !== 'production' (normal local development)
 *
 * Returns a 403 NextResponse when disabled, otherwise null.
 *
 * Usage at the top of a route handler:
 *   const blocked = testHarnessDisabledResponse()
 *   if (blocked) return blocked
 */
export function testHarnessDisabledResponse(): NextResponse | null {
  const enabled =
    process.env.ENABLE_TEST_HARNESS === 'true' || process.env.NODE_ENV !== 'production'
  if (enabled) return null
  return NextResponse.json(
    {
      error:
        'Test harness routes are disabled in this environment. Set ENABLE_TEST_HARNESS=true to allow.',
    },
    { status: 403 }
  )
}
