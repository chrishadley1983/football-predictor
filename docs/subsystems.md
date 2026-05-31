# Subsystems: Pundits, Chat, Email Audit

## AI Pundit system

Four parody pundit characters (`src/lib/pundit-characters.ts`) provide colour commentary:

| Key | Name | Persona |
|-----|------|---------|
| `neverill` | Gary Neverill | The Analyst — "looks right, sounds wrong" |
| `bright` | Ian Bright | The Enthusiast — relentlessly positive |
| `meane` | Roy Meane | The Enforcer — blunt, no-nonsense |
| `scaragher` | Jamie Scaragher | The Debater — argumentative Scouser |

Each maps to a deterministic system **player** row (`auth_user_id = NULL`, fixed UUIDs in
`pundit-players.ts`) so pundit chat messages reference a real player.

**Generation** (`POST /api/admin/tournaments/[slug]/generate-punditry`, runnable by cron via
`x-cron-secret` or by an admin):
1. Gathers live context — leaderboard, predictions, results, recent chat, tournament status.
2. For each pundit, builds a character system prompt (`pundit-prompts.ts`) asking for **15
   snippets as a strict JSON array**, each tagged with a category (`leaderboard`, `predictions`,
   `results`, `chat`, `news`, `wildcard`).
3. Calls the **Anthropic Claude API** directly (`model claude-sonnet-4-…`, 30 s timeout) with
   `ANTHROPIC_API_KEY`. Parses the JSON array, clamps unknown categories to `wildcard`.
4. Idempotent per day: deletes today's snippets for the tournament, inserts the new ones (via the
   service role, satisfying the service-role-only insert RLS).
5. Injects up to **4** `chat`-category snippets as `pundit` chat messages, staggered +5 min each
   so they appear naturally spaced.

Per-pundit failures are swallowed and logged; the route always returns 200. There is **no
external news API** — "news" is just a prompt category the model invents.

**Display** (`usePunditSnippet.ts` → `GET …/pundit`): returns a random snippet for today (falling
back to the most recent day), enriched with the pundit's name/colour. Rendered as a card on the
tournament hub (`PunditCard`) and a floating bubble on other tournament pages
(`PunditBubbleWrapper`). "Next take" refreshes.

## Realtime chat

Backed by Supabase Realtime + Postgres. The room (`ChatRoom`) loads recent messages and
subscribes to inserts/updates/deletes; a 15 s poll provides a fallback.

| Feature | Mechanism |
|---------|-----------|
| Messages | `chat_messages`; optimistic send with temp IDs + retry |
| Reactions | `chat_reactions`, 8 fixed emoji (⚽🔥😂💀👑🤡🫡🧊), realtime-published, own-row writes |
| Replies | `reply_to_id` self-FK (SET NULL when the parent is deleted) |
| @mentions | `chat_mentions` + `MentionAutocomplete` |
| GIFs | Tenor search (`GifPicker`); GIF url carried in message `metadata` |
| Presence & typing | `useChatPresence` over a Supabase presence channel; typing auto-clears after 3 s |
| Sound | `useChatSound` — Web Audio "ping", muted for background tabs, toggle persisted in `localStorage` |
| Pinned | `chat_messages.is_pinned` (intended admin-only), shown in `PinnedMessages` |
| Unread badge | `chat_read_cursors` (per player+tournament) compared to message timestamps; surfaced in the navbar |
| Rate limit | DB trigger: 1 message / 3 s per player per tournament (system/pundit IDs exempt) |
| Audit | `AFTER INSERT` trigger → `pg_net` → `/api/webhooks/chat-message` → audit email |

> The chat message UPDATE RLS policy is labelled "admin" but is not restricted to admins — see
> the security finding in [`code-review.md`](./code-review.md).

## Email audit system

Internal notifications (not user-facing transactional mail), sent via **Resend**.

- **Config** (`src/lib/email/client.ts`): a lazy Resend singleton from `RESEND_API_KEY`; if the
  key is absent, all sends become no-ops. `isAuditEmailEnabled()` is true unless
  `AUDIT_EMAIL_ENABLED === 'false'`.
- **Recipients** (`recipients.ts`): a single hardcoded inbox (`chrishadley1983@gmail.com`); from
  address is Resend's sandbox sender.
- **Dispatch** (`audit.ts`): `scheduleAuditEmail()` uses Next.js `after()` so the email is sent
  after the HTTP response flushes (survives serverless function freeze); `sendAuditEmail()` is
  the awaitable variant for background jobs/webhooks. **Both swallow all errors** — email failure
  never breaks the request.
- **Events** (discriminated union): `sign_up`, `tournament_entry`, `group_predictions_submitted`,
  `knockout_predictions_submitted`, `chat_message`, `payment_status_changed`, `profile_updated`,
  `golden_ticket_played`, and `admin_action` (sub-actions: `seed_tournament`, `reset_test_data`,
  `force_complete`, `status_change`).
- **Templates** (`templates/*`): one renderer per event, returning `{subject, html, text}` with
  subjects prefixed `[FPG audit]`. User-influenced content is HTML-escaped.

## Seeding / testing helpers

`src/lib/testing/seed-helpers.ts` underpins the admin test harness:

- `TEST_PLAYERS` — 10 personas under `@test.predictor.local`, each an **archetype** (`expert`,
  `average`, `wildcard`) that drives prediction accuracy.
- Generators — `generateGroupPrediction`, `generateKnockoutPrediction`,
  `generateTiebreakerGoals` (archetype-weighted).
- `KNOCKOUT_ROUNDS_ORDER` + `getExistingKnockoutRounds` — canonical round ordering.
- `resolveGroupSource` — resolves bracket source codes (`1A`, composite `3C/D/E`).
- Force-complete logic — simulates group fixtures and standings, selects qualifying 3rd-place
  teams with a **backtracking bracket-solvability check**, populates the bracket, simulates
  knockout winners and advances them, and can simulate AI golden-ticket usage.
