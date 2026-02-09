import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import * as cheerio from 'cheerio'

const ALLOWED_DOMAINS = [
  'en.wikipedia.org',
  'en.m.wikipedia.org',
  'www.transfermarkt.com',
  'www.transfermarkt.co.uk',
  'www.worldfootball.net',
  'www.rsssf.org',
]

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const FETCH_TIMEOUT_MS = 10_000

interface ImportedTeam {
  name: string
  code: string
  flag_emoji: string
}

interface ImportedMatch {
  home: string
  away: string
  date: string
  time: string
  venue: string
}

interface ImportedGroup {
  name: string
  teams: ImportedTeam[]
  matches: ImportedMatch[]
}

interface ImportedKnockoutMatch {
  round: string
  matchNumber: number
  date: string
  time: string
  venue: string
}

// Country name → { FIFA code, ISO 3166-1 alpha-2 }
const COUNTRY_DATA: Record<string, { fifa: string; iso2: string }> = {
  // AFC
  'Australia': { fifa: 'AUS', iso2: 'AU' },
  'Bahrain': { fifa: 'BHR', iso2: 'BH' },
  'China': { fifa: 'CHN', iso2: 'CN' },
  'China PR': { fifa: 'CHN', iso2: 'CN' },
  'India': { fifa: 'IND', iso2: 'IN' },
  'Indonesia': { fifa: 'IDN', iso2: 'ID' },
  'Iran': { fifa: 'IRN', iso2: 'IR' },
  'Iraq': { fifa: 'IRQ', iso2: 'IQ' },
  'Japan': { fifa: 'JPN', iso2: 'JP' },
  'Jordan': { fifa: 'JOR', iso2: 'JO' },
  'Kuwait': { fifa: 'KUW', iso2: 'KW' },
  'Kyrgyzstan': { fifa: 'KGZ', iso2: 'KG' },
  'Lebanon': { fifa: 'LBN', iso2: 'LB' },
  'North Korea': { fifa: 'PRK', iso2: 'KP' },
  'Oman': { fifa: 'OMA', iso2: 'OM' },
  'Palestine': { fifa: 'PLE', iso2: 'PS' },
  'Qatar': { fifa: 'QAT', iso2: 'QA' },
  'Saudi Arabia': { fifa: 'KSA', iso2: 'SA' },
  'South Korea': { fifa: 'KOR', iso2: 'KR' },
  'Syria': { fifa: 'SYR', iso2: 'SY' },
  'Thailand': { fifa: 'THA', iso2: 'TH' },
  'United Arab Emirates': { fifa: 'UAE', iso2: 'AE' },
  'Uzbekistan': { fifa: 'UZB', iso2: 'UZ' },
  'Vietnam': { fifa: 'VIE', iso2: 'VN' },
  // CAF
  'Algeria': { fifa: 'ALG', iso2: 'DZ' },
  'Angola': { fifa: 'ANG', iso2: 'AO' },
  'Burkina Faso': { fifa: 'BFA', iso2: 'BF' },
  'Cameroon': { fifa: 'CMR', iso2: 'CM' },
  'Cape Verde': { fifa: 'CPV', iso2: 'CV' },
  'Cabo Verde': { fifa: 'CPV', iso2: 'CV' },
  'Comoros': { fifa: 'COM', iso2: 'KM' },
  'Congo': { fifa: 'CGO', iso2: 'CG' },
  'DR Congo': { fifa: 'COD', iso2: 'CD' },
  'Egypt': { fifa: 'EGY', iso2: 'EG' },
  'Equatorial Guinea': { fifa: 'EQG', iso2: 'GQ' },
  'Gabon': { fifa: 'GAB', iso2: 'GA' },
  'Ghana': { fifa: 'GHA', iso2: 'GH' },
  'Guinea': { fifa: 'GUI', iso2: 'GN' },
  'Ivory Coast': { fifa: 'CIV', iso2: 'CI' },
  "Côte d'Ivoire": { fifa: 'CIV', iso2: 'CI' },
  'Kenya': { fifa: 'KEN', iso2: 'KE' },
  'Mali': { fifa: 'MLI', iso2: 'ML' },
  'Morocco': { fifa: 'MAR', iso2: 'MA' },
  'Mozambique': { fifa: 'MOZ', iso2: 'MZ' },
  'Namibia': { fifa: 'NAM', iso2: 'NA' },
  'Nigeria': { fifa: 'NGA', iso2: 'NG' },
  'Senegal': { fifa: 'SEN', iso2: 'SN' },
  'South Africa': { fifa: 'RSA', iso2: 'ZA' },
  'Tanzania': { fifa: 'TAN', iso2: 'TZ' },
  'Togo': { fifa: 'TOG', iso2: 'TG' },
  'Tunisia': { fifa: 'TUN', iso2: 'TN' },
  'Uganda': { fifa: 'UGA', iso2: 'UG' },
  'Zambia': { fifa: 'ZAM', iso2: 'ZM' },
  'Zimbabwe': { fifa: 'ZIM', iso2: 'ZW' },
  // CONCACAF
  'Canada': { fifa: 'CAN', iso2: 'CA' },
  'Costa Rica': { fifa: 'CRC', iso2: 'CR' },
  'Cuba': { fifa: 'CUB', iso2: 'CU' },
  'Curaçao': { fifa: 'CUW', iso2: 'CW' },
  'Curacao': { fifa: 'CUW', iso2: 'CW' },
  'El Salvador': { fifa: 'SLV', iso2: 'SV' },
  'Guatemala': { fifa: 'GUA', iso2: 'GT' },
  'Haiti': { fifa: 'HAI', iso2: 'HT' },
  'Honduras': { fifa: 'HON', iso2: 'HN' },
  'Jamaica': { fifa: 'JAM', iso2: 'JM' },
  'Mexico': { fifa: 'MEX', iso2: 'MX' },
  'Nicaragua': { fifa: 'NCA', iso2: 'NI' },
  'Panama': { fifa: 'PAN', iso2: 'PA' },
  'Suriname': { fifa: 'SUR', iso2: 'SR' },
  'Trinidad and Tobago': { fifa: 'TRI', iso2: 'TT' },
  'United States': { fifa: 'USA', iso2: 'US' },
  // CONMEBOL
  'Argentina': { fifa: 'ARG', iso2: 'AR' },
  'Bolivia': { fifa: 'BOL', iso2: 'BO' },
  'Brazil': { fifa: 'BRA', iso2: 'BR' },
  'Chile': { fifa: 'CHI', iso2: 'CL' },
  'Colombia': { fifa: 'COL', iso2: 'CO' },
  'Ecuador': { fifa: 'ECU', iso2: 'EC' },
  'Paraguay': { fifa: 'PAR', iso2: 'PY' },
  'Peru': { fifa: 'PER', iso2: 'PE' },
  'Uruguay': { fifa: 'URU', iso2: 'UY' },
  'Venezuela': { fifa: 'VEN', iso2: 'VE' },
  // OFC
  'New Zealand': { fifa: 'NZL', iso2: 'NZ' },
  // UEFA
  'Albania': { fifa: 'ALB', iso2: 'AL' },
  'Armenia': { fifa: 'ARM', iso2: 'AM' },
  'Austria': { fifa: 'AUT', iso2: 'AT' },
  'Belgium': { fifa: 'BEL', iso2: 'BE' },
  'Bosnia and Herzegovina': { fifa: 'BIH', iso2: 'BA' },
  'Bulgaria': { fifa: 'BUL', iso2: 'BG' },
  'Croatia': { fifa: 'CRO', iso2: 'HR' },
  'Czech Republic': { fifa: 'CZE', iso2: 'CZ' },
  'Czechia': { fifa: 'CZE', iso2: 'CZ' },
  'Denmark': { fifa: 'DEN', iso2: 'DK' },
  'England': { fifa: 'ENG', iso2: 'GB-ENG' },
  'Estonia': { fifa: 'EST', iso2: 'EE' },
  'Finland': { fifa: 'FIN', iso2: 'FI' },
  'France': { fifa: 'FRA', iso2: 'FR' },
  'Georgia': { fifa: 'GEO', iso2: 'GE' },
  'Germany': { fifa: 'GER', iso2: 'DE' },
  'Greece': { fifa: 'GRE', iso2: 'GR' },
  'Hungary': { fifa: 'HUN', iso2: 'HU' },
  'Iceland': { fifa: 'ISL', iso2: 'IS' },
  'Israel': { fifa: 'ISR', iso2: 'IL' },
  'Italy': { fifa: 'ITA', iso2: 'IT' },
  'Kosovo': { fifa: 'KVX', iso2: 'XK' },
  'Latvia': { fifa: 'LVA', iso2: 'LV' },
  'Lithuania': { fifa: 'LTU', iso2: 'LT' },
  'Luxembourg': { fifa: 'LUX', iso2: 'LU' },
  'Montenegro': { fifa: 'MNE', iso2: 'ME' },
  'Netherlands': { fifa: 'NED', iso2: 'NL' },
  'North Macedonia': { fifa: 'MKD', iso2: 'MK' },
  'Northern Ireland': { fifa: 'NIR', iso2: 'GB-NIR' },
  'Norway': { fifa: 'NOR', iso2: 'NO' },
  'Poland': { fifa: 'POL', iso2: 'PL' },
  'Portugal': { fifa: 'POR', iso2: 'PT' },
  'Republic of Ireland': { fifa: 'IRL', iso2: 'IE' },
  'Ireland': { fifa: 'IRL', iso2: 'IE' },
  'Romania': { fifa: 'ROU', iso2: 'RO' },
  'Russia': { fifa: 'RUS', iso2: 'RU' },
  'Scotland': { fifa: 'SCO', iso2: 'GB-SCT' },
  'Serbia': { fifa: 'SRB', iso2: 'RS' },
  'Slovakia': { fifa: 'SVK', iso2: 'SK' },
  'Slovenia': { fifa: 'SVN', iso2: 'SI' },
  'Spain': { fifa: 'ESP', iso2: 'ES' },
  'Sweden': { fifa: 'SWE', iso2: 'SE' },
  'Switzerland': { fifa: 'SUI', iso2: 'CH' },
  'Türkiye': { fifa: 'TUR', iso2: 'TR' },
  'Turkey': { fifa: 'TUR', iso2: 'TR' },
  'Ukraine': { fifa: 'UKR', iso2: 'UA' },
  'Wales': { fifa: 'WAL', iso2: 'GB-WLS' },
}

