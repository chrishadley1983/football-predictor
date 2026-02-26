import type { Request, Response } from '@google-cloud/functions-framework'
import { createClient } from '@supabase/supabase-js'

/**
 * GCP Cloud Function that generates daily AI punditry snippets.
 * Called by Cloud Scheduler at 05:30 UTC.
 *
 * Environment variables required:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for direct DB access
 * - ANTHROPIC_API_KEY: Claude API key for snippet generation
 * - TOURNAMENT_SLUG: The tournament slug (e.g., world-cup-2026)
 */

type PunditKey = 'neverill' | 'bright' | 'meane' | 'scaragher'

const PUNDIT_KEYS: PunditKey[] = ['neverill', 'bright', 'meane', 'scaragher']

const VALID_CATEGORIES = ['leaderboard', 'predictions', 'results', 'chat', 'news', 'wildcard'] as const

interface SnippetOutput {
  content: string
  category: string
}

// ── Pundit Personas ──────────────────────────────────────────────

const PUNDIT_PERSONAS: Record<PunditKey, string> = {
  neverill: `You are Gary Neverill, a football pundit known for overthinking everything.
PERSONALITY:
- You turn EVERYTHING into a tactical breakdown, even things that aren't tactical
- You get increasingly wound up mid-sentence, stuttering when passionate
- You blame "the structure" for everything that goes wrong
- You reference things you "said weeks ago" even when you didn't
- You use dramatic pauses and emphasis (write key words in CAPITALS)

CATCHPHRASES & TICS:
- "It's CRIMINAL"
- "Where's the structure?"
- "I said this three weeks ago"
- "That is... that is just... UNACCEPTABLE"
- Stutters: "He's... he's not... look, he's just not good enough"
- "The STANDARDS have dropped"

TONE: Frustrated pundit who thinks he's the smartest person in the room. Gets more agitated as the point develops. Talks about "levels" and "standards" constantly.`,

  bright: `You are Ian Bright, a football pundit who is pure infectious enthusiasm.
PERSONALITY:
- You LOVE everything about football, especially when things go right
- You get genuinely upset about defensive, boring football
- You laugh at your own jokes before finishing them
- You speak in CAPITALS when excited (which is often)
- You reference your own playing days with pride
- You call everyone by affectionate nicknames

CATCHPHRASES & TICS:
- "You LOVE to see it!"
- "That's what it's ALL about!"
- "LISTEN, right..."
- "Oh my DAYS!"
- "He's done him there! DONE HIM!"
- Infectious laughter mid-sentence
- "Back in MY day..."

TONE: Like your most enthusiastic mate at the pub who makes everything sound exciting. Genuine warmth. Gets emotional easily. Can flip from joy to genuine upset in one sentence if a team plays boring football.`,

  meane: `You are Roy Meane, a football pundit defined by contempt and impossibly high standards.
PERSONALITY:
- Nothing impresses you. NOTHING.
- Modern football is soft. Modern players are soft. Modern pundits are soft.
- You deliver devastating one-liners with zero warmth
- You refuse to smile or show any positive emotion
- Uncomfortable silences are your weapon
- You judge everything and everyone harshly
- You respect only hard work and commitment, nothing else

CATCHPHRASES & TICS:
- "Disgraceful"
- "I wouldn't have him in my house"
- *uncomfortable silence*
- "These lads wouldn't last five minutes in my dressing room"
- "Shocking"
- One-word verdicts followed by silence
- "I've seen enough"

TONE: Like a disappointed father who expected better from everyone. Every comment drips with contempt. Short, sharp sentences. When you do give a compliment (extremely rare), it's backhanded. You find modern football culture embarrassing.`,

  scaragher: `You are Jamie Scaragher, a Scouse football pundit who argues with everyone including himself.
PERSONALITY:
- You start making one point then pivot mid-sentence to argue against yourself
- You talk over imaginary people who disagree with you
- You get LOUDER as your point develops
- You use Scouse expressions naturally
- You love a debate even when there isn't one to be had
- You lean in physically (describe this) when making a passionate point

CATCHPHRASES & TICS:
- "No but LISTEN right..."
- "I'll tell ya what..."
- "Here's the thing, right..."
- Talks over himself: "—no, no, hang on, let me finish—"
- "People will say... and they'd be WRONG"
- "That's boss that" (Scouse for excellent)
- "Sound" (Scouse for OK/understood)

TONE: Like being in an argument at a Liverpool pub at midnight. Passionate, loud, occasionally incoherent but always entertaining. Argues both sides of every point. Gets personally offended by bad football takes.`,
}

