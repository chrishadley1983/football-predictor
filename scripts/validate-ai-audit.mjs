#!/usr/bin/env node
/**
 * validate-ai-audit.mjs
 *
 * Production-validation for the shared AI-usage audit logging.
 *
 * What this does:
 *   1. Prints the curl you can run to trigger punditry generation on
 *      production (which is what causes rows to be written).
 *   2. Reads the shared `public.ai_api_usage` table in the Supabase project
 *      `modjoikyuhqzouxvieua`, filtered to project="football-predictor" and
 *      created within the last 15 minutes.
 *   3. Prints PASS/FAIL plus the matched rows.
 *
 * Why a SERVICE-ROLE key is required:
 *   `ai_api_usage` is insert-only under RLS — the anon / publishable key can
 *   INSERT but CANNOT SELECT. Reading the rows back therefore needs a
 *   service-role key, supplied via the AI_USAGE_SERVICE_KEY env var (NOT
 *   committed; export it in your shell before running).
 *
 * Usage:
 *   AI_USAGE_SERVICE_KEY=<service-role-jwt> node scripts/validate-ai-audit.mjs
 *
 * Optional env:
 *   AI_USAGE_SUPABASE_URL   override the Supabase URL
 *                           (default https://modjoikyuhqzouxvieua.supabase.co)
 *   AI_USAGE_WINDOW_MIN     lookback window in minutes (default 15)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.AI_USAGE_SUPABASE_URL || 'https://modjoikyuhqzouxvieua.supabase.co'
const SERVICE_KEY = process.env.AI_USAGE_SERVICE_KEY
const PROJECT = 'football-predictor'
const WINDOW_MIN = Number(process.env.AI_USAGE_WINDOW_MIN || 15)

// Production host that serves the generate-punditry route.
const PROD_BASE = 'https://beta.footballpredictiongame.com'

function printTriggerInstructions() {
  console.log('━'.repeat(72))
  console.log('STEP 1 — Trigger punditry generation on production')
  console.log('━'.repeat(72))
  console.log(
    `
Punditry generation calls the Anthropic API once per pundit (4 calls), each of
which writes a row to ai_api_usage. To force a fresh generation, POST to the
route with the cron secret and ?force=true (replace <SLUG> and <CRON_SECRET>):

  curl -i -X POST \\
    "${PROD_BASE}/api/admin/tournaments/<SLUG>/generate-punditry?force=true" \\
    -H "x-cron-secret: <CRON_SECRET>"

(<CRON_SECRET> is the CRON_SECRET env var configured in Vercel. <SLUG> is the
tournament slug, e.g. "world-cup-2026".)

Wait a few seconds for the fire-and-forget inserts to land, then this script
checks the table.
`.trim()
  )
  console.log('')
}

async function main() {
  printTriggerInstructions()

  console.log('━'.repeat(72))
  console.log('STEP 2 — Read ai_api_usage (service-role key required)')
  console.log('━'.repeat(72))

  if (!SERVICE_KEY) {
    console.error(
      '\nFAIL: AI_USAGE_SERVICE_KEY is not set.\n' +
        'ai_api_usage is insert-only under RLS — the anon/publishable key cannot\n' +
        'SELECT. Re-run with a service-role key:\n\n' +
        '  AI_USAGE_SERVICE_KEY=<service-role-jwt> node scripts/validate-ai-audit.mjs\n'
    )
    process.exit(2)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const sinceIso = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString()
  console.log(
    `\nQuerying ${SUPABASE_URL}\n  project = "${PROJECT}"\n  created_at >= ${sinceIso} (last ${WINDOW_MIN} min)\n`
  )

  const { data, error } = await supabase
    .from('ai_api_usage')
    .select('*')
    .eq('project', PROJECT)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('\nFAIL: query errored:', error.message || error)
    process.exit(1)
  }

  const rows = data ?? []

  console.log('━'.repeat(72))
  console.log('RESULT')
  console.log('━'.repeat(72))

  if (rows.length === 0) {
    console.log(
      `\nFAIL: 0 rows for project="${PROJECT}" in the last ${WINDOW_MIN} minutes.\n` +
        'Did you trigger generation (Step 1) within the window? Note generation is\n' +
        'idempotent per day unless you pass ?force=true.\n'
    )
    process.exit(1)
  }

  console.log(`\nPASS: found ${rows.length} row(s) in the last ${WINDOW_MIN} minutes:\n`)
  for (const r of rows) {
    console.log(
      [
        `  • ${r.created_at}`,
        `feature=${r.feature}`,
        `model=${r.model ?? '-'}`,
        `status=${r.status}`,
        `in=${r.input_tokens ?? '-'}`,
        `out=${r.output_tokens ?? '-'}`,
        `ms=${r.request_ms ?? '-'}`,
        r.anthropic_message_id ? `msg=${r.anthropic_message_id}` : '',
        r.error ? `error=${String(r.error).slice(0, 80)}` : '',
      ]
        .filter(Boolean)
        .join('  ')
    )
  }
  console.log('')
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFAIL: unexpected error:', err)
  process.exit(1)
})
