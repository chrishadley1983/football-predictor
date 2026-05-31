# Pages & User Flows

The root layout (`src/app/layout.tsx`) wraps every page in a global `<Navbar>`. Pages under
`tournament/[slug]/` share a layout that mounts the floating AI-pundit bubble.

Legend: **SC** = server component, **CC** = client component.

## Public & account pages

| Route | Type | Auth | Purpose |
|-------|------|------|---------|
| `/` | SC | — | Home: hero + intro video, current tournament card with mini-chat, recent posts, honours preview, previous tournaments |
| `/auth/login` | CC | — | Sign in with email+password **or** magic link (OTP) |
| `/auth/register` | CC | — | Create account (display name, optional nickname, email, password) then auto sign-in |
| `/auth/callback` | route | — | OAuth/magic-link code exchange → redirect |
| `/profile` | CC | redirects to login if signed out | Edit display name/nickname; upload avatar (Supabase Storage, 2 MB cap) |
| `/honours` | SC | — | Full honours board grouped by tournament (Roll of Honour + Wall of Shame) |

## Tournament pages (`/tournament/[slug]/…`)

| Route | Type | Gating | Purpose |
|-------|------|--------|---------|
| `…` (hub) | SC | — | Header, fee/prize/entries/split cards, deadlines, pundit card, nav grid. Action links appear only for the matching status |
| `…/rules` | SC | — | Static explainer of scoring, tiebreaker, prizes (uses the tournament's prize split) |
| `…/enter` | CC | Enter requires login | Shows fee + manual-payment notice; "Enter Tournament" creates the entry, then redirects to group predictions. If already entered, shows edit links |
| `…/predict/groups` | CC | login + entry | One card per group: 1st/2nd/3rd selects, optional 3rd-place-qualifier toggle, tiebreaker goals. Read-only once the deadline passes / stage closes |
| `…/predict/knockout` | CC | login + entry | Interactive bracket (click a team to pick the winner), pending-changes tracker + "Save All", golden-ticket banner/modal/summary |
| `…/predictions` | SC | hidden until group deadline | Prediction analyser (solo + head-to-head), golden-ticket summary, full prediction grid |
| `…/leaderboard` | SC | — | Sortable leaderboard + badge legend |
| `…/results` | SC | — | Group standings, group fixtures, read-only knockout bracket |
| `…/chat` | SC shell | login to view | Realtime `ChatRoom` (or a "log in" prompt) |
| `…/posts` | SC | — | List of published blog posts |
| `…/posts/[post-slug]` | SC | — | A single post (markdown) |

## Admin pages (`/admin/…`)

The whole subtree is gated server-side by `admin/layout.tsx` (`redirect('/')` unless
`app_metadata.role === 'admin'`). See [`admin-guide.md`](./admin-guide.md) for detail.

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard of all tournaments + status badges; per-tournament links; seed + new-tournament + delete |
| `/admin/tournaments/new` | Create-tournament form |
| `…/[slug]/setup` | Import structure from a URL (Wikipedia), edit groups/teams, seed WC2022/WC2026, preview bracket |
| `…/[slug]/manage` | Status transitions, total-goals tiebreaker, recalc scores, inline result entry |
| `…/[slug]/results` | Force-complete group stage / each knockout round (simulated), manual result entry, recalc |
| `…/[slug]/testing` | "Time machine" — reset + seed + results to any phase; live state panel + leaderboard preview |
| `…/[slug]/entries` | Entry table; mark paid/pending; prize-pool calculation |
| `…/[slug]/posts` | CRUD blog posts (markdown), publish toggle |

---

## End-to-end journeys

### Register / sign in
`/auth/register` → `POST /api/auth/register` creates a Supabase auth user (email
pre-confirmed) and a `players` row → client signs in → redirect home. Returning users use
`/auth/login` (password or magic link → `/auth/callback` → session). The navbar reflects auth
state and shows an unread-chat badge.

### Enter a tournament & pay
From the hub while `group_stage_open` → `/tournament/[slug]/enter` → "Enter Tournament"
(`POST …/enter`) creates an entry with `payment_status = pending` and fires an audit email →
redirect to group predictions. **Payment is manual**: the admin marks the entry paid in
`/admin/…/entries`. Players may predict before payment is confirmed.

### Group predictions
`/predict/groups`: each group card has 1st/2nd/3rd selectors (+ an optional 3rd-place-qualifier
checkbox limited to `third_place_qualifiers_count`) and a tiebreaker goals input. Each card saves
via `POST …/predictions/groups`, which re-checks status + deadline server-side and validates that
every picked team actually belongs to the group and that there are no duplicates.

### Knockout predictions
`/predict/knockout`: click a team in the bracket to set the winner (kept in local pending state),
then "Save All Predictions" batches them to `POST …/predictions/knockout`. The API validates that
each predicted winner is one of the two teams in that match. Locked after the knockout deadline.

### Golden ticket
On the knockout page, after a round finishes, `GET …/golden-ticket` returns the window state and
the player's eligible swaps (their wrong picks in the just-completed round). A gold banner opens
the modal → choose a wrong pick → `POST …/golden-ticket` swaps it to the actual winner and
cascades it forward. One per tournament, irreversible; the ticket match scores 0.

### View predictions / leaderboard / results
- **Predictions** (hidden until the group deadline): solo & head-to-head analyser with per-group
  and per-round points, badges and golden-ticket markers; a colour-coded grid that even flags
  "impossible" picks (a team eliminated in an earlier round).
- **Leaderboard**: client-side sortable by total / group / knockout / tiebreaker, expandable
  rows, badges, current-user highlight.
- **Results**: group standings, fixtures, and a read-only bracket.

### Chat
`/chat` loads the last ~100 messages and subscribes to Supabase Realtime (plus a poll fallback).
Supports optimistic send with retry, @mentions, GIFs (Tenor), 8 fixed reactions, replies,
presence/typing, sound, a 3-second cooldown, admin delete/pin (max 3 pinned), and read cursors
that feed the navbar unread badge.

### Honours
`/honours` (and the home-page preview) groups awards by tournament into a "Roll of Honour" (main
prizes) and a "Wall of Shame" (wooden spoon / worst tiebreaker / fun awards).

> Known UX issues (e.g. two internal links that 404, missing loading/error states) are listed in
> [`code-review.md`](./code-review.md).
