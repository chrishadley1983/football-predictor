# Done Criteria: ai-pundit

**Created:** 2026-02-26
**Author:** Define Done Agent + Chris
**Status:** DRAFT

---

## Feature Summary

Four AI-powered pundit characters deliver 15 opinionated, humorous commentary snippets each per day (60 total), reacting to tournament results, predictions, leaderboard movements, chat messages, World Cup news, and the occasional random society observation. Pundits are always visible on the tournament hub page and available via an expandable floating widget on other tournament pages. Snippets are randomly selected per page load.

**Problem:** The prediction game is static between user actions — no ongoing entertainment or personality beyond the data.
**User:** All tournament participants (authenticated and anonymous viewers).
**Trigger:** Daily cron job generates fresh snippets; users see them on every page load.
**Outcome:** The app feels alive with four distinct, hilarious pundit personalities that react to what's happening in real-time.

---

## The Four Pundits

| Key | Character Name | Real Inspiration | Archetype |
|-----|---------------|-----------------|-----------|
| `neverill` | Gary Neverill | Gary Neville | Overwrought tactician, gets wound up mid-sentence, blames "the structure" |
| `bright` | Ian Bright | Ian Wright | Excitable superfan, pure emotion, loves everything, infectious enthusiasm |
| `meane` | Roy Meane | Roy Keane | Disgusted hardman, contempt for everything, devastating one-liners |
| `scaragher` | Jamie Scaragher | Jamie Carragher | Passionate arguer, argues with himself, talks over imaginary people, Scouse |

---

## Content Mix (per pundit, per day = 15 snippets)

| Category | Count | Examples |
|----------|-------|---------|
| `leaderboard` | ~3 | Rank changes, risers, fallers, streaks |
| `predictions` | ~3 | Bold picks, consensus, contrarian calls |
| `results` | ~3 | Match reactions, upsets, group standings |
| `chat` | ~2 | Reacting to what people are saying in chat |
| `news` | ~2 | Real World Cup news, training, squad drama |
| `wildcard` | ~2 | Random society observations, off-topic rants |

---

## Success Criteria

### Functional — Database

