import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Shared AI-usage audit logging.
 *
 * Writes one row per raw Anthropic-API-key call to the shared
 * `public.ai_api_usage` table in this app's Supabase project
 * (modjoikyuhqzouxvieua), so that cross-project AI spend can be reconciled
 * from a single table.
 *
 * STRICTLY fire-and-forget: every failure is swallowed. This must NEVER
 * block, slow, or break the request that triggered the AI call. Do not
 * `await` the returned promise in a hot path.
 */

export type AiUsageStatus = 'success' | 'error'

export interface AiUsageRow {
  /** Owning project. Always "football-predictor" from this repo. */
  project: string
  /** Feature label, e.g. `pundit:neverill`. */
  feature: string
  /** Anthropic model id, e.g. `claude-sonnet-4-20250514`. */
  model?: string | null
  /** This codebase calls Anthropic with a raw API key, so always "api_key". */
  billing_source: 'api_key'
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  /** Cost is computed downstream — omitted here. */
  cost_usd?: number | null
  /** Wall-clock duration of the API call in milliseconds. */
  request_ms?: number | null
  status: AiUsageStatus
  /** Reason string when status === "error". */
  error?: string | null
  /** Anthropic `message.id` from the response, when available. */
  anthropic_message_id?: string | null
  metadata?: Record<string, unknown> | null
}

/** Strip null/undefined fields so we only write what we actually have. */
function compact(row: AiUsageRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) {
      out[key] = value
    }
  }
  return out
}

/**
 * Fire-and-forget insert into `ai_api_usage`. Returns a promise that always
 * resolves (never rejects) — callers can ignore it. Any error (config,
 * network, DB) is caught and swallowed; at most a console.warn is emitted.
 */
export async function logAiUsage(row: AiUsageRow): Promise<void> {
  try {
    const admin = createAdminClient()
    // The shared `ai_api_usage` table is not in the generated Database types,
    // so reach past the typed client to insert a plain row.
    const { error } = await (admin as unknown as {
      from: (table: string) => {
        insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>
      }
    })
      .from('ai_api_usage')
      .insert(compact(row))

    if (error) {
      console.warn('[ai-usage-audit] insert failed:', error)
    }
  } catch (err) {
    // Swallow everything — auditing must never break the request.
    console.warn('[ai-usage-audit] logAiUsage threw (swallowed):', err)
  }
}
