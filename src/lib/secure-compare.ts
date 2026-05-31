import { createHash, timingSafeEqual } from 'crypto'

/**
 * Constant-time string comparison for secrets (webhook/cron tokens).
 * Both inputs are SHA-256 hashed to equal-length buffers first, so the
 * comparison never short-circuits on length and leaks no timing information
 * about either the value or its length.
 */
export function secureEquals(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}
