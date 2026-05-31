# Test suite

Unit tests for the football-predictor game logic, built with **Vitest**.

```bash
npm test          # run once (CI)
npm run test:watch
```

## What's covered

| File | Module under test | Focus |
|------|-------------------|-------|
| `unit/utils.test.ts` | `src/lib/utils.ts` | `cn`, `formatCurrency`, `formatDate`, `slugify`, `stripMarkdown`, `truncateAtWord`, `getDeadlineStatus` (with fake timers) |
| `unit/badge-info.test.ts` | `src/lib/badge-info.ts` | Every `BadgeType` has display info; `BADGE_ORDER` is complete & unique |
| `unit/scoring.test.ts` | `src/lib/scoring.ts` | Group-stage scoring (qualify +1 / exact +1), knockout `points_value`, golden-ticket-match → 0, tiebreaker diff, ranking (ties, nulls-last, group-stage rank) |
| `unit/golden-ticket.test.ts` | `src/lib/golden-ticket.ts` | Window open/closed detection, eligible-swap discovery, apply + downstream cascade + audit row |
| `unit/achievements.test.ts` | `src/lib/achievements.ts` | early_bird/last_minute, perfect_group, lone_wolf, hive_mind, crystal_ball, giant_killer, hot_streak, dead_heat, contrarian, and idempotency |
| `unit/seed-helpers.test.ts` | `src/lib/testing/seed-helpers.ts` | `resolveGroupSource` (simple + composite), prediction generators (invariants), `KNOCKOUT_ROUNDS_ORDER`, `getExistingKnockoutRounds`, `TEST_PLAYERS` |

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