// UK subdivision flags need special Unicode tag sequences
const SUBDIVISION_FLAGS: Record<string, string> = {
  'GB-ENG': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', // 🏴󠁧󠁢󠁥󠁮󠁧󠁿
  'GB-SCT': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', // 🏴󠁧󠁢󠁳󠁣󠁴󠁿
  'GB-WLS': '\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}', // 🏴󠁧󠁢󠁷󠁬󠁳󠁿
  'GB-NIR': '\u{1F1EC}\u{1F1E7}', // 🇬🇧 (no official subdivision flag, use UK)
}

function iso2ToFlagEmoji(iso2: string): string {
  // Handle UK subdivisions
  if (SUBDIVISION_FLAGS[iso2]) return SUBDIVISION_FLAGS[iso2]
  if (iso2.length !== 2) return ''
  const codePoints = Array.from(iso2.toUpperCase()).map(c => c.codePointAt(0)! + 0x1F1A5)
  return String.fromCodePoint(...codePoints)
}

function lookupCountry(name: string): { code: string; flag_emoji: string } {
  const data = COUNTRY_DATA[name]
  if (data) {
    return { code: data.fifa, flag_emoji: iso2ToFlagEmoji(data.iso2) }
  }

  // Check if the name already looks like a 3-letter code
  if (/^[A-Z]{3}$/.test(name)) return { code: name, flag_emoji: '' }

  // Fallback: first 3 letters uppercase
  const code = name.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase()
  return { code, flag_emoji: '' }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params

    // Validate tournament exists
    const admin = createAdminClient()
    const { data: tournament } = await admin
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body = await request.json()
    const { url } = body as { url: string }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate URL format
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // SSRF protection: only allow HTTPS and whitelisted domains
    if (parsedUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only HTTPS URLs are allowed' }, { status: 400 })
    }

    if (!ALLOWED_DOMAINS.includes(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: `Domain not allowed. Supported: ${ALLOWED_DOMAINS.join(', ')}` },
        { status: 400 }
      )
    }

    // Fetch the page with browser-like headers and timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        redirect: 'error',
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status} ${response.statusText}` },
        { status: 422 }
      )
    }

    // Check Content-Length if available
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      return NextResponse.json({ error: 'Response too large' }, { status: 422 })
    }

    const html = await response.text()

    if (html.length > MAX_RESPONSE_SIZE) {
      return NextResponse.json({ error: 'Response too large' }, { status: 422 })
    }
    const $ = cheerio.load(html)

    const groups: ImportedGroup[] = []
    const knockoutDates: ImportedKnockoutMatch[] = []

    // Strategy 1: Find group headings by ID (Wikipedia standard: #Group_A, #Group_B, etc.)
    const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (const letter of GROUP_LETTERS) {
      const heading = $(`#Group_${letter}`)
      if (heading.length === 0) continue

      // Navigate from the heading's parent wrapper (Wikipedia wraps h3 in .mw-heading divs)
      const startEl = heading.closest('.mw-heading').length > 0
        ? heading.closest('.mw-heading')
        : heading.parent().prop('tagName') === 'DIV'
          ? heading.parent()
          : heading

      const teams: ImportedTeam[] = []

      // Walk siblings from the heading wrapper to find the group table
      let el = startEl.next()
      for (let i = 0; i < 10 && el.length > 0; i++) {
        const table = el.is('table.wikitable') ? el
          : el.is('table') ? el
          : el.find('table.wikitable').first().length > 0 ? el.find('table.wikitable').first()
          : el.find('table').first().length > 0 ? el.find('table').first()
          : null

        if (table && table.length > 0) {
          // Extract teams from th[scope=row] cells (Wikipedia standard for team rows)
          table.find('th[scope="row"]').each(function () {
            const link = $(this).find('a').filter(function () {
              const title = $(this).attr('title') || ''
              return title.includes('football team') || title.includes('soccer team')
            }).first()

            if (link.length > 0) {
              const name = link.text().trim()
              if (name.length > 1 && !teams.some(t => t.name === name)) {
                const { code, flag_emoji } = lookupCountry(name)
                teams.push({ name, code, flag_emoji })
              }
            }
          })

          // Fallback: if no th[scope=row] found, try links with flag images
          if (teams.length === 0) {
            table.find('tr').each(function () {
              $(this).find('a').each(function () {
                const title = $(this).attr('title') || ''
                const text = $(this).text().trim()
                if (
                  text.length > 2 &&
                  (title.includes('football team') || title.includes('soccer team')) &&
                  !teams.some(t => t.name === text)
                ) {
                  const { code, flag_emoji } = lookupCountry(text)
                  teams.push({ name: text, code, flag_emoji })
                }
              })
            })
          }

          if (teams.length > 0) break
        }

        el = el.next()
      }

      if (teams.length > 0) {
        groups.push({ name: `Group ${letter}`, teams, matches: [] })
      }
    }

    // Strategy 2: Find headings by text (for pages without ID-based headings)
    if (groups.length === 0) {
      const groupHeadings = $('h2, h3, h4').filter(function () {
        const text = $(this).text().trim()
        return /^Group\s+[A-Z]/.test(text)
      })

      if (groupHeadings.length > 0) {
        groupHeadings.each(function () {
          const headingText = $(this).text().trim()
          const groupMatch = headingText.match(/Group\s+([A-Z])/)
          if (!groupMatch) return

          const groupName = `Group ${groupMatch[1]}`
          const teams: ImportedTeam[] = []

          // Navigate from parent wrapper if heading is inside a div
          const startEl = $(this).parent().is('div')
            ? $(this).parent()
            : $(this)

          let el = startEl.next()
          for (let i = 0; i < 10 && el.length > 0; i++) {
            const table = el.is('table') ? el : el.find('table').first()
            if (table.length > 0) {
              table.find('a').each(function () {
                const title = $(this).attr('title') || ''
                const text = $(this).text().trim()
                const parentHasFlag =
                  $(this).parent().find('img').length > 0 ||
                  $(this).prev().find('img').length > 0
                if (
                  text.length > 2 &&
                  !/^\d+$/.test(text) &&
                  (title.includes('football') || title.includes('soccer') || parentHasFlag) &&
                  !teams.some(t => t.name === text)
                ) {
                  const { code, flag_emoji } = lookupCountry(text)
                  teams.push({ name: text, code, flag_emoji })
                }
              })
              if (teams.length > 0) break
            }
            el = el.next()
          }

          if (teams.length > 0) {
            groups.push({ name: groupName, teams, matches: [] })
          }
        })
      }
    }

    // Strategy 3: Single large table containing group names (non-Wikipedia layouts)
    if (groups.length === 0) {
      $('table').each(function () {
        const tableText = $(this).text()
        if (/Group\s+[A-Z]/.test(tableText)) {
          let currentGroupName = ''
          let currentTeams: ImportedTeam[] = []

          $(this)
            .find('tr')
            .each(function () {
              const rowText = $(this).text().trim()
              const groupNameMatch = rowText.match(/Group\s+([A-Z])/)

              if (groupNameMatch) {
                if (currentGroupName && currentTeams.length > 0) {
                  groups.push({
                    name: currentGroupName,
                    teams: [...currentTeams],
                    matches: [],
                  })
                }
                currentGroupName = `Group ${groupNameMatch[1]}`
                currentTeams = []
              }

              $(this)
                .find('a')
                .each(function () {
                  const text = $(this).text().trim()
                  const title = $(this).attr('title') || ''
                  if (
                    text.length > 2 &&
                    !/^\d+$/.test(text) &&
                    (title.includes('football') || title.includes('national') || title.includes('team')) &&
                    !currentTeams.some((t) => t.name === text)
                  ) {
                    const { code, flag_emoji } = lookupCountry(text)
                    currentTeams.push({ name: text, code, flag_emoji })
                  }
                })
            })

          if (currentGroupName && currentTeams.length > 0) {
            groups.push({
              name: currentGroupName,
              teams: [...currentTeams],
              matches: [],
            })
          }
        }
      })
    }

    if (groups.length === 0) {
      return NextResponse.json(
        {
          error:
            'No groups found on this page. The parser looks for "Group A", "Group B" etc. headings with adjacent team tables. Try a Wikipedia tournament article.',
        },
        { status: 422 }
      )
    }

    // Determine structure
    const teamsPerGroup = Math.max(...groups.map((g) => g.teams.length))

    // Try to extract knockout dates from the page
    const knockoutRounds = ['Round of 32', 'Round of 16', 'Quarter-final', 'Semi-final', 'Final']
    for (const roundName of knockoutRounds) {
      $('h2, h3, h4').each(function () {
        const text = $(this).text().trim()
        if (text.includes(roundName)) {
          const startEl = $(this).closest('.mw-heading').length > 0
            ? $(this).closest('.mw-heading')
            : $(this).parent().is('div') ? $(this).parent() : $(this)

          let searchEl = startEl.next()
          let matchNum = 1
          for (let i = 0; i < 20 && searchEl.length > 0; i++) {
            const elText = searchEl.text()
            const dateMatch = elText.match(
              /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
            )
            if (dateMatch) {
              const months = [
                'january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december',
              ]
              const dateStr = `${dateMatch[3]}-${String(months.indexOf(dateMatch[2].toLowerCase()) + 1).padStart(2, '0')}-${String(dateMatch[1]).padStart(2, '0')}`
              const timeMatch = elText.match(/(\d{1,2}:\d{2})/)?.[1] || ''
              const venueMatch = elText.match(/(?:at|,)\s+([A-Z][a-zA-Z\s]+(?:Stadium|Arena|Park))/)?.[1] || ''

              const round = roundName.toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_')
              knockoutDates.push({
                round,
                matchNumber: matchNum++,
                date: dateStr,
                time: timeMatch,
                venue: venueMatch,
              })
            }

            if (searchEl.is('h2, h3, h4') || searchEl.find('.mw-heading').length > 0) break
            searchEl = searchEl.next()
          }
        }
      })
    }

    return NextResponse.json({
      groups,
      groupCount: groups.length,
      teamsPerGroup,
      knockoutDates,
    })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('URL import error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
