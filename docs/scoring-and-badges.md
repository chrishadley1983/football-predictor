# Scoring, Ranking, Emergency Sub & Badges

All scoring logic lives in `src/lib/scoring.ts`, achievements in `src/lib/achievements.ts`, and
golden-ticket mechanics in `src/lib/golden-ticket.ts`. Scoring is **recalculated on demand** by
an admin (via `POST /api/tournaments/[slug]/score` or the management/testing screens), never
automatically on result entry.

`calculateAllScores(tournamentId)` runs four steps in order:
1. `calculateGroupStageScores`
2. `calculateKnockoutScores`
3. `calculateTiebreakers`
4. `calculateRankings`

---

## 1. Group-stage scoring

For each group prediction, each of the three predicted slots (1st, 2nd, 3rd) is scored against
the actual `group_results`:

| Outcome for a predicted team | Points |
|------------------------------|--------|
| Team **qualified** from the group | **+1** |
| Team qualified **and** finished in the **exact predicted position** | **+1 bonus** (so 2 total) |
| Team did not qualify | 0 |
| Slot left empty (`null`) or unknown team | 0 (skipped) |

So a perfectly predicted top-two (or top-three) group yields 2 points per correct slot. The
per-prediction total is written to `group_predictions.points_earned`; the per-entry total to
`tournament_entries.group_stage_points`.

> Note: the **3rd** slot is optional. When a tournament uses 3rd-place qualifiers
> (`third_place_qualifiers_count` set), a predicted 3rd team that qualifies scores like any
> other; otherwise the slot is typically left null.

## 2. Knockout scoring

For each knockout prediction on a **decided** match (one with a `winner_team_id`):

- If `predicted_winner_id === winner_team_id` → award the match's `points_value`.
- Otherwise → 0.
- `is_correct` is set to reflect the pick regardless of points.

Later rounds carry higher `points_value` (configured per round in `knockout_round_config`), so
correctly predicting deep runs is worth more.

**Emergency Sub exception:** the specific match a player used their Emergency Sub on always
scores a **−6 point penalty**, even though the swapped-in pick is "correct" by construction.
Points resume normally from the next round onward. Undecided matches are skipped.
(The Emergency Sub is the user-facing name for what the code/database still call the "golden
ticket" — `golden_tickets` table, `golden-ticket.ts`.)

The per-entry total is written to `tournament_entries.knockout_points`.

`total_points` is a **generated column** in the database = `group_stage_points + knockout_points`
(it cannot be written directly and is always consistent).

## 3. Tiebreaker

Each entry's `tiebreaker_goals` (their guess for total group-stage goals) is compared to the
actual total in `tournament_stats.total_group_stage_goals`:

```
tiebreaker_diff = |tiebreaker_goals − actual_total_group_stage_goals|
```

A null guess stays null. If the actual total is unknown, this step is a no-op.

## 4. Ranking

Two ranks are computed and stored on each entry:

**Overall rank** (`overall_rank`) — sort by:
1. `total_points` **descending**
2. `tiebreaker_diff` **ascending**, with **nulls last**
3. `knockout_points` **descending**

**Group-stage rank** (`group_stage_rank`) — sort by:
1. `group_stage_points` descending
2. `tiebreaker_diff` ascending, nulls last

Ties are handled with **standard competition ranking**: entries equal on every criterion share
the same rank, and the next distinct entry skips ahead (e.g. `1, 1, 3`).

---

## Emergency Sub (a.k.a. golden ticket)

The **Emergency Sub** is the user-facing name for a once-per-tournament retroactive correction
for knockout predictions. The code and database still use the original "golden ticket" naming
(`src/lib/golden-ticket.ts`, table `golden_tickets`, UNIQUE per entry).

**When the window is open** (`getGoldenTicketWindow`): a round is **fully decided** (every match
has a winner) **and** the **next round is entirely undecided** (no winners yet). The window
detection walks rounds in canonical order and reports the latest such boundary.

**Eligible swaps** (`getEligibleSwaps`): within the just-completed round, the matches where the
player predicted the **loser**. The only allowed swap target is the **actual winner** of that
match.

**Applying** (`applyGoldenTicket`):
1. The player's prediction for the ticket match is changed to the actual winner.
2. The new team is **cascaded downstream**: every later match in that bracket branch (followed
   via `W{matchNumber}` source references) has the player's pick forced to the new team.
3. An audit row is inserted into `golden_tickets` (original team, new team, round).

**Scoring impact:** the Emergency Sub match scores a **−6 penalty** (see above); the cascaded
picks score normally from the next round. Using it is a calculated gamble — you fix a wrong
pick and carry the right team forward, but eat 6 points on the swapped match.

The admin test harness can simulate AI players using the Emergency Sub (`processAIGoldenTickets`
in `seed-helpers.ts`) with archetype-based probabilities.

---

## Achievement badges

Computed by `calculateAchievements(tournamentId)` (idempotent — it deletes and recomputes all
badges for the tournament each run). Display metadata (emoji/name/hint) is in
`src/lib/badge-info.ts`. There are **11** badge types:

### Group-stage badges
| Badge | Emoji | Awarded to |
|-------|-------|------------|
| **Early Bird** | ⏰ | The player who submitted their (first) prediction earliest |
| **Last Minute** | 🏃 | The player who submitted latest (if different from Early Bird) |
| **Perfect Group** | ✨ | Any player who nailed the **exact** position of every predicted slot in at least one group |
| **Lone Wolf** | 🐺 | A player with a correct position pick that **no other** player also got right |
| **Hive Mind** | 🐝 | The player whose picks most often matched the **most popular** pick (the consensus) |

### Knockout badges
| Badge | Emoji | Awarded to |
|-------|-------|------------|
| **Crystal Ball** | 🔮 | Anyone who correctly predicted the **tournament winner** (the final) |
| **Giant Killer** | ⚔️ | The **sole** correct predictor of a knockout match |
| **Hot Streak** | 🔥 | A player with **5+ consecutive** correct knockout picks (ordered by match sort order) |
| **Golden Touch** | 🎫 | A player whose **Emergency Sub** team went on to win its next match |

### End-of-tournament badges (only when `status` is `knockout_closed` or `completed`)
| Badge | Emoji | Awarded to |
|-------|-------|------------|
| **Dead Heat** | 🎯 | Any player whose tiebreaker was **within 5 goals** of the actual total |
| **Contrarian** | 🦄 | The player with the **fewest** prediction overlaps with everyone else |

Badges are surfaced on the leaderboard (with a collapsible legend) and in the prediction
analyser. The full ordered list for legends is `BADGE_ORDER`.
