# Code Review — Gaps & Errors vs. Project Aims

**Scope:** the whole `football-predictor` codebase as of branch `main` (HEAD `d5d844e`).
**Method:** full read of the core game logic, schema migrations, API routes, frontend, and
subsystems, cross-checked against the reconstructed project aims (a *fair, correct* prediction
game run as a *secure private competition*). No application code was changed.
**Aims reference:** no PRD/spec is committed; `scoring.ts` cites an external "spec section 7.x".
Aims were reconstructed from code + git history (see [`overview.md`](./overview.md)).

Each finding lists a severity, the location, the problem, why it matters against the aims, and a
recommended fix. Findings marked **✅ verified** were confirmed directly in source during review.

---

## Critical / High

### H1 — Any authenticated user can edit, pin, or delete-content of *any* chat message ✅ verified
**Where:** `supabase/migrations/20260228200000_chat_phase2_3.sql:94-98`
```sql
CREATE POLICY "Admins can update messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
```
**Problem:** despite the name, the policy is **not** restricted to admins. Any logged-in user can
`UPDATE` any row in `chat_messages` — rewrite another player's `content`, toggle `is_pinned`,
flip `message_type` to `pundit`/`system`, or alter `metadata`.
**Impact:** message tampering and impersonation in a social game whose whole point is banter and
trust — a real privilege-escalation/integrity bug. The UI only exposes pin/delete to admins, but
the database does not enforce that, so a crafted request bypasses the UI.
**Fix:** restrict to `USING (is_admin()) WITH CHECK (is_admin())`. If players should be able to
edit *their own* messages, add a separate, narrow self-update policy
(`USING (player_id = get_player_id())`) limited to the `content` column via a trigger.

### H2 — Two primary call-to-action links 404 ✅ verified
**Where:** `src/app/page.tsx:65` (`href="/register"`) and
`src/app/tournament/[slug]/chat/page.tsx:54` (`href="/login"`).
**Problem:** the real routes are `/auth/register` and `/auth/login` (the navbar uses the correct
paths). The home page "Join Now" button and the chat "log in" prompt both lead to a 404.
**Impact:** the home-page sign-up CTA — the top of the acquisition funnel — is broken, as is the
prompt that converts a logged-out chat viewer into a participant. Directly undermines the aim of
getting players in.
**Fix:** change to `/auth/register` and `/auth/login`.

---

## Medium

### M1 — Tournament `setup` silently produces no bracket for unsupported group counts
**Where:** `src/app/api/admin/tournaments/[slug]/setup/route.ts` (bracket generation branches on
`groups.length` ∈ {6, 8, 12}; no `else`).
**Problem:** if an admin configures any other number of groups, teams/groups are created but **no
knockout matches** are generated, with no error returned.
**Impact:** a half-built tournament that looks fine until the knockout stage, when there is
nothing to predict. Contradicts the aim of a complete, runnable competition.
**Fix:** validate `groups.length` against supported layouts and return a 422 listing the
supported counts; or generalise bracket generation.

### M2 — Two result-entry paths with different behaviour invite inconsistent brackets
**Where:** `POST …/game-result` advances the knockout winner into the next match;
`POST …/tournaments/[slug]/results` (bulk) does **not**.
**Problem:** functional overlap with a silent semantic difference. Using the bulk path for
knockout results leaves downstream matches un-advanced (teams never populate).
**Impact:** broken bracket progression and therefore wrong/absent knockout scoring — a
correctness risk for the core game.
**Fix:** consolidate to one code path, or make the bulk path advance winners too; at minimum
document the difference loudly in the admin UI.

### M3 — Destructive seed/reset routes run against live data, guarded only by `requireAdmin`
**Where:** `…/reset-test-data` (mass deletes incl. `players.email LIKE '%@test.predictor.local'`),
`…/seed-*`, `…/time-machine`, `…/setup` (delete-and-recreate).
**Problem:** these perform mass deletes in the same app/database as production. `reset-test-data`
requires `{confirm:true}` (good), but the others do not, and all rely solely on an admin session.
**Impact:** a mis-click or a mis-set `TEST_EMAIL_DOMAIN` could wipe real entries/predictions.
Against the aim of a dependable competition of record.
**Fix:** gate behind an explicit non-production env flag or a per-tournament "test mode" boolean;
require typed confirmation on all destructive routes; never expose them in a production build.

