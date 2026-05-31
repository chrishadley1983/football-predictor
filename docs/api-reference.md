# API Reference

All routes are Next.js App Router handlers under `src/app/api/**/route.ts` (plus the auth
callback at `src/app/auth/callback/route.ts`).

## Auth model

`src/lib/auth.ts` provides:
- `getCurrentPlayer()` — resolves the logged-in `players` row from the cookie session.
- `requireAuth()` — returns the player or throws a `Response` 401 (handlers catch and return it).
- `requireAdmin()` — throws 401 (no user) / 403 (not admin) based on `app_metadata.role`.

Two Supabase clients are used:
- **RLS client** (`createClient`, anon key + user cookies) — queries run as the logged-in user.
- **Admin client** (`createAdminClient`, service-role key) — **bypasses RLS**; used by admin
  routes and a few privileged player routes (scoped in code to the caller's own data).

`src/middleware.ts` only refreshes the session cookie — it performs **no route gating**. Every
route enforces its own authorization.

Validation is hand-rolled throughout (no Zod). Player-write routes validate carefully; admin/seed
routes largely trust the request body.

---

## Public / player API

| Method & path | Auth | Notes |
|---------------|------|-------|
| `GET /api/tournaments` | none (RLS) | List tournaments, newest year first |
| `GET /api/tournaments/[slug]` | none (RLS) | Tournament + groups (+teams) + knockout config + knockout matches |
| `GET /api/tournaments/[slug]/leaderboard` | none (RLS) | Entries + players sorted by `overall_rank` |
| `GET /api/tournaments/[slug]/pundit` | none | A random pundit snippet for today (enriched with name/colour) |
| `GET /api/tournaments/[slug]/posts` | none | Published posts |
| `GET /api/tournaments/[slug]/posts/[postSlug]` | none | A single published post |
| `POST /api/tournaments/[slug]/enter` | `requireAuth` | Create entry (status must be `group_stage_open`); blocks duplicates; fires entry email |
| `GET/POST /api/tournaments/[slug]/predictions/groups` | `requireAuth` | Read own / submit group predictions. POST enforces status `group_stage_open` + deadline, validates teams belong to the group, no duplicates, tiebreaker 0–999 |
| `GET/POST /api/tournaments/[slug]/predictions/knockout` | `requireAuth` | Read own / submit bracket picks. POST enforces status `knockout_open` + deadline, validates winner is in the match |
| `GET /api/tournaments/[slug]/predictions/all` | `requireAuth` | Everyone's predictions, gated by deadline visibility (403 until visible) |
| `GET/POST /api/tournaments/[slug]/golden-ticket` | `requireAuth` | Window + eligible swaps + all tickets / play a golden ticket. Uses the admin client scoped to the caller's own entry |
| `PATCH /api/profile` | `requireAuth` | Update own display name / nickname / avatar URL (validated) |

## Admin API

All require `requireAdmin()` and use the service-role client.

| Method & path | Notes |
|---------------|-------|
| `POST /api/tournaments` | Create a tournament (validates name/slug/type/year) |
| `DELETE /api/admin/tournaments/[slug]` | Delete a tournament (DB cascade) |
| `PATCH /api/admin/tournaments/[slug]/status` | Advance status — enforces the one-step-forward state machine |
| `PATCH /api/admin/tournaments/[slug]/stats` | Set `total_group_stage_goals` (non-negative integer) |
| `POST /api/admin/tournaments/[slug]/setup` | Full manual builder: upsert teams, recreate groups/fixtures/results/knockout matches; bracket generation branches on group count (6/8/12) |
| `POST /api/admin/tournaments/[slug]/import-url` | Scrape groups/teams/dates from an allow-listed HTTPS URL (cheerio). SSRF-hardened. Does not persist |
| `POST /api/admin/tournaments/[slug]/game-result` | Record a single group or knockout result; for knockout, **advances** the winner into the next match |
| `POST /api/tournaments/[slug]/results` | (Admin) bulk result upsert; does **not** advance winners |
| `POST /api/tournaments/[slug]/score` | (Admin) run `calculateAllScores` |
| `PATCH /api/admin/entries/[id]/payment` | Set payment status; recomputes the prize pool from paid entries; fires email |
| `POST/PATCH/DELETE /api/tournaments/[slug]/posts` & `/api/admin/tournaments/[slug]/posts` | Blog post create / edit / delete (verifies post belongs to the tournament) |

### Seeders & test harness (admin)
| Path | Notes |
|------|-------|
| `POST /api/admin/seed/wc2022` | Hardcoded 32-team WC2022 seed (delete-and-recreate) |
| `POST /api/admin/seed/wc2026` | Hardcoded 48-team / 12-group WC2026 seed incl. fixtures + schedule |
| `POST /api/admin/tournaments/[slug]/seed-entries` | Create test players + entries + group predictions |
| `POST /api/admin/tournaments/[slug]/seed-results` | Force-complete group stage + walk knockout to a target phase + seed picks + recalc |
| `POST /api/admin/tournaments/[slug]/reset-test-data` | Requires `{confirm:true}`; deletes predictions/entries/results/honours + test players; resets status |
| `POST /api/admin/tournaments/[slug]/force-complete` | Force-complete the group stage or one knockout round (simulated) |
| `POST /api/admin/tournaments/[slug]/time-machine` | One-click reset → seed entries → results → AI Emergency Subs → scores → achievements to a target phase |

## Webhooks / cron

| Method & path | Auth | Notes |
|---------------|------|-------|
| `POST /api/admin/tournaments/[slug]/generate-punditry` | header `x-cron-secret` **or** admin user | Calls the Anthropic Claude API per pundit, stores snippets, posts up to 4 into chat |
| `POST /api/webhooks/chat-message` | header `x-audit-secret` | Called by the DB trigger after a chat insert; fires the chat audit email (skips pundit/system messages) |

## Auth

| Method & path | Notes |
|---------------|-------|
| `POST /api/auth/register` | Public. Service-role creates an email-confirmed auth user + `players` row (rolls back the auth user on failure). No rate limiting / email-format validation |
| `GET /auth/callback` | Exchanges `?code` for a session; redirects to `?next` (default `/`) |

> Cross-cutting risks (public-by-omission routes, broad service-role use, the `pundit` GET 500
> path, secret comparison, `next` redirect) are detailed in [`code-review.md`](./code-review.md).
