// Fetches FIFA World Cup scores from ESPN's public scoreboard endpoint.
// The endpoint is undocumented but used by many third-party apps; it's the
// only free, no-auth source whose team `abbreviation` field maps 1:1 onto
// our `teams.code` (FIFA codes). If ESPN ever changes shape, the only fix
// is here and the tournament admin can still enter scores by hand on the
// existing /admin/tournaments/[slug]/results page.

const ESPN_URL =
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'

// ESPN abbreviation -> our teams.code. Most match directly; this only covers
// the handful where the two diverge for teams that are at WC 2026.
const ABBREV_ALIAS: Record<string, string> = {
  SAU: 'KSA', // Saudi Arabia
  IRI: 'IRN', // Iran (older ESPN tag)
  ALG: 'ALG',
  SUI: 'SUI',
  TPE: 'TPE',
  // Add more as we discover them in production logs.
}

export type EspnState = 'pre' | 'in' | 'post'

export interface EspnMatch {
  externalId: string
  /** ISO 8601 kickoff time. */
  date: string
  state: EspnState
  /** True only when status.type.completed === true. */
  completed: boolean
  homeCode: string
  awayCode: string
  homeScore: number
  awayScore: number
  /** True if the match required ET/PEN. Tracked for knockout winner logic. */
  isShootout: boolean
  /** When ESPN flags a competitor as the winner (knockouts), this is their
   *  normalised code. Null when no flag was set (group games, abandoned, etc.). */
  winnerCode: string | null
}

interface RawCompetitor {
  homeAway?: 'home' | 'away'
  team?: { abbreviation?: string }
  score?: string | number
  winner?: boolean
}

interface RawEvent {
  id?: string
  date?: string
  status?: {
    type?: {
      state?: string
      completed?: boolean
      name?: string
      description?: string
    }
  }
  competitions?: Array<{
    competitors?: RawCompetitor[]
    status?: RawEvent['status']
  }>
}

interface RawScoreboard {
  events?: RawEvent[]
}

/** Normalise ESPN's abbreviation onto our teams.code values. */
export function normaliseAbbr(abbr: string | undefined): string | null {
  if (!abbr) return null
  const up = abbr.toUpperCase()
  return ABBREV_ALIAS[up] ?? up
}

/** Date param ESPN expects, e.g. 2026-06-11 -> "20260611". */
export function formatEspnDate(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, '')
}

export function parseScoreboard(raw: unknown): EspnMatch[] {
  const sb = raw as RawScoreboard
  if (!sb || !Array.isArray(sb.events)) return []

  const matches: EspnMatch[] = []
  for (const ev of sb.events) {
    const comp = ev.competitions?.[0]
    if (!comp) continue
    const competitors = comp.competitors ?? []
    if (competitors.length !== 2) continue

    const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[0]
    const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[1]

    const homeCode = normaliseAbbr(home.team?.abbreviation)
    const awayCode = normaliseAbbr(away.team?.abbreviation)
    if (!homeCode || !awayCode) continue

    const statusType = ev.status?.type ?? comp.status?.type
    const stateRaw = statusType?.state
    if (stateRaw !== 'pre' && stateRaw !== 'in' && stateRaw !== 'post') continue
    const state = stateRaw as EspnState

    const desc = (statusType?.description ?? statusType?.name ?? '').toUpperCase()
    const isShootout = /PEN|SHOOTOUT/.test(desc)

    let winnerCode: string | null = null
    if (home.winner === true) winnerCode = homeCode
    else if (away.winner === true) winnerCode = awayCode

    matches.push({
      externalId: String(ev.id ?? ''),
      date: ev.date ?? '',
      state,
      completed: statusType?.completed === true,
      homeCode,
      awayCode,
      homeScore: Number(home.score ?? 0) || 0,
      awayScore: Number(away.score ?? 0) || 0,
      isShootout,
      winnerCode,
    })
  }
  return matches
}

export interface FetchOptions {
  /** Inclusive start date YYYY-MM-DD. */
  startDate: string
  /** Inclusive end date YYYY-MM-DD. */
  endDate: string
  /** Override the default ESPN URL — used by tests. */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

/** Pulls one day at a time. ESPN's dates query supports ranges but per-day is
 *  cleaner and matches their own UI. Errors on individual days are logged and
 *  skipped — we'd rather sync the days that work than fail the whole run. */
export async function fetchEspnMatches(opts: FetchOptions): Promise<EspnMatch[]> {
  const days = enumerateDays(opts.startDate, opts.endDate)
  const fetcher = opts.fetchImpl ?? fetch
  const base = opts.baseUrl ?? ESPN_URL

  const out: EspnMatch[] = []
  for (const d of days) {
    const url = `${base}?dates=${formatEspnDate(d)}`
    try {
      const res = await fetcher(url, {
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        console.error(`[espn-source] ${d}: HTTP ${res.status}`)
        continue
      }
      const json = await res.json()
      out.push(...parseScoreboard(json))
    } catch (err) {
      console.error(`[espn-source] ${d}: fetch failed`, err)
    }
  }
  return out
}

/** Inclusive day list between two YYYY-MM-DD strings. Caps at 14 to keep runs
 *  bounded — the caller should pass a sensible window. */
export function enumerateDays(start: string, end: string): string[] {
  const s = new Date(`${start}T00:00:00Z`).getTime()
  const e = new Date(`${end}T00:00:00Z`).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return []
  const out: string[] = []
  for (let t = s; t <= e && out.length < 14; t += 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}