### M4 — No input validation library; admin/seed routes trust the request body
**Where:** all routes (no Zod). Player-write routes validate by hand reasonably well; admin/setup
routes largely `as`-cast the body (e.g. `setup`, `game-result`).
**Problem:** the project's sibling conventions (and good practice) call for schema validation.
`game-result`'s group branch doesn't even verify the `group_id` belongs to the tournament.
**Impact:** malformed admin payloads can corrupt tournament state; a cross-tournament write is
possible. Lower likelihood (admin-only) but high blast radius.
**Fix:** add Zod schemas for every route body; verify all foreign IDs belong to the path's
tournament.

### M5 — Hardcoded production webhook URL in a migration
**Where:** `supabase/migrations/20260421120000_chat_audit_webhook.sql:33` — `net.http_post` to
`https://football-predictor-six.vercel.app/...`.
**Problem:** every database this migration runs against (preview branches, a forked dev DB, the
**shared DB this checkout points at**) will POST chat inserts to the production app.
**Impact:** cross-environment leakage of chat-audit notifications; brittle to domain changes.
**Fix:** read the target URL from Vault/GUC like the secret already is, set per environment.

### M6 — Pagination / 1,000-row cap ignored on growing tables
**Where:** `…/leaderboard`, `…/predictions/all`, `predictions/page.tsx`, `ChatRoom` (100-msg
load), punditry context queries.
**Problem:** Supabase returns max 1,000 rows by default; these read entries/predictions without
pagination. Fine for a small friends' pool, but the prediction grid could silently truncate on a
large tournament.
**Impact:** silently incomplete leaderboard/predictions — a correctness risk if the game ever
scales. (The sibling project's CLAUDE.md explicitly warns about this cap.)
**Fix:** paginate, or assert/limit explicitly and surface when truncation occurs.

---

## Low

### L1 — `stripMarkdown` never strips images ✅ verified (test-pinned)
**Where:** `src/lib/utils.ts:35-52`.
**Problem:** the link-replacement regex runs **before** the image regex, so `![alt](url)` is
reduced to `!alt` (the image regex then finds no brackets to match). Images are never removed.
**Impact:** post previews/excerpts that contain images render stray `!alt` text.
**Fix:** run the image regex before the link regex. A characterization test in
`tests/unit/utils.test.ts` pins the current behaviour; update it when fixed.

### L2 — Public `GET …/pundit` can throw an unhandled 500 ✅ verified
**Where:** `src/app/api/tournaments/[slug]/pundit/route.ts:69-76` — `PUNDITS[punditKey]` is used
without a null guard and the handler has no try/catch.
**Problem:** if a snippet's `pundit_key` is not in the `PUNDITS` map, `pundit.name`/`pundit.color`
throws. A DB `CHECK` constraint currently limits `pundit_key` to the four valid values, so this
is latent rather than live — but it is one schema/seed change away from a public 500.
**Fix:** guard `pundit` (fallback to `{pundit_key:null}`) and wrap the handler in try/catch.

### L3 — Auth callback `next` parameter is not restricted to relative paths
**Where:** `src/app/auth/callback/route.ts:7`.
**Problem:** `next` is interpolated into the redirect after the trusted origin. It's origin-
prefixed (so not a classic open redirect), but a value like `//evil.com` can still resolve
oddly.
**Fix:** accept only values starting with a single `/` (reject `//` and absolute URLs).

### L4 — Webhook/cron secrets compared with plain string equality
**Where:** `generate-punditry/route.ts` (`x-cron-secret`), `webhooks/chat-message/route.ts`
(`x-audit-secret`).
**Problem:** non-constant-time comparison (timing side-channel) on shared bearer secrets.
**Fix:** use a constant-time compare (`crypto.timingSafeEqual`).

### L5 — Tenor (GIF) API key hardcoded client-side
**Where:** `src/components/chat/GifPicker.tsx:18`.
**Problem:** the key is committed and unrestricted in the client bundle.
**Fix:** proxy GIF search through a server route, or at least restrict the key by referrer and
move it to env.

### L6 — No global loading / error / not-found UI; server fetch errors are swallowed
**Where:** no `loading.tsx`/`error.tsx`/`not-found.tsx` anywhere in `app/`; many server
components `console.error` and render empty sections (e.g. `page.tsx`, `leaderboard/page.tsx`,
`MiniChat.tsx`).
**Impact:** transient backend failures appear to users as empty pages with no explanation.
**Fix:** add route-segment `error.tsx`/`loading.tsx`; show a user-facing message on fetch
failure.

### L7 — Prediction pages give logged-out / non-entered users a bare error string
**Where:** `predict/groups/page.tsx`, `predict/knockout/page.tsx`; hub action cards
(`tournament/[slug]/page.tsx`) render for the right status regardless of auth.
**Impact:** clicking "Group Predictions" while logged out lands on a red error string instead of a
login/enter CTA — a confusing dead end.
**Fix:** detect the unauthenticated/not-entered states and redirect to login or the enter page.

### L8 — Navbar unread-count poll closes over stale state
**Where:** `src/components/ui/Navbar.tsx:93-104`.
**Problem:** the 30 s interval captures `player` from first render (empty dep array), so periodic
unread refresh never runs for a user who logged in after mount until a reload/auth change.
**Fix:** include `player` in the effect deps (or use a ref) so the interval sees the current
player.

### L9 — Honours has no DB-level uniqueness
**Where:** the original `UNIQUE(tournament_id, prize_type)` was dropped in
`20260209230000_fix_honours_unique.sql`; uniqueness now relies on app logic.
**Impact:** duplicate awards are possible if anything writes honours outside the intended path.
**Fix:** re-introduce an appropriate partial/unique constraint, or document the intentional
flexibility (e.g. multiple `custom` prizes).

### L10 — Minor dead/confusing code in chat
**Where:** `ChatRoom.tsx:220-224` (an INSERT-handler `setMessages` that always `return prev`),
`ChatRoom.tsx:430` (`message_type: isGif ? 'user' : 'user'` — a no-op ternary).
**Impact:** none functionally; obscures intent and risks future bugs.
**Fix:** delete the dead block; drop the no-op ternary.

---

## Correctness observations (not defects)

- **`total_points` is a STORED generated column** (`= group_stage_points + knockout_points`)
  ✅ verified — it cannot drift and cannot be tampered with by players. Good.
- **The entry-update guard trigger** blocks non-admins from changing scoring/ranking/payment/
  ownership columns — a solid defence for competition integrity.
- **`import-url` is SSRF-hardened** (HTTPS-only, domain allowlist, no redirects, size/time caps).
- **Scoring, ranking (incl. ties + nulls-last), golden-ticket cascade, and the badge rules behave
  as intended** — now pinned by the unit suite in `tests/` (68 tests, all green).

---

## Test & quality recommendations

The new unit suite (`tests/`, Vitest) covers the pure game logic well. To raise confidence
further, in rough priority order:

1. **Route handler tests** — at least for the prediction-submission and golden-ticket routes
   (status/deadline gating, team-membership validation), using mocked request + auth.
2. **RLS regression tests** — a small integration suite (against a disposable Supabase project)
   asserting that a non-admin *cannot* update another player's chat message, scoring columns, or
   payment status. This would have caught **H1**.
3. **E2E happy path** — Playwright is already a dependency: register → enter → predict groups →
   predict knockout → see leaderboard. This would have caught **H2**.
4. **Add Zod** and share schemas between client and server validation (addresses **M4**).
5. **CI** — wire `npm run lint`, `npm test`, and `next build` into a pre-merge check.

## Suggested fix order

1. **H1** (security) and **H2** (broken CTAs) — quick, high impact.
2. **M5/M3** (environment safety: webhook URL + destructive routes) before any further shared-DB
   work.
3. **M1/M2/M4** (tournament-build & results correctness).
4. The **Low** items as cleanup, ideally each landed with a regression test.