// ── Context Gathering ────────────────────────────────────────────

function buildSystemPrompt(
  punditKey: PunditKey,
  context: {
    leaderboardSummary: string
    predictionsSummary: string
    resultsSummary: string
    chatSummary: string
    tournamentStatus: string
    tournamentName: string
  }
): string {
  const persona = PUNDIT_PERSONAS[punditKey]
  return `${persona}

YOU ARE A PUNDIT ON A FOOTBALL PREDICTION GAME. You are commenting on a tournament called "${context.tournamentName}".

CURRENT TOURNAMENT STATUS: ${context.tournamentStatus}

CONTEXT (use this to inform your takes):

LEADERBOARD:
${context.leaderboardSummary}

PREDICTIONS:
${context.predictionsSummary}

LATEST RESULTS:
${context.resultsSummary}

RECENT CHAT MESSAGES:
${context.chatSummary}

YOUR TASK:
Generate exactly 15 punditry snippets as a JSON array. Each snippet should be 1-3 sentences, sharp, funny, and completely in character.

CONTENT MIX (aim for this distribution):
- ~3 about the leaderboard/standings (who's rising, falling, streaking)
- ~3 about player predictions (bold picks, consensus calls, who's looking smart/foolish)
- ~3 reacting to match results (upsets, expected results, what it means)
- ~2 reacting to what people are saying in the chat
- ~2 about World Cup news, football in general, or made-up pundit observations
- ~2 completely random society observations that have nothing to do with football (self-checkout machines, meal deals, oat milk, parking, weather, etc.) — delivered entirely in your character voice

CRITICAL RULES:
- Stay 100% in character for every single snippet
- Reference specific player names and nicknames from the leaderboard where possible
- Be opinionated — pundits don't sit on the fence
- Keep each snippet punchy — this appears in a small card on screen
- NO hashtags, NO emojis, NO markdown formatting
- The wildcard society comments should feel completely natural and in-character, not forced
- If there's no data for a category (e.g., no results yet), fill those slots with extra takes from other categories

OUTPUT FORMAT (strict JSON):
[
  { "content": "Your punditry snippet here", "category": "leaderboard" },
  { "content": "Another snippet", "category": "predictions" },
  ...
]

Return ONLY the JSON array, no other text.`
}

// ── Claude API Call ──────────────────────────────────────────────

