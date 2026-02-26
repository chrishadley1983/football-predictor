import type { Request, Response } from '@google-cloud/functions-framework'

/**
 * GCP Cloud Function that triggers daily punditry generation.
 * Called by Cloud Scheduler at 06:00 UTC.
 *
 * Environment variables required:
 * - VERCEL_URL: The Vercel deployment URL (e.g., football-predictor-six.vercel.app)
 * - CRON_SECRET: Shared secret for authenticating with the Vercel endpoint
 * - TOURNAMENT_SLUG: The tournament slug to generate punditry for
 */
export async function generatePunditry(req: Request, res: Response) {
  const vercelUrl = process.env.VERCEL_URL
  const cronSecret = process.env.CRON_SECRET
  const tournamentSlug = process.env.TOURNAMENT_SLUG

  if (!vercelUrl || !cronSecret || !tournamentSlug) {
    console.error('Missing required environment variables: VERCEL_URL, CRON_SECRET, TOURNAMENT_SLUG')
    res.status(500).json({ error: 'Configuration error' })
    return
  }

  const endpoint = `https://${vercelUrl}/api/admin/tournaments/${tournamentSlug}/generate-punditry`

  console.log(`[generate-punditry] Triggering generation for ${tournamentSlug} at ${endpoint}`)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      console.error(`[generate-punditry] Vercel endpoint returned ${response.status}:`, data)
      res.status(response.status).json(data)
      return
    }

    console.log('[generate-punditry] Generation complete:', data)
    res.status(200).json(data)
  } catch (err) {
    console.error('[generate-punditry] Failed to call Vercel endpoint:', err)
    res.status(500).json({ error: 'Failed to trigger generation' })
  }
}
