# Data Model

Postgres on Supabase. Schema is defined across the migrations in `supabase/migrations/`
(20 files). TypeScript row types mirror it in `src/lib/types.ts`. All tables have **Row Level
Security (RLS)** enabled.

## Entity overview

```
tournaments ─┬─< groups ─< group_teams >─ teams
             │        └─< group_matches >─ teams
             │        └─< group_results >─ teams
             ├─< knockout_round_config
             ├─< knockout_matches >─ teams (home/away/winner)
             ├─< tournament_entries >─ players
             │        ├─< group_predictions >─ teams (1st/2nd/3rd)
             │        ├─< knockout_predictions >─ teams (winner)
             │        ├─< golden_tickets >─ teams + knockout_matches
             │        └─< player_achievements
             ├─< tournament_stats (1:1)
             ├─< honours >─ players
             ├─< posts
             ├─< pundit_snippets
             └─< chat_messages ─┬─< chat_reactions
                                ├─< chat_mentions
                                └── reply_to_id (self)
                  chat_read_cursors >─ players, tournaments
```

## Core tables

### `tournaments`
The top-level competition. Key columns: `name`, `slug` (UNIQUE), `type` (`world_cup`|`euros`),
`year`, `entry_fee_gbp` (default 10), `prize_pool_gbp`, `group_stage_prize_pct` (default 25),
`overall_prize_pct` (default 75), `group_stage_deadline`, `knockout_stage_deadline`, `status`
(default `draft`, CHECK across the 6 lifecycle states), `third_place_qualifiers_count`.
`updated_at` maintained by a trigger.

### `teams`
Global team catalogue. `name`, `code` (UNIQUE, e.g. `ENG`), `flag_emoji`, `flag_url`. Shared
across tournaments.

### `groups`, `group_teams`
`groups`: one per group per tournament (`name`, `sort_order`, UNIQUE(tournament, name)).
`group_teams`: membership join (group ↔ team, optional `seed_position`, UNIQUE(group, team)).

### `group_matches`
The actual round-robin fixtures within a group: `home_team_id`, `away_team_id`, `home_score`,
`away_score`, `scheduled_at`, `venue`, `sort_order`. Used to derive standings during simulation.

### `group_results`
The **final** outcome per team per group: `final_position` (1..n), `qualified` (bool).
UNIQUE(group, team). This is what group scoring reads.

### `knockout_matches`
One row per bracket tie. `round` (`round_of_32`|`round_of_16`|`quarter_final`|`semi_final`|
`final`), `match_number` (UNIQUE per tournament), `bracket_side` (`left`|`right`|null for final),
`home_source`/`away_source` (placeholder codes — see glossary), `home_team_id`/`away_team_id`/
`winner_team_id`, `home_score`/`away_score`, `points_value`, `sort_order`, `scheduled_at`, `venue`.

### `knockout_round_config`
Per-tournament per-round config: `points_value`, `match_count`, `sort_order`. Drives how many
points each round's correct pick is worth.

### `players`
`auth_user_id` → `auth.users` (NULL for the four AI pundit system players), `display_name`,
`nickname`, `email` (UNIQUE), `avatar_url`. The four pundits are seeded with fixed UUIDs
(`0000…0001`–`0004`).

### `tournament_entries`
A player's participation. `payment_status` (`pending`|`paid`|`refunded`), `tiebreaker_goals`,
`group_stage_points` (default 0), `knockout_points` (default 0),
**`total_points` = GENERATED ALWAYS AS (group_stage_points + knockout_points) STORED**,
`tiebreaker_diff`, `group_stage_rank`, `overall_rank`. UNIQUE(tournament, player). A
`BEFORE UPDATE` trigger (`check_entry_update_columns`) blocks non-admins from changing scoring,
ranking, payment, or ownership columns.

### `group_predictions`, `knockout_predictions`
`group_predictions`: per (entry, group) — `predicted_1st/2nd/3rd` (team FKs), `points_earned`,
`submitted_at`. UNIQUE(entry, group).
`knockout_predictions`: per (entry, match) — `predicted_winner_id`, `is_correct`,
`points_earned`, `submitted_at`. UNIQUE(entry, match).

