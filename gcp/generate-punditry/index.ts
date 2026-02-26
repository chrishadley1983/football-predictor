import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'

/**
 * GCP Cloud Function that verifies daily punditry snippets were generated
 * and sends a Discord notification with the result.
 *
 * Called by Cloud Scheduler at 05:30 UTC (30 mins after local generation at 05:00).
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for DB access
 * - DISCORD_WEBHOOK_URL: Discord webhook for notifications
 * - TOURNAMENT_SLUG: The tournament slug (e.g., world-cup-2026)
 */

interface PunditCount {
  pundit_key: string
  count: number
}

async function sendDiscordMessage(webhookUrl: string, embed: Record<string, unknown>): Promise<void> {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  })
}

export async function verifyPunditry(req: Request, res: Response) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL
  const tournamentSlug = process.env.TOURNAMENT_SLUG

  if (!supabaseUrl || !supabaseKey || !tournamentSlug) {
    console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TOURNAMENT_SLUG')
    res.status(500).json({ error: 'Configuration error' })
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const today = new Date().toISOString().split('T')[0]

  // Get tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name')
    .eq('slug', tournamentSlug)
    .single()

  if (!tournament) {
    const message = `Tournament not found: ${tournamentSlug}`
    console.error(`[verify-punditry] ${message}`)

    if (discordWebhook) {
      await sendDiscordMessage(discordWebhook, {
        title: 'Punditry Verification Failed',
        description: message,
        color: 0xFF0000,
        timestamp: new Date().toISOString(),
      })
    }

    res.status(404).json({ error: message })
    return
  }

  // Count today's snippets by pundit
  const { data: counts, error } = await supabase
    .from('pundit_snippets')
    .select('pundit_key')
    .eq('tournament_id', tournament.id)
    .eq('generated_date', today)

  if (error) {
    const message = `Database query failed: ${error.message}`
    console.error(`[verify-punditry] ${message}`)

    if (discordWebhook) {
      await sendDiscordMessage(discordWebhook, {
        title: 'Punditry Verification Error',
        description: message,
        color: 0xFF0000,
        timestamp: new Date().toISOString(),
      })
    }

    res.status(500).json({ error: message })
    return
  }

  // Aggregate counts by pundit_key
  const punditCounts: Record<string, number> = {}
  for (const row of counts ?? []) {
    punditCounts[row.pundit_key] = (punditCounts[row.pundit_key] || 0) + 1
  }

  const totalSnippets = counts?.length ?? 0
  const expectedPundits = ['neverill', 'bright', 'meane', 'scaragher']
  const missingPundits = expectedPundits.filter((p) => !punditCounts[p] || punditCounts[p] < 10)

  if (totalSnippets >= 40 && missingPundits.length === 0) {
    // Success — all pundits have enough snippets
    const breakdown = expectedPundits
      .map((p) => `${p}: ${punditCounts[p] || 0}`)
      .join(' | ')

    console.log(`[verify-punditry] Success: ${totalSnippets} snippets (${breakdown})`)

    if (discordWebhook) {
      await sendDiscordMessage(discordWebhook, {
        title: 'Punditry Generation Complete',
        description: `**${totalSnippets} snippets** generated for ${tournament.name}`,
        color: 0x00CC66,
        fields: expectedPundits.map((p) => ({
          name: p.charAt(0).toUpperCase() + p.slice(1),
          value: `${punditCounts[p] || 0} snippets`,
          inline: true,
        })),
        footer: { text: `Date: ${today}` },
        timestamp: new Date().toISOString(),
      })
    }

    res.status(200).json({
      success: true,
      date: today,
      tournament: tournament.name,
      totalSnippets,
      breakdown: punditCounts,
    })
  } else {
    // Error — missing or insufficient snippets
    const breakdown = expectedPundits
      .map((p) => `${p}: ${punditCounts[p] || 0}`)
      .join(' | ')

    const message = totalSnippets === 0
      ? 'No snippets found for today. Local generation may have failed.'
      : `Only ${totalSnippets} snippets found (expected 60). Missing/low: ${missingPundits.join(', ')}`

    console.error(`[verify-punditry] ${message} (${breakdown})`)

    if (discordWebhook) {
      await sendDiscordMessage(discordWebhook, {
        title: 'Punditry Generation Issue',
        description: message,
        color: 0xFF4444,
        fields: [
          ...expectedPundits.map((p) => ({
            name: p.charAt(0).toUpperCase() + p.slice(1),
            value: `${punditCounts[p] || 0} snippets ${(punditCounts[p] || 0) < 10 ? '⚠️' : '✅'}`,
            inline: true,
          })),
          {
            name: 'Action Required',
            value: 'Check local Task Scheduler logs or run generation manually.',
            inline: false,
          },
        ],
        footer: { text: `Date: ${today}` },
        timestamp: new Date().toISOString(),
      })
    }

    res.status(200).json({
      success: false,
      date: today,
      tournament: tournament.name,
      totalSnippets,
      breakdown: punditCounts,
      missingPundits,
    })
  }
}
