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

/**
 * A tournament is a test tournament when its slug ends in "-test"
 * (e.g. wc-2026-test, wc-2022-test).
 */
export function isTestTournamentSlug(slug: string): boolean {
  return /-test$/.test(slug)
}

/**
 * Hard guard so the destructive test/seed/reset routes can NEVER mutate a real
 * tournament, even when the harness is explicitly enabled (e.g. in production so
 * admins can drive the test tournament). Returns a 403 unless the slug is a test
 * tournament.
 */
export function nonTestTournamentResponse(slug: string): NextResponse | null {
  if (isTestTournamentSlug(slug)) return null
  return NextResponse.json(
    {
      error:
        `Refusing to run a destructive test/seed/reset action on "${slug}". These routes only operate on test tournaments (slug ending in "-test").`,
    },
    { status: 403 }
  )
}
