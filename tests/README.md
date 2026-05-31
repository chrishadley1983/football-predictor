# Test suite

Tests for the football-predictor app, built with **Vitest** (+ React Testing Library / jsdom
for components). 140 tests across five layers.

```bash
npm test          # run once (CI)
npm run test:watch
```

## Layers

```
tests/
  unit/           pure game logic (utils, badge-info, scoring, golden-ticket, achievements, seed-helpers)
  auth/           auth helpers (requireAuth/requireAdmin/getCurrentPlayer), register route, secure-compare
  routes/         API handler behaviour (predictions groups/knockout, payment, status state machine)
  test-functions/ the admin test harness: env gate, time-machine/reset/seed gating, force-complete logic
  components/     front-end components rendered in jsdom (Button, Badge, PlayerAvatar, BadgeLegend)
  performance/    scale + pagination (1,000-row cap) correctness and a time budget
  helpers/        in-memory fake Supabase client
  stubs/          server-only no-op
  setup.ts        jest-dom matchers
```

## What's covered (highlights)

| Area | Focus |
|------|-------|
| **Scoring** (`unit`) | qualify +1 / exact +1, knockout `points_value`, **Emergency Sub −6 penalty**, tiebreaker diff, ranking (ties, nulls-last, group-stage rank) |
| **Emergency Sub / golden ticket** (`unit`) | window detection, eligible swaps, apply + downstream cascade + audit row |
| **Achievements** (`unit`) | all 11 badge rules + idempotency |
| **Auth** (`auth`) | session resolution, 401/403 gating, register validation + auth-user rollback + no admin-escalation, constant-time secret compare |
| **Routes** (`routes`) | status + deadline gating, team-in-group / winner-in-match validation, upsert-in-place, payment + prize-pool recompute, status **state-machine** (no skip/reverse) |
| **Test harness** (`test-functions`) | `ENABLE_TEST_HARNESS` production gate (403), time-machine/reset confirm guards, `forceCompleteKnockoutRoundLogic` + `advanceWinnerLogic` |
| **Components** (`components`) | render, click handlers, disabled/loading, status-label mapping, avatar fallback, collapsible badge legend |
| **Performance** (`performance`) | `fetchAllRows` returns all rows past the 1,000 cap; scoring/ranking correct + within budget at 2–3k entries |

## How the data-coupled functions are tested

`scoring.ts`, `achievements.ts`, `golden-ticket.ts` and `seed-helpers.ts` all talk to
Supabase via `createAdminClient()`. Rather than mocking individual calls, the suite uses a
small **in-memory fake Supabase client** (`helpers/fake-supabase.ts`) that implements exactly
the query surface these modules use (`select/eq/in/not/or/order/single`, `update/insert/delete`,
thenable for `await` and `Promise.all`). Tests seed tables, run the *real* production function,
then assert on the resulting in-memory rows.

`createAdminClient` is swapped for the fake with `vi.mock('@/lib/supabase/admin', …)`.
The Next.js `server-only` guard is aliased to a no-op stub (`vitest.config.ts` →
`tests/stubs/server-only.ts`) so server modules import cleanly under Node.

## Known-bug characterization tests

`utils.test.ts` pins the current (incorrect) behavior of `stripMarkdown` on image syntax — see
the code-review report. When that bug is fixed, update the test.

## Not covered here

Route handlers, React components, and realtime/chat are not unit-tested (they need request
mocking / a DOM / a live Supabase). The installed `playwright` dependency is the intended
vehicle for end-to-end coverage of those — see the code-review report's recommendations.
