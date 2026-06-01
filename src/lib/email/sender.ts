import 'server-only'
import { AUDIT_FROM } from './recipients'

/**
 * Resolve the From address used for PLAYER-facing transactional mail
 * (welcome, prediction confirmations, knockout-open announcement).
 *
 * Falls back to AUDIT_FROM ('onboarding@resend.dev') if PLAYER_EMAIL_FROM is
 * unset. The fallback only delivers to the Resend account owner — anyone else
 * will see the mail go nowhere — so it's only safe for local dev.
 */
export function getPlayerEmailFrom(): string {
  return process.env.PLAYER_EMAIL_FROM?.trim() || AUDIT_FROM
}

/**
 * Resolve the canonical site URL for building absolute links in outbound mail.
 * Strips a trailing slash so callers can safely concatenate `${siteUrl()}/path`.
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

export function buildUnsubscribeUrl(token: string): string {
  return `${getSiteUrl()}/unsubscribe/${encodeURIComponent(token)}`
}