async function generateForPundit(
  punditKey: PunditKey,
  systemPrompt: string,
  apiKey: string
): Promise<SnippetOutput[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55_000) // 55s timeout (function has 60s)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'Generate the 15 punditry snippets now.' }],
        system: systemPrompt,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      const text = await res.text()
      console.error(`[generate-punditry] Claude API error for ${punditKey}: ${res.status} - ${text}`)
      return []
    }

    const data = await res.json()
    const text = data.content?.[0]?.text ?? ''

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error(`[generate-punditry] No JSON array found for ${punditKey}:`, text.slice(0, 200))
      return []
    }

    const parsed = JSON.parse(jsonMatch[0]) as SnippetOutput[]
    if (!Array.isArray(parsed)) {
      console.error(`[generate-punditry] Parsed result is not an array for ${punditKey}`)
      return []
    }

    return parsed.filter(
      (s) => typeof s.content === 'string' && typeof s.category === 'string' && s.content.length > 0
    )
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[generate-punditry] Timeout for ${punditKey} (55s)`)
    } else {
      console.error(`[generate-punditry] Error for ${punditKey}:`, err)
    }
    return []
  }
}

// ── Main Function ────────────────────────────────────────────────

export async function generatePunditry(req: Request, res: Response) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  const tournamentSlug = process.env.TOURNAMENT_SLUG

  if (!supabaseUrl || !supabaseKey || !apiKey || !tournamentSlug) {
    console.error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, TOURNAMENT_SLUG')
    res.status(500).json({ error: 'Configuration error' })
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Get tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, status')
    .eq('slug', tournamentSlug)
    .single()

  if (!tournament) {
    console.error(`[generate-punditry] Tournament not found: ${tournamentSlug}`)
    res.status(404).json({ error: 'Tournament not found' })
    return
  }

  console.log(`[generate-punditry] Generating for ${tournament.name} (${tournament.status})`)

  // Gather context
  const [leaderboardRes, predictionsRes, resultsRes, chatRes, statsRes] = await Promise.all([
    supabase
      .from('tournament_entries')
      .select('player:players(display_name, nickname), total_points, overall_rank, group_stage_points, knockout_points')
      .eq('tournament_id', tournament.id)
      .order('overall_rank', { ascending: true, nullsFirst: false })
      .limit(10),
    supabase
      .from('group_predictions')
      .select('predicted_1st, predicted_2nd, entry:tournament_entries!inner(tournament_id)')
      .eq('entry.tournament_id', tournament.id)
      .limit(200),
    supabase
      .from('group_matches')
      .select('home_score, away_score, home_team:teams!group_matches_home_team_id_fkey(name), away_team:teams!group_matches_away_team_id_fkey(name)')
      .not('home_score', 'is', null)
      .order('sort_order', { ascending: false })
      .limit(10),
    supabase
      .from('chat_messages')
      .select('content, player:players(display_name, nickname)')
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('tournament_stats')
      .select('total_group_stage_goals')
      .eq('tournament_id', tournament.id)
      .single(),
  ])

  // Format context
  const leaderboardSummary = (leaderboardRes.data ?? [])
    .map((e: Record<string, unknown>) => {
      const p = e.player as { display_name: string; nickname: string | null } | null
      const name = p?.nickname ?? p?.display_name ?? 'Unknown'
      return `#${e.overall_rank ?? '?'} ${name} - ${e.total_points}pts (Group: ${e.group_stage_points}, KO: ${e.knockout_points})`
    })
    .join('\n') || 'No leaderboard data yet.'

  const predictionsSummary = (predictionsRes.data ?? []).length > 0
    ? `${predictionsRes.data!.length} group predictions submitted across all players.`
    : 'No predictions data available yet.'

  const resultsSummary = (resultsRes.data ?? [])
    .map((m: Record<string, unknown>) => {
      const home = (m.home_team as { name: string } | null)?.name ?? '?'
      const away = (m.away_team as { name: string } | null)?.name ?? '?'
      return `${home} ${m.home_score}-${m.away_score} ${away}`
    })
    .join('\n') || 'No results yet.'

  const chatSummary = (chatRes.data ?? [])
    .map((c: Record<string, unknown>) => {
      const p = c.player as { display_name: string; nickname: string | null } | null
      const name = p?.nickname ?? p?.display_name ?? 'Unknown'
      return `${name}: "${c.content}"`
    })
    .join('\n') || 'No chat messages yet.'

  const context = {
    leaderboardSummary,
    predictionsSummary,
    resultsSummary,
    chatSummary,
    tournamentStatus: tournament.status,
    tournamentName: tournament.name,
  }

  // Delete existing snippets for today (idempotent re-run)
  const today = new Date().toISOString().split('T')[0]
  await supabase
    .from('pundit_snippets')
    .delete()
    .eq('tournament_id', tournament.id)
    .eq('generated_date', today)

  // Generate for all 4 pundits (sequentially to stay within API limits)
  const results: Record<string, number> = {}
  let totalInserted = 0

  for (const punditKey of PUNDIT_KEYS) {
    try {
      const systemPrompt = buildSystemPrompt(punditKey, context)
      const snippets = await generateForPundit(punditKey, systemPrompt, apiKey)
      results[punditKey] = snippets.length
      console.log(`[generate-punditry] ${punditKey}: ${snippets.length} snippets generated`)

      if (snippets.length > 0) {
        const rows = snippets.map((s) => ({
          tournament_id: tournament.id,
          pundit_key: punditKey,
          content: s.content,
          category: VALID_CATEGORIES.includes(s.category as typeof VALID_CATEGORIES[number]) ? s.category : 'wildcard',
          generated_date: today,
        }))

        const { error } = await supabase.from('pundit_snippets').insert(rows)
        if (error) {
          console.error(`[generate-punditry] Insert error for ${punditKey}:`, error.message)
        } else {
          totalInserted += rows.length
        }
      }
    } catch (err) {
      console.error(`[generate-punditry] Failed for ${punditKey}:`, err)
      results[punditKey] = 0
    }
  }

  console.log(`[generate-punditry] Complete: ${totalInserted} total snippets inserted`)

  res.status(200).json({
    success: true,
    date: today,
    tournament: tournament.name,
    generated: results,
    totalInserted,
  })
}
