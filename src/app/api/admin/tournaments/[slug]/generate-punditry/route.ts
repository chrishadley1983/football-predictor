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
    .select('id, name, status, group_stage_deadline')
    .eq('slug', slug)
    .single()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }

  // Pre-tournament = predictions are still open (first match hasn't happened
  // yet, modelled as "now is before the group-stage prediction deadline").
  // Drives both chat-post frequency below AND prompt nudging downstream.
  const isPreTournament =
    tournament.group_stage_deadline != null &&
    new Date(tournament.group_stage_deadline).getTime() > Date.now()

  // Gather context. We fetch raw rows for per-group prediction consensus rather
  // than a pre-aggregated count because the pundit prompt benefits from real
  // team-by-team picks ("Brazil 5, Argentina 2").
  const [
    leaderboardRes,
    predictionsRes,
    entriesRes,
    groupsRes,
    teamsRes,
    resultsRes,
    chatRes,
  ] = await Promise.all([
    admin
      .from('tournament_entries')
      .select('player:players(display_name, nickname), total_points, overall_rank, group_stage_points, knockout_points')
      .eq('tournament_id', tournament.id)
      .order('overall_rank', { ascending: true, nullsFirst: false })
      .limit(10),
    admin
      .from('group_predictions')
      .select('group_id, predicted_1st, predicted_2nd, predicted_3rd, entry:tournament_entries!inner(tournament_id)')
      .eq('entry.tournament_id', tournament.id)
      .limit(500),
    admin
      .from('tournament_entries')
      .select('tiebreaker_goals')
      .eq('tournament_id', tournament.id),
    admin
      .from('groups')
      .select('id, name, sort_order')
      .eq('tournament_id', tournament.id)
      .order('sort_order'),
    admin.from('teams').select('id, name, code'),
    admin
      .from('group_matches')
      .select('home_score, away_score, home_team:teams!group_matches_home_team_id_fkey(name), away_team:teams!group_matches_away_team_id_fkey(name)')
      .not('home_score', 'is', null)
      .order('sort_order', { ascending: false })
      .limit(10),
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

  const predictionsSummary = buildPredictionsSummary({
    predictions: predictionsRes.data ?? [],
    entries: entriesRes.data ?? [],
    groups: groupsRes.data ?? [],
    teams: teamsRes.data ?? [],
  })

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

  // Generate the day's snippets once. The chat post is spread across several
  // scheduled runs per day, and we don't want each run re-calling Claude — so
  // only (re)generate when forced (the admin button) or when today has none yet.
  const today = new Date().toISOString().split('T')[0]
  const force = request.nextUrl.searchParams.get('force') === 'true'

  const { count: existingForToday } = await admin
    .from('pundit_snippets')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournament.id)
    .eq('generated_date', today)

  const validCategories: PunditCategory[] = ['leaderboard', 'predictions', 'results', 'chat', 'news', 'wildcard']
  const results: Record<string, number> = {}
  let totalInserted = 0

  if (force || (existingForToday ?? 0) === 0) {
    // Clear today's snippets, then regenerate (capped at 3 per pundit).
    await admin
      .from('pundit_snippets')
      .delete()
      .eq('tournament_id', tournament.id)
      .eq('generated_date', today)

    for (const punditKey of PUNDIT_KEYS) {
      try {
        // Cap at 3 per pundit even if the model over-produces — these feed the
        // pop-up/card rotation and we want it tight.
        const snippets = (await generateForPundit(punditKey, context)).slice(0, 3)
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
  }

  // Chat-post cadence: exactly ONE pundit posts to chat per day, rotating through
  // the four pundits in order (neverill -> bright -> meane -> scaragher -> ...).
  // Multiple cron runs per day are idempotent: once any pundit has posted today
  // we stop, so the chat gets a single take a day regardless of run frequency.
  let chatMessagesInserted = 0
  try {
    const { data: postedToday } = await admin
      .from('chat_messages')
      .select('player_id')
      .eq('tournament_id', tournament.id)
      .eq('message_type', 'pundit')
      .gte('created_at', `${today}T00:00:00Z`)

    const shouldPost = (postedToday ?? []).length === 0
    if (shouldPost) {
      // Rotate to the pundit after whoever posted most recently. Starting from
      // that point we walk the full cycle so that, if the next pundit happens to
      // have no usable snippets today, the slot still gets filled by the one
      // after them rather than going silent.
      const playerIdToKey = new Map(
        PUNDIT_KEYS.map((k) => [PUNDIT_PLAYER_IDS[k], k] as const)
      )
      const { data: lastPundit } = await admin
        .from('chat_messages')
        .select('player_id')
        .eq('tournament_id', tournament.id)
        .eq('message_type', 'pundit')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const lastKey = lastPundit ? playerIdToKey.get(lastPundit.player_id) : undefined
      const lastIndex = lastKey ? PUNDIT_KEYS.indexOf(lastKey) : -1
      const startIndex = (lastIndex + 1) % PUNDIT_KEYS.length
      const rotation = PUNDIT_KEYS.map(
        (_, i) => PUNDIT_KEYS[(startIndex + i) % PUNDIT_KEYS.length]
      )

      for (const punditKey of rotation) {
        const { data: snips } = await admin
          .from('pundit_snippets')
          .select('*')
          .eq('tournament_id', tournament.id)
          .eq('generated_date', today)
          .eq('pundit_key', punditKey)
          .neq('category', 'chat')

        if (!snips || snips.length === 0) continue

        // Prefer football-substance categories, then pick one at random in tier.
        const PREFERRED: PunditCategory[] = ['results', 'predictions', 'leaderboard', 'news', 'wildcard']
        const rank = (c: string) => {
          const r = PREFERRED.indexOf(c as PunditCategory)
          return r === -1 ? PREFERRED.length : r
        }
        const bestRank = Math.min(...snips.map((s) => rank(s.category)))
        const tier = snips.filter((s) => rank(s.category) === bestRank)
        const chosen = tier[Math.floor(Math.random() * tier.length)]

        const { error: chatErr } = await admin.from('chat_messages').insert({
          tournament_id: tournament.id,
          player_id: PUNDIT_PLAYER_IDS[punditKey],
          content: chosen.content,
          message_type: 'pundit' as const,
          metadata: { pundit_key: punditKey, snippet_id: chosen.id },
          created_at: new Date().toISOString(),
        })
        if (chatErr) {
          console.error('[generate-punditry] Failed to insert chat message:', chatErr.message)
        } else {
          chatMessagesInserted = 1
        }
        break
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
    isPreTournament,
  })
}

// Build a human-readable per-group consensus from raw predictions so the
// pundits have concrete picks to roast — chalk vs contrarian, popular 1sts,
// tiebreaker spread — rather than just a row count.
function buildPredictionsSummary({
  predictions,
  entries,
  groups,
  teams,
}: {
  predictions: Array<{
    group_id: string
    predicted_1st: string | null
    predicted_2nd: string | null
    predicted_3rd: string | null
  }>
  entries: Array<{ tiebreaker_goals: number | null }>
  groups: Array<{ id: string; name: string; sort_order: number }>
  teams: Array<{ id: string; name: string; code: string }>
}): string {
  if (predictions.length === 0) {
    return 'No group predictions submitted yet.'
  }

  const teamName = new Map(teams.map((t) => [t.id, t.name]))

  function tally(values: Array<string | null>): Array<[string, number]> {
    const counts = new Map<string, number>()
    for (const v of values) {
      if (!v) continue
      counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }

  function fmt(top: Array<[string, number]>, max: number): string {
    return top
      .slice(0, max)
      .map(([id, n]) => `${teamName.get(id) ?? 'Unknown'} (${n})`)
      .join(', ')
  }

  const lines: string[] = []
  const totalEntries = entries.length

  for (const g of groups) {
    const gp = predictions.filter((p) => p.group_id === g.id)
    if (gp.length === 0) continue
    const firsts = tally(gp.map((p) => p.predicted_1st))
    const seconds = tally(gp.map((p) => p.predicted_2nd))
    const thirds = tally(gp.map((p) => p.predicted_3rd))

    const parts = [
      `1st: ${fmt(firsts, 3) || '—'}`,
      `2nd: ${fmt(seconds, 3) || '—'}`,
    ]
    if (thirds.length > 0) {
      parts.push(`3rd picked: ${fmt(thirds, 3)}`)
    }
    lines.push(`${g.name} (${gp.length}/${totalEntries} entries) — ${parts.join('. ')}`)
  }

  const tbs = entries
    .map((e) => e.tiebreaker_goals)
    .filter((x): x is number => x != null)
  if (tbs.length > 0) {
    const min = Math.min(...tbs)
    const max = Math.max(...tbs)
    const avg = Math.round(tbs.reduce((s, x) => s + x, 0) / tbs.length)
    lines.push(
      `Tiebreaker (total group-stage goals) across ${tbs.length} entries: min ${min}, max ${max}, avg ${avg}.`,
    )
  } else {
    lines.push('No tiebreakers submitted yet.')
  }

  return lines.join('\n')
}