#### F1: Pundit Snippets Table Exists
- **Tag:** AUTO_VERIFY
- **Criterion:** Table `pundit_snippets` exists with columns: `id` (UUID PK), `tournament_id` (UUID FK to tournaments), `pundit_key` (TEXT, one of neverill/bright/meane/scaragher), `content` (TEXT), `category` (TEXT), `generated_date` (DATE), `created_at` (TIMESTAMPTZ)
- **Evidence:** Migration file exists and table queryable
- **Test:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'pundit_snippets'` returns expected columns

#### F2: Pundit Snippets RLS
- **Tag:** AUTO_VERIFY
- **Criterion:** `pundit_snippets` has RLS enabled with anon SELECT policy (everyone can read snippets) and service_role INSERT/DELETE (only generation job can write)
- **Evidence:** RLS policies exist on table
- **Test:** Query `pg_policies` for `pundit_snippets` table

#### F3: Unique Constraint on Generation
- **Tag:** AUTO_VERIFY
- **Criterion:** Unique constraint or index on `(tournament_id, pundit_key, generated_date, content)` prevents exact duplicate snippets
- **Evidence:** Constraint exists in migration
- **Test:** Migration file contains unique constraint

### Functional — Pundit Constants

#### F4: Pundit Character Definitions
- **Tag:** AUTO_VERIFY
- **Criterion:** File `src/lib/pundit-characters.ts` exports `PUNDITS` record with keys `neverill`, `bright`, `meane`, `scaragher`, each containing `name`, `key`, `description`, `avatarEmoji`, and `color` (hex string for UI accent)
- **Evidence:** File exists with all 4 pundits defined
- **Test:** `grep -c "neverill\|bright\|meane\|scaragher" src/lib/pundit-characters.ts` returns 4+

#### F5: Pundit Types Exported
- **Tag:** AUTO_VERIFY
- **Criterion:** `src/lib/types.ts` exports `PunditKey` union type (`'neverill' | 'bright' | 'meane' | 'scaragher'`) and `PunditSnippet` interface matching the database columns
- **Evidence:** Types exist and TypeScript compiles
- **Test:** grep for `PunditKey` and `PunditSnippet` in types.ts

### Functional — API Endpoint (Snippet Fetch)

#### F6: Random Snippet API
- **Tag:** AUTO_VERIFY
- **Criterion:** `GET /api/tournaments/[slug]/pundit` returns a random `PunditSnippet` for today's date (or most recent date with snippets). Response shape: `{ pundit_key, name, content, category, avatar_emoji, color }`
- **Evidence:** API route file exists at `src/app/api/tournaments/[slug]/pundit/route.ts`
- **Test:** Route file exists and exports GET handler

#### F7: Random Snippet SQL Uses RANDOM()
- **Tag:** AUTO_VERIFY
- **Criterion:** The API fetches a single random snippet using Supabase or SQL random ordering, not client-side randomisation of all 60
- **Evidence:** Query uses `.limit(1)` with random ordering or SQL `ORDER BY random() LIMIT 1`
- **Test:** Code inspection of route handler

#### F8: Fallback When No Snippets
- **Tag:** AUTO_VERIFY
- **Criterion:** When no snippets exist for today (or ever), the API returns `{ pundit_key: null, content: null }` with 200 status, not an error
- **Evidence:** Graceful null response
- **Test:** Query with no data returns null fields

### Functional — Generation API (Called by GCP)

#### F9: Generation Endpoint Exists
- **Tag:** AUTO_VERIFY
- **Criterion:** `POST /api/admin/tournaments/[slug]/generate-punditry` exists, requires admin auth or a shared secret header (`x-cron-secret`), and triggers snippet generation
- **Evidence:** Route file exists with POST handler and auth check
- **Test:** Route file exists at expected path

#### F10: Generation Gathers Context
- **Tag:** AUTO_VERIFY
- **Criterion:** Generation function fetches: (a) latest match results, (b) current leaderboard top 10, (c) all player predictions summary, (d) last 50 chat messages, (e) tournament status and stats
- **Evidence:** Function queries all 5 data sources before calling Claude
- **Test:** Code inspection shows 5 Supabase queries

#### F11: Generation Calls Claude Per Pundit
- **Tag:** AUTO_VERIFY
- **Criterion:** Generation makes 4 separate Claude API calls (one per pundit), each with a pundit-specific system prompt and the shared context, requesting 15 snippets in JSON array format
- **Evidence:** 4 API calls with distinct system prompts
- **Test:** Code inspection shows loop over 4 pundits with distinct prompts

#### F12: Generation Stores 60 Snippets
- **Tag:** AUTO_VERIFY
- **Criterion:** After successful generation, exactly 60 rows (15 per pundit x 4 pundits) are inserted into `pundit_snippets` for today's date
- **Evidence:** Insert query targets pundit_snippets with correct tournament_id and generated_date
- **Test:** Code inspection shows batch insert after parsing Claude responses

#### F13: Generation Is Idempotent
- **Tag:** AUTO_VERIFY
- **Criterion:** Running generation twice for the same date deletes existing snippets for that date before inserting new ones (delete-and-reinsert pattern)
- **Evidence:** DELETE query precedes INSERT for same tournament_id + generated_date
- **Test:** Code shows delete-before-insert pattern

#### F14: Pundit System Prompts
- **Tag:** AUTO_VERIFY
- **Criterion:** File `src/lib/pundit-prompts.ts` exports a function `getPunditSystemPrompt(punditKey, context)` that returns a character-specific system prompt including personality traits, catchphrases, tone guide, and the content mix requirements
- **Evidence:** File exists with 4 distinct prompt templates
- **Test:** File exports function, grep for all 4 pundit keys

#### F15: Content Mix Enforced in Prompt
- **Tag:** AUTO_VERIFY
- **Criterion:** Each pundit prompt specifies the target category distribution (~3 leaderboard, ~3 predictions, ~3 results, ~2 chat, ~2 news, ~2 wildcard) and requires output as a JSON array of `{ content, category }` objects
- **Evidence:** Prompt text includes category counts and JSON output instruction
- **Test:** Code inspection of prompt template

### Functional — GCP Cloud Function

#### F16: GCP Function Exists
- **Tag:** AUTO_VERIFY
- **Criterion:** Directory `gcp/generate-punditry/` exists with `index.ts` (or `index.js`), `package.json`, and deployment configuration
- **Evidence:** Directory and files exist
- **Test:** File existence check

#### F17: GCP Function Calls Vercel Endpoint
- **Tag:** AUTO_VERIFY
- **Criterion:** GCP function makes a POST request to the Vercel-hosted generation endpoint with the cron secret header and tournament slug
- **Evidence:** HTTP call in function code targets the production URL
- **Test:** Code inspection shows fetch to Vercel endpoint

#### F18: GCP Scheduler Configured
- **Tag:** HUMAN_VERIFY
- **Criterion:** Cloud Scheduler job is configured to trigger the function daily at 06:00 UTC
- **Evidence:** Scheduler job visible in GCP Console
- **Test:** Human checks GCP Console for scheduled job

### Functional — Homepage Widget

#### F19: Pundit Card on Tournament Hub
- **Tag:** AUTO_VERIFY
- **Criterion:** Tournament hub page (`src/app/tournament/[slug]/page.tsx`) renders a `PunditCard` component that displays the pundit's avatar emoji, character name, and snippet content
- **Evidence:** PunditCard component imported and rendered on hub page
- **Test:** grep for `PunditCard` in page.tsx

#### F20: PunditCard Component
- **Tag:** AUTO_VERIFY
- **Criterion:** `src/components/pundit/PunditCard.tsx` exists as a client component that fetches a random snippet on mount via the pundit API and renders it with the pundit's avatar, name, and styled quote
- **Evidence:** Component file exists with fetch logic
- **Test:** File exists, uses `'use client'`, contains fetch call

#### F21: PunditCard Refresh
- **Tag:** AUTO_VERIFY
- **Criterion:** PunditCard has a subtle "refresh" button (or click-to-refresh) that fetches a new random snippet without full page reload
- **Evidence:** Button or click handler triggers re-fetch
- **Test:** Code inspection shows re-fetch mechanism

#### F22: PunditCard Loading State
- **Tag:** AUTO_VERIFY
- **Criterion:** PunditCard shows a skeleton/shimmer state while loading and gracefully hides itself if no snippets are available (pundit_key is null)
- **Evidence:** Conditional rendering on loading and null states
- **Test:** Code inspection for loading and null checks

### Functional — Floating Widget (Other Pages)

#### F23: PunditBubble Component
- **Tag:** AUTO_VERIFY
- **Criterion:** `src/components/pundit/PunditBubble.tsx` exists as a client component that renders a small floating button (pundit avatar emoji) in the bottom-right corner of the screen
- **Evidence:** Component file exists with fixed/sticky positioning
- **Test:** File exists with position-fixed or equivalent styling

#### F24: PunditBubble Expands
- **Tag:** AUTO_VERIFY
- **Criterion:** Clicking the floating button expands a small chat-bubble-style popup showing the current pundit snippet (avatar, name, quote) with a close button and a "next take" refresh button
- **Evidence:** Toggle state shows/hides expanded panel
- **Test:** Code inspection shows expanded state with snippet display

#### F25: PunditBubble on Tournament Pages
- **Tag:** AUTO_VERIFY
- **Criterion:** PunditBubble is rendered on leaderboard, predictions, results, and chat pages (but NOT on the hub page where PunditCard is used instead)
- **Evidence:** PunditBubble imported in layout or individual page files
- **Test:** grep for `PunditBubble` in tournament page files

#### F26: PunditBubble Shares Fetch Logic
- **Tag:** AUTO_VERIFY
- **Criterion:** Both PunditCard and PunditBubble use a shared `usePunditSnippet(tournamentSlug)` hook that handles fetching, loading state, and refresh
- **Evidence:** Custom hook exists at `src/hooks/usePunditSnippet.ts` and is imported by both components
- **Test:** Hook file exists, imported by both components

### Functional — Pundit Styling

#### F27: Pundit-Specific Accent Colours
- **Tag:** AUTO_VERIFY
- **Criterion:** Each pundit's card/bubble uses their defined accent colour for the border or background highlight (e.g., Neverill=red for Sky Sports, Bright=amber for energy, Meane=dark green for Ireland, Scaragher=blue for Liverpool away)
- **Evidence:** Component applies colour from pundit character definition
- **Test:** Code uses `pundit.color` for dynamic styling

#### F28: Quote Styling
- **Tag:** HUMAN_VERIFY
- **Criterion:** Snippet text is displayed in a visually distinct quote style (italic, quotation marks, or speech bubble aesthetic) that feels like punditry commentary, not a plain text block
- **Evidence:** Visual inspection of rendered component
- **Test:** Screenshot review

---

### Error Handling

#### E1: Claude API Failure Per Pundit
- **Tag:** AUTO_VERIFY
- **Criterion:** If Claude API fails for one pundit, the other 3 pundits' snippets are still generated and stored. The failed pundit is logged but does not block the batch
- **Evidence:** Each pundit generation is wrapped in try/catch
- **Test:** Code inspection shows independent error handling per pundit

#### E2: Invalid Claude Response
- **Tag:** AUTO_VERIFY
- **Criterion:** If Claude returns malformed JSON (not a valid array of 15 objects), the generation logs the error with the raw response and skips that pundit without crashing
- **Evidence:** JSON.parse wrapped in try/catch with validation
- **Test:** Code inspection shows parse error handling

#### E3: Empty Snippet Handling
- **Tag:** AUTO_VERIFY
- **Criterion:** Frontend components gracefully handle the case where no snippets exist (tournament hasn't started, generation hasn't run yet) by hiding the pundit widget entirely rather than showing an error
- **Evidence:** Components return null when snippet data is empty
- **Test:** Code inspection for null/empty checks

#### E4: Cron Secret Validation
- **Tag:** AUTO_VERIFY
- **Criterion:** Generation endpoint returns 401 if the `x-cron-secret` header doesn't match `CRON_SECRET` env var, and also accepts admin auth as a fallback
- **Evidence:** Auth check at top of route handler
- **Test:** Code inspection shows secret validation

---

### Performance

#### P1: Snippet Fetch Speed
- **Tag:** AUTO_VERIFY
- **Criterion:** Random snippet API responds in under 200ms (single row random query on indexed table)
- **Evidence:** `generated_date` and `tournament_id` are indexed
- **Test:** Migration includes index on `(tournament_id, generated_date)`

#### P2: Generation Timeout
- **Tag:** AUTO_VERIFY
- **Criterion:** Generation endpoint sets a maximum timeout of 120 seconds (4 Claude calls + DB operations). If any single Claude call exceeds 30 seconds, it times out and the pundit is skipped
- **Evidence:** AbortController with 30s timeout per Claude call
- **Test:** Code inspection shows timeout handling

#### P3: No Layout Shift
- **Tag:** AUTO_VERIFY
- **Criterion:** PunditCard on the hub page has a fixed minimum height so content below it doesn't shift when the snippet loads
- **Evidence:** Component has `min-h-` class or equivalent
- **Test:** Code inspection for minimum height styling

---

### UI/UX

#### U1: Hub Page Pundit Placement
- **Tag:** HUMAN_VERIFY
- **Criterion:** PunditCard is prominently visible on the tournament hub page without scrolling, positioned within the main content area (not buried at the bottom)
- **Evidence:** Visual inspection on desktop and mobile
- **Test:** Screenshot of hub page showing pundit card above fold

#### U2: Mobile Responsive
- **Tag:** AUTO_VERIFY
- **Criterion:** PunditCard and PunditBubble render correctly on mobile (375px width). PunditCard is full-width, PunditBubble doesn't overlap critical UI elements
- **Evidence:** Tailwind responsive classes applied
- **Test:** Code inspection for responsive sizing

#### U3: Pundit Avatar Distinctiveness
- **Tag:** HUMAN_VERIFY
- **Criterion:** Each pundit has a visually distinct presentation (different emoji avatar, accent colour, and name) so users can immediately tell which pundit is speaking
- **Evidence:** Visual inspection of all 4 pundits
- **Test:** Screenshot showing different pundit appearances

---

## Out of Scope

- Personalised snippets (e.g., "You've dropped 3 places") — all snippets are universal
- User ability to "like" or react to snippets
- Pundit snippet archive / history page
- Ghost players (separate feature)
- World Cup news RSS feed integration (news context can be seeded manually or from basic web search in generation)
- Voice or audio playback of snippets
- Admin UI for managing/editing snippets (admin can re-trigger generation via endpoint)
- Snippet analytics (which pundits are most refreshed)

---

## Dependencies

- Claude API key configured (already exists for achievements)
- Supabase cloud database (existing)
- GCP project for Cloud Function + Cloud Scheduler
- `CRON_SECRET` env var configured in both GCP and Vercel
- Tournament must have at least `group_stage_open` status for meaningful context

---

## Environment Variables (New)

| Variable | Where | Purpose |
|----------|-------|---------|
| `CRON_SECRET` | Vercel + GCP | Shared secret for generation endpoint auth |
| `ANTHROPIC_API_KEY` | Vercel | Claude API for snippet generation (may already exist) |

---

## Iteration Budget

- **Max iterations:** 7
- **Escalation:** If not converged after 7 iterations, pause for human review
- **Note:** Higher budget due to GCP deployment step which may need manual verification

---

## Verification Summary

| ID | Criterion | Tag | Status |
|----|-----------|-----|--------|
| F1 | Pundit snippets table exists | AUTO_VERIFY | PENDING |
| F2 | RLS policies on snippets | AUTO_VERIFY | PENDING |
| F3 | Unique constraint on generation | AUTO_VERIFY | PENDING |
| F4 | Pundit character definitions | AUTO_VERIFY | PENDING |
| F5 | Pundit types exported | AUTO_VERIFY | PENDING |
| F6 | Random snippet API | AUTO_VERIFY | PENDING |
| F7 | Random ordering in SQL | AUTO_VERIFY | PENDING |
| F8 | Fallback when no snippets | AUTO_VERIFY | PENDING |
| F9 | Generation endpoint exists | AUTO_VERIFY | PENDING |
| F10 | Generation gathers context | AUTO_VERIFY | PENDING |
| F11 | Claude called per pundit | AUTO_VERIFY | PENDING |
| F12 | 60 snippets stored | AUTO_VERIFY | PENDING |
| F13 | Generation is idempotent | AUTO_VERIFY | PENDING |
| F14 | Pundit system prompts | AUTO_VERIFY | PENDING |
| F15 | Content mix in prompt | AUTO_VERIFY | PENDING |
| F16 | GCP function exists | AUTO_VERIFY | PENDING |
| F17 | GCP calls Vercel endpoint | AUTO_VERIFY | PENDING |
| F18 | GCP scheduler configured | HUMAN_VERIFY | PENDING |
| F19 | Pundit card on hub page | AUTO_VERIFY | PENDING |
| F20 | PunditCard component | AUTO_VERIFY | PENDING |
| F21 | PunditCard refresh button | AUTO_VERIFY | PENDING |
| F22 | PunditCard loading state | AUTO_VERIFY | PENDING |
| F23 | PunditBubble component | AUTO_VERIFY | PENDING |
| F24 | PunditBubble expands | AUTO_VERIFY | PENDING |
| F25 | PunditBubble on tournament pages | AUTO_VERIFY | PENDING |
| F26 | Shared usePunditSnippet hook | AUTO_VERIFY | PENDING |
| F27 | Pundit accent colours | AUTO_VERIFY | PENDING |
| F28 | Quote styling | HUMAN_VERIFY | PENDING |
| E1 | Claude failure per pundit | AUTO_VERIFY | PENDING |
| E2 | Invalid Claude response | AUTO_VERIFY | PENDING |
| E3 | Empty snippet handling | AUTO_VERIFY | PENDING |
| E4 | Cron secret validation | AUTO_VERIFY | PENDING |
| P1 | Snippet fetch speed | AUTO_VERIFY | PENDING |
| P2 | Generation timeout | AUTO_VERIFY | PENDING |
| P3 | No layout shift | AUTO_VERIFY | PENDING |
| U1 | Hub page placement | HUMAN_VERIFY | PENDING |
| U2 | Mobile responsive | AUTO_VERIFY | PENDING |
| U3 | Pundit avatar distinctiveness | HUMAN_VERIFY | PENDING |

**Total:** 38 criteria (34 AUTO_VERIFY, 4 HUMAN_VERIFY)

---

## Handoff

Ready for: `/build-feature ai-pundit`

**Key files likely affected:**
- `supabase/migrations/XXXXXXXX_pundit_snippets.sql` (new)
- `src/lib/types.ts` (modified — add PunditKey, PunditSnippet)
- `src/lib/pundit-characters.ts` (new)
- `src/lib/pundit-prompts.ts` (new)
- `src/hooks/usePunditSnippet.ts` (new)
- `src/components/pundit/PunditCard.tsx` (new)
- `src/components/pundit/PunditBubble.tsx` (new)
- `src/app/api/tournaments/[slug]/pundit/route.ts` (new)
- `src/app/api/admin/tournaments/[slug]/generate-punditry/route.ts` (new)
- `src/app/tournament/[slug]/page.tsx` (modified — add PunditCard)
- `src/app/tournament/[slug]/leaderboard/page.tsx` (modified — add PunditBubble)
- `src/app/tournament/[slug]/predictions/page.tsx` (modified — add PunditBubble)
- `src/app/tournament/[slug]/results/page.tsx` (modified — add PunditBubble)
- `src/app/tournament/[slug]/chat/page.tsx` (modified — add PunditBubble)
- `gcp/generate-punditry/index.ts` (new)
- `gcp/generate-punditry/package.json` (new)
