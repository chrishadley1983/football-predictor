# Admin Guide

Admin access requires a Supabase user whose `app_metadata.role === 'admin'`. There is no UI to
grant this — set it in the Supabase dashboard / via the management API. The `/admin` subtree is
gated server-side; all admin APIs independently call `requireAdmin()`.

## Tournament lifecycle (typical run)

1. **Create** — `/admin/tournaments/new`: name (auto-slugged), type, year, entry fee, prize
   split (group % / overall %), deadlines. Starts in `draft`.
2. **Set up the structure** — `/admin/tournaments/[slug]/setup`:
   - Optionally **import** groups/teams/dates from an allow-listed Wikipedia-style URL (parsed,
     not saved automatically), **or** use a one-click **seed** (WC2022 / WC2026), **or** edit
     groups/teams by hand.
   - Saving runs the builder: it upserts teams, recreates groups, group fixtures, knockout
     matches, and the per-round points config. Bracket generation supports 6 / 8 / 12 group
     layouts.
3. **Open the group stage** — `/admin/tournaments/[slug]/manage`: advance status to
   `group_stage_open`. Players can now enter and predict.
4. **Manage entries & payments** — `/admin/tournaments/[slug]/entries`: mark each entry
   **paid**/**pending**. The prize pool is recomputed as `paid count × entry fee`.
5. **Close the group stage** — advance to `group_stage_closed` once the deadline passes.
6. **Enter group results** — `manage` or `results`: set each team's final position + qualified
   flag, and the actual `total_group_stage_goals` (for the tiebreaker).
7. **Recalculate scores** — `POST …/score` (a button on manage/results/testing). This runs group
   scoring → knockout scoring → tiebreakers → ranking. Run it again any time results change.
8. **Open / run the knockout** — advance to `knockout_open`, let players predict, then
   `knockout_closed`. Enter each knockout result; **`game-result` advances the winner** into the
   next bracket match automatically.
9. **Emergency Sub windows** open automatically between fully-decided rounds (no admin action).
10. **Complete** — advance to `completed`. Recalculate scores and achievements; populate the
    **honours** board.

> Status transitions are one-step-forward only; you cannot skip or reverse via the API.

## Results entry: two paths

- **`POST …/game-result`** (single result) — for knockout results it **advances the winner**
  into downstream matches. Prefer this for live knockout entry.
- **`POST …/results`** (bulk) — upserts many results but does **not** advance winners. Useful for
  back-filling group results.

## Test harness ("Time Machine")

`/admin/tournaments/[slug]/testing` lets you fast-forward a tournament to any phase with realistic
fake data — invaluable for development and demos:

- **Time Machine** — one click: reset → seed 10 archetype-based test players + entries + group
  predictions → simulate results → simulate AI golden-ticket usage → recalc scores → recalc
  achievements, all the way to the chosen phase.
- **Seed entries** / **Seed results** — run individual steps.
- **Reset test data** — requires explicit confirmation; deletes predictions, entries, results,
  honours, and the `@test.predictor.local` players, then resets status.
- A live state panel shows the current status and a leaderboard preview.

> ⚠️ The seed/reset routes perform **mass deletes** and run in the same app as production data;
> they are protected only by `requireAdmin()`. Use with care on a live tournament. See
> [`code-review.md`](./code-review.md) for the associated risk notes.

## Blog posts

`/admin/tournaments/[slug]/posts`: create/edit/delete markdown posts, set an image, and toggle
`is_published`. Published posts appear on the tournament's posts page and the home page.

## AI punditry

Generate daily pundit takes from `setup`/testing or via cron hitting
`POST …/generate-punditry` with the `x-cron-secret` header. Requires `ANTHROPIC_API_KEY`. Up to
four "chat"-category takes are also dropped into the tournament chat, time-staggered.

## Environment variables

| Var | Used for |
|-----|----------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + RLS server access |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client (RLS bypass) |
| `RESEND_API_KEY` | Audit email (optional — sends no-op without it) |
| `AUDIT_EMAIL_ENABLED` | Set `false` to disable all audit email (e.g. dev) |
| `CHAT_AUDIT_WEBHOOK_SECRET` | Shared secret for the chat audit webhook (must match the DB Vault value) |
| `ANTHROPIC_API_KEY` | AI pundit generation |
| `CRON_SECRET` | Optional cron auth for punditry generation |