### `tournament_stats`
1:1 with tournament. `total_group_stage_goals` — the actual total used for the tiebreaker.

### `golden_tickets`
One per entry (UNIQUE). Records a played **Emergency Sub** (the table keeps the original
"golden ticket" name): `original_match_id`, `original_team_id`, `new_team_id`,
`played_after_round`.

### `player_achievements`
Earned badges: `badge_type`, `description`, `earned_at`. UNIQUE(entry, badge_type).
Written only by the service role (admin scoring jobs).

### `honours`
The hall of fame/shame. `prize_type` (12 values incl. `overall_winner`, `runner_up`,
`wooden_spoon`, `hipster`, `bandwagon`, `nearly_man`, `custom`, …), `player_id` (nullable),
`player_name` (free text fallback), `prize_amount_gbp`, `description`, `points`, `sort_order`.
**No DB-level uniqueness** (the original constraint was dropped — app enforces it).

### `posts`
Per-tournament blog posts: `title`, `slug` (UNIQUE per tournament), `content` (markdown),
`author` (default `Admin`), `image_url`, `is_published`, `published_at`.

### `pundit_snippets`
Generated AI takes: `pundit_key` (`neverill`|`bright`|`meane`|`scaragher`), `content`,
`category` (`leaderboard`|`predictions`|`results`|`chat`|`news`|`wildcard`), `generated_date`.

## Chat tables

- **`chat_messages`** — `content` (CHECK ≤ 2000 chars), `reply_to_id` (self-FK, SET NULL on
  parent delete), `message_type` (`user`|`pundit`|`system`), `metadata` (JSONB, e.g. GIF url /
  pundit key), `is_pinned`. A `BEFORE INSERT` rate-limit trigger allows 1 message / 3s per
  player per tournament (system IDs exempt). An `AFTER INSERT` trigger calls the chat audit
  webhook via `pg_net`.
- **`chat_reactions`** — (message, player, emoji), 8 fixed emoji, UNIQUE per triple; published
  to Supabase Realtime.
- **`chat_mentions`** — (message, mentioned_player).
- **`chat_read_cursors`** — (player, tournament, `last_read_at`) — drives unread counts.

## Views, functions, triggers

- **View `public_player_profiles`** — `(id, display_name, nickname, avatar_url)` only (no
  email), created `WITH (security_invoker = true)`; granted to `anon` + `authenticated`.
- **Functions** — `update_updated_at_column()`, `is_admin()` (reads
  `auth.jwt() → app_metadata → role`), `get_player_id()` (auth.uid → players.id),
  `check_entry_update_columns()` (entry-update guard), `check_chat_rate_limit()`,
  `chat_messages_audit_notify()` (the webhook dispatcher, reads its secret from Supabase Vault).
- **Triggers** — `set_tournaments_updated_at`, `entry_update_guard`, `trg_chat_rate_limit`,
  `chat_messages_audit_trigger`.

## RLS summary

- **Reference/config tables** (`tournaments`, `teams`, `groups`, `group_teams`,
  `knockout_matches`, `knockout_round_config`, `group_results`, `group_matches`,
  `tournament_stats`, `honours`): readable by everyone (incl. anonymous); writes admin-only.
- **`players`**: a user reads their own row (+ admin); anonymous reads are scoped to players who
  appear in honours or who have entered a started tournament, plus the public view. Email is
  never exposed to anon.
- **Entries & predictions**: a player reads/writes only their **own**, and prediction writes are
  only allowed while the relevant stage is open and before the deadline. Everyone can read them
  **after** the relevant deadline passes (so the predictions/leaderboard pages work).
- **Achievements, golden tickets, pundit snippets**: readable broadly; **written only by the
  service role**.
- **Chat**: messages readable by all; insert only as yourself (rate-limited); reactions/cursors
  scoped to your own rows.
- **Storage `avatars` bucket**: public read; write only to a folder matching your `auth.uid()`.

> Security findings about specific RLS policies (notably the chat UPDATE policy) are recorded in
> [`code-review.md`](./code-review.md).
