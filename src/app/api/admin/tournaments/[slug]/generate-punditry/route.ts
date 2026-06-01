import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getPunditSystemPrompt } from '@/lib/pundit-prompts'
import { PUNDIT_KEYS } from '@/lib/pundit-characters'
import { PUNDIT_PLAYER_IDS } from '@/lib/pundit-players'
import { secureEquals } from '@/lib/secure-compare'
import type { PunditKey, PunditCategory } from '@/lib/types'

interface SnippetOutput {
  content: string
  category: string
}

async function generateForPundit(
  punditKey: PunditKey,
  context: Parameters<typeof getPunditSystemPrompt>[1]
): Promise<SnippetOutput[]> {
  const systemPrompt = getPunditSystemPrompt(punditKey, context)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
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

    // Parse JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error(`[generate-punditry] No JSON array found in response for ${punditKey}:`, text.slice(0, 200))
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
      console.error(`[generate-punditry] Timeout for ${punditKey} (30s)`)
    } else {
      console.error(`[generate-punditry] Error for ${punditKey}:`, err)
    }
    return []
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Auth: check cron secret OR admin user
  const cronSecret = request.headers.get('x-cron-secret')
  const expectedSecret = process.env.CRON_SECRET

  if (cronSecret && expectedSecret && secureEquals(cronSecret, expectedSecret)) {
    // Authenticated via cron secret
  } else {
    // Fall back to admin user check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.app_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()

  // Get tournament
  const { data: tournament } = await admin
    .from('tournaments')
    .select('id, name, status')
    .eq('slug', slug)
    .single()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }

  // Gather context
  const [leaderboardRes, predictionsRes, resultsRes, chatRes] = await Promise.all([
    // Top 10 leaderboard
    admin
      .from('tournament_entries')
      .select('player:players(display_name, nickname), total_points, overall_rank, group_stage_points, knockout_points')
      .eq('tournament_id', tournament.id)
      .order('overall_rank', { ascending: true, nullsFirst: false })
      .limit(10),
    // Prediction summary — count per team for group winners
    admin
      .from('group_predictions')
      .select('predicted_1st, predicted_2nd, entry:tournament_entries!inner(tournament_id)')
      .eq('entry.tournament_id', tournament.id)
      .limit(200),
    // Latest match results
    admin
      .from('group_matches')
      .select('home_score, away_score, home_team:teams!group_matches_home_team_id_fkey(name), away_team:teams!group_matches_away_team_id_fkey(name)')
      .not('home_score', 'is', null)
      .order('sort_order', { ascending: false })
      .limit(10),
    // Recent chat messages
    admin
      .from('chat_messages')
      .select('content, player:players(display_name, nickname)')
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Format context strings
  const leaderboardSummary = (leaderboardRes.data ?? [])
    .map((e) => {
      const p = e.player as unknown as { display_name: string; nickname: string | null }
      const name = p?.nickname ?? p?.display_name ?? 'Unknown'
      return `#${e.overall_rank ?? '?'} ${name} - ${e.total_points}pts (Group: ${e.group_stage_points}, KO: ${e.knockout_points})`
    })
    .join('\n') || 'No leaderboard data yet.'

  const predictionsSummary = (predictionsRes.data ?? []).length > 0
    ? `${predictionsRes.data!.length} group predictions submitted across all players.`
    : 'No predictions data available yet.'

  const resultsSummary = (resultsRes.data ?? [])
    .map((m) => {
      const home = (m.home_team as unknown as { name: string })?.name ?? '?'
      const away = (m.away_team as unknown as { name: string })?.name ?? '?'
      return `${home} ${m.home_score}-${m.away_score} ${away}`
    })
    .join('\n') || 'No results yet.'

  const chatSummary = (chatRes.data ?? [])
    .map((c) => {
      const p = c.player as unknown as { display_name: string; nickname: string | null }
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

  // Delete existing snippets for today (idempotent)
  const today = new Date().toISOString().split('T')[0]
  await admin
    .from('pundit_snippets')
    .delete()
    .eq('tournament_id', tournament.id)
    .eq('generated_date', today)

  // Generate for all 4 pundits
  const validCategories: PunditCategory[] = ['leaderboard', 'predictions', 'results', 'chat', 'news', 'wildcard']
  const results: Record<string, number> = {}
  let totalInserted = 0

  for (const punditKey of PUNDIT_KEYS) {
    try {
      const snippets = await generateForPundit(punditKey, context)
      results[punditKey] = snippets.length

      if (snippets.length > 0) {
        const rows = snippets.map((s) => ({
          tournament_id: tournament.id,
          pundit_key: punditKey,
          content: s.content,
          category: (validCategories.includes(s.category as PunditCategory) ? s.category : 'wildcard') as PunditCategory,
          generated_date: today,
        }))

        const { error } = await admin.from('pundit_snippets').insert(rows)
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

  // Post at most ONE pundit chat message per day (total), from a single pundit's
  // substantive take (results/predictions/leaderboard) — never a chat-about-chat
  // snippet. The bubble/card rotates through all of today's snippets separately.
  let chatMessagesInserted = 0
  try {
    // If a pundit already posted to chat today, don't add another (one per day).
    const { data: postedToday } = await admin
      .from('chat_messages')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('message_type', 'pundit')
      .gte('created_at', `${today}T00:00:00Z`)
      .limit(1)

    if (!postedToday || postedToday.length === 0) {
      const { data: todaySnippets } = await admin
        .from('pundit_snippets')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('generated_date', today)
        .neq('category', 'chat')

      if (todaySnippets && todaySnippets.length > 0) {
        // Prefer football-substance categories, then pick one at random within
        // the best available tier (varies the pundit/take day to day).
        const PREFERRED: PunditCategory[] = ['results', 'predictions', 'leaderboard', 'news', 'wildcard']
        const bestRank = Math.min(
          ...todaySnippets.map((s) => {
            const r = PREFERRED.indexOf(s.category as PunditCategory)
            return r === -1 ? PREFERRED.length : r
          })
        )
        const tier = todaySnippets.filter((s) => {
          const r = PREFERRED.indexOf(s.category as PunditCategory)
          return (r === -1 ? PREFERRED.length : r) === bestRank
        })
        const chosen = tier[Math.floor(Math.random() * tier.length)]

        const { error: chatErr } = await admin.from('chat_messages').insert({
          tournament_id: tournament.id,
          player_id: PUNDIT_PLAYER_IDS[chosen.pundit_key as PunditKey],
          content: chosen.content,
          message_type: 'pundit' as const,
          metadata: { pundit_key: chosen.pundit_key, snippet_id: chosen.id },
          created_at: new Date().toISOString(),
        })
        if (chatErr) {
          console.error('[generate-punditry] Failed to insert chat message:', chatErr.message)
        } else {
          chatMessagesInserted = 1
        }
      }
    }
  } catch (err) {
    console.error('[generate-punditry] Error inserting chat message:', err)
  }

  return NextResponse.json({
    success: true,
    date: today,
    tournament: tournament.name,
    generated: results,
    totalInserted,
    chatMessagesInserted,
  })
}
