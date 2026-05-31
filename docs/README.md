# Football Predictor — Functional Documentation

A web app for running a **football tournament prediction game** (FIFA World Cup / UEFA Euros)
among a private group of players. Players pay an entry fee, predict group-stage finishing
positions and the full knockout bracket, earn points as real results come in, compete on a
leaderboard, collect achievement badges, get one retroactive "golden ticket" do-over, banter in
a realtime chat, and read takes from four AI pundit characters. An admin runs the tournament
lifecycle, enters results, and triggers scoring.

> **Note on "aims":** the repository contains no committed PRD/spec, though the scoring code
> references an external "spec section 7.x". This documentation reconstructs the intended
> behavior from the implementation, the database schema, and the git history. Where the code
> diverges from its own stated intent, that is captured in **`code-review.md`**, not here.

## Contents

| Doc | What's in it |
|-----|--------------|
| [`overview.md`](./overview.md) | Product summary, tech stack, tournament lifecycle, glossary |
| [`data-model.md`](./data-model.md) | All database tables, columns, relationships, RLS, triggers, views |
| [`scoring-and-badges.md`](./scoring-and-badges.md) | Group/knockout scoring, tiebreaker, ranking, golden ticket, all 11 badges |
| [`user-flows.md`](./user-flows.md) | Every page and the end-to-end player journeys |
| [`api-reference.md`](./api-reference.md) | Every API route: method, auth, inputs, outputs |
| [`admin-guide.md`](./admin-guide.md) | Admin tools, tournament setup, results entry, test/time-machine harness |
| [`subsystems.md`](./subsystems.md) | AI pundits, realtime chat, email audit system |
| [`code-review.md`](./code-review.md) | Gaps, bugs, and security findings vs. the intended behavior |

## Tech stack

- **Next.js 16** (App Router, React 19, Turbopack), TypeScript, Tailwind CSS v4
- **Supabase** — Postgres, Auth, Row Level Security, Realtime, Storage (avatars)
- **Resend** — internal audit email
- **Anthropic Claude API** — AI pundit snippet generation
- **Tenor** — chat GIF search
- Deployed on **Vercel** (`https://football-predictor-six.vercel.app`)

## Running locally

```bash
npm install
# .env.local needs: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (optional), AUDIT_EMAIL_ENABLED,
#   CHAT_AUDIT_WEBHOOK_SECRET, ANTHROPIC_API_KEY (for punditry), CRON_SECRET (optional)
npm run dev      # http://localhost:3000
npm test         # unit test suite (Vitest)
```
