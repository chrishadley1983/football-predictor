import { createAdminClient } from '@/lib/supabase/admin'
import { Card } from '@/components/ui/Card'

interface Props {
  tournamentId: string
  /** Number of days forward to include, inclusive of today. Default 3 = today + next 2. */
  windowDays?: number
}

interface FixtureRow {
  id: string
  scheduled_at: string
  venue: string | null
  stadium: string | null
  home_name: string
  home_flag: string | null
  away_name: string
  away_flag: string | null
  home_score: number | null
  away_score: number | null
  context: string
}

// Tournament-home widget: "Today & next 2 days" fixture strip with live/final
// scores once written by sync-results. Renders on the server using the service
// role because group_matches is readable to anon (RLS allows it) but the
// service-role read avoids any unintended row filtering.
export async function UpcomingFixtures({ tournamentId, windowDays = 3 }: Props) {
  const admin = createAdminClient()

  const now = new Date()
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + windowDays)

  type GMRow = {
    id: string
    scheduled_at: string | null
    venue: string | null
    stadium: string | null
    home_score: number | null
    away_score: number | null
    home_team: { name: string; flag_emoji: string | null } | null
    away_team: { name: string; flag_emoji: string | null } | null
    group: { name: string; tournament_id: string } | null
  }

  type KMRow = {
    id: string
    scheduled_at: string | null
    venue: string | null
    stadium: string | null
    home_score: number | null
    away_score: number | null
    round: string
    home_team: { name: string; flag_emoji: string | null } | null
    away_team: { name: string; flag_emoji: string | null } | null
  }

  const groupSelect =
    'id, scheduled_at, venue, stadium, home_score, away_score, ' +
    'home_team:teams!group_matches_home_team_id_fkey(name, flag_emoji), ' +
    'away_team:teams!group_matches_away_team_id_fkey(name, flag_emoji), ' +
    'group:groups!inner(name, tournament_id)'

  const koSelect =
    'id, scheduled_at, venue, stadium, home_score, away_score, round, ' +
    'home_team:teams!knockout_matches_home_team_id_fkey(name, flag_emoji), ' +
    'away_team:teams!knockout_matches_away_team_id_fkey(name, flag_emoji)'

  const [{ data: groupMatches }, { data: koMatches }] = await Promise.all([
    admin
      .from('group_matches')
      .select(groupSelect)
      .eq('group.tournament_id', tournamentId)
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: true }),
    admin
      .from('knockout_matches')
      .select(koSelect)
      .eq('tournament_id', tournamentId)
      .gte('scheduled_at', start.toISOString())
      .lt('scheduled_at', end.toISOString())
      .order('scheduled_at', { ascending: true }),
  ])

  const rows: FixtureRow[] = []
  for (const m of (groupMatches ?? []) as unknown as GMRow[]) {
    if (!m.scheduled_at) continue
    rows.push({
      id: m.id,
      scheduled_at: m.scheduled_at,
      venue: m.venue,
      stadium: m.stadium,
      home_name: m.home_team?.name ?? 'TBC',
      home_flag: m.home_team?.flag_emoji ?? null,
      away_name: m.away_team?.name ?? 'TBC',
      away_flag: m.away_team?.flag_emoji ?? null,
      home_score: m.home_score,
      away_score: m.away_score,
      context: m.group?.name ?? 'Group',
    })
  }
  for (const m of (koMatches ?? []) as unknown as KMRow[]) {
    if (!m.scheduled_at) continue
    rows.push({
      id: m.id,
      scheduled_at: m.scheduled_at,
      venue: m.venue,
      stadium: m.stadium,
      home_name: m.home_team?.name ?? 'TBC',
      home_flag: m.home_team?.flag_emoji ?? null,
      away_name: m.away_team?.name ?? 'TBC',
      away_flag: m.away_team?.flag_emoji ?? null,
      home_score: m.home_score,
      away_score: m.away_score,
      context: roundLabel(m.round),
    })
  }
  rows.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))

  // Fallback: if the window has no fixtures, surface the single next upcoming
  // match so the card stays useful in the run-up to and after the tournament.
  let nextFixtureFallback = false
  if (rows.length === 0) {
    const [{ data: nextGroup }, { data: nextKo }] = await Promise.all([
      admin
        .from('group_matches')
        .select(groupSelect)
        .eq('group.tournament_id', tournamentId)
        .gte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      admin
        .from('knockout_matches')
        .select(koSelect)
        .eq('tournament_id', tournamentId)
        .gte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    const candidates: FixtureRow[] = []
    const g = nextGroup as unknown as GMRow | null
    if (g?.scheduled_at) {
      candidates.push({
        id: g.id,
        scheduled_at: g.scheduled_at,
        venue: g.venue,
        stadium: g.stadium,
        home_name: g.home_team?.name ?? 'TBC',
        home_flag: g.home_team?.flag_emoji ?? null,
        away_name: g.away_team?.name ?? 'TBC',
        away_flag: g.away_team?.flag_emoji ?? null,
        home_score: g.home_score,
        away_score: g.away_score,
        context: g.group?.name ?? 'Group',
      })
    }
    const k = nextKo as unknown as KMRow | null
    if (k?.scheduled_at) {
      candidates.push({
        id: k.id,
        scheduled_at: k.scheduled_at,
        venue: k.venue,
        stadium: k.stadium,
        home_name: k.home_team?.name ?? 'TBC',
        home_flag: k.home_team?.flag_emoji ?? null,
        away_name: k.away_team?.name ?? 'TBC',
        away_flag: k.away_team?.flag_emoji ?? null,
        home_score: k.home_score,
        away_score: k.away_score,
        context: roundLabel(k.round),
      })
    }
    candidates.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    if (candidates.length > 0) {
      rows.push(candidates[0])
      nextFixtureFallback = true
    }
  }

  if (rows.length === 0) {
    return (
      <Card
        header={<h2 className="font-heading font-semibold text-foreground">Fixtures</h2>}
      >
        <p className="text-sm text-text-muted">
          No more matches scheduled.
        </p>
      </Card>
    )
  }

  const byDay = groupByDay(rows)

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-foreground">Fixtures</h2>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            {nextFixtureFallback ? 'Next Up' : `Next ${windowDays} Days`}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {byDay.map(({ day, fixtures }) => (
          <div key={day}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              {formatDayHeader(day)}
            </h3>
            <ul className="space-y-2">
              {fixtures.map((f) => (
                <FixtureItem key={f.id} fx={f} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}

function FixtureItem({ fx }: { fx: FixtureRow }) {
  const hasScore = fx.home_score != null && fx.away_score != null
  const kickoff = new Date(fx.scheduled_at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  })
  const venue = [fx.stadium, fx.venue].filter(Boolean).join(' · ')

  return (
    <li className="flex items-center justify-between gap-3 rounded bg-surface-light px-3 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="w-14 shrink-0 text-[11px] font-medium text-text-muted">
          {hasScore ? 'FT' : kickoff}
        </span>
        <span className="truncate text-sm text-foreground">
          <span aria-hidden>{fx.home_flag ?? ''}</span> {fx.home_name}
        </span>
        <span className="px-1 text-xs font-semibold text-text-muted">
          {hasScore ? `${fx.home_score} - ${fx.away_score}` : 'v'}
        </span>
        <span className="truncate text-sm text-foreground">
          {fx.away_name} <span aria-hidden>{fx.away_flag ?? ''}</span>
        </span>
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-light">
          {fx.context}
        </p>
        {venue && <p className="text-[10px] text-text-muted">{venue}</p>}
      </div>
    </li>
  )
}

function groupByDay(rows: FixtureRow[]): { day: string; fixtures: FixtureRow[] }[] {
  const map = new Map<string, FixtureRow[]>()
  for (const r of rows) {
    const day = r.scheduled_at.slice(0, 10)
    const arr = map.get(day) ?? []
    arr.push(r)
    map.set(day, arr)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, fixtures]) => ({ day, fixtures }))
}

function formatDayHeader(dayIso: string): string {
  const date = new Date(`${dayIso}T12:00:00Z`)
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(today.getUTCDate() + 1)

  if (dayIso === today.toISOString().slice(0, 10)) return 'Today'
  if (dayIso === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow'
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  })
}

function roundLabel(round: string): string {
  return (
    {
      round_of_32: 'R32',
      round_of_16: 'R16',
      quarter_final: 'QF',
      semi_final: 'SF',
      final: 'Final',
    }[round] ?? round
  )
}
