import 'server-only'
import { Resend } from 'resend'

let cachedClient: Resend | null = null
let warnedMissing = false

export function getResendClient(): Resend | null {
  if (cachedClient) return cachedClient

  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (!warnedMissing) {
      const prod = process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production'
      const level = prod ? 'error' : 'warn'
      console[level]('[audit-email] RESEND_API_KEY not set — audit emails will no-op')
      warnedMissing = true
    }
    return null
  }

  cachedClient = new Resend(key)
  return cachedClient
}

export function isAuditEmailEnabled(): boolean {
  return process.env.AUDIT_EMAIL_ENABLED !== 'false'
}
