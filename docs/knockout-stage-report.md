# Knockout Stage — Build & Test Report

**For:** Tom
**From:** Chris (+ Claude Code)
**Date:** 18 June 2026
**Where it was tested:** the hidden **World Cup 2026 (Test)** tournament (`wc-2026-test`) only. The live **World Cup 2026** game and its 53 real entries were never touched.

---

## 1. In a nutshell

The full Knockout Stage experience you described is built, deployed to production, and has been run end‑to‑end against the test tournament. Players can now fill out a complete bracket through to the Final, the **Emergency Sub** works exactly as you specified, scoring is correct round‑by‑round, and there are clear ways to compare everyone's picks and see who has (and hasn't) used their sub.

A 10‑player tournament was simulated from the Round of 32 all the way to the Final, and **every single score was independently re‑checked by an automated test** — all correct.

One thing worth knowing up front: the **"Emergency Sub"** is the feature that already existed in the game under the name **"Golden Ticket."** It already followed your rules almost to the letter, so rather than build a duplicate we standardised it on the name **"Emergency Sub"** everywhere players see it, and finished off the missing pieces (the roster of who's used it, the goal‑total tiebreaker, etc.).

---

## 2. Your requirements, point by point

### Starting point
| Your requirement | Status | Notes |
|---|---|---|
| Admin can place each of the 32 qualifying countries into the correct knockout slot | ✅ Done | New **Bracket Setup** admin page: a dropdown for every Round‑of‑32 slot, with duplicate‑team warnings, plus a one‑click **Auto‑fill from group results**. |

### The bracket & scoring
| Your requirement | Status | Notes |
|---|---|---|
| Players predict the winner of every game through to the Final (excluding 3rd‑place playoff) | ✅ Done | You pick your Round‑of‑32 winners and they **flow forward** automatically — your picks become the teams in the next round, so you can pick a winner all the way to the champion. |
| Brackets editable any time until the Knockout Stage begins | ✅ Done | Editable while the stage is "open"; saving is blocked once it locks. |
| Once the stage starts, the bracket can't be changed — except via the Emergency Sub | ✅ Done | Enforced on the server, not just the screen. |
| Points double each round: 1 (R32), 2 (R16), 4 (QF), 8 (SF), 16 (Final) | ✅ Done & verified | An automated test re‑calculated every player's score from scratch and confirmed it matched. |
| Goal total included as a tiebreaker | ✅ Done | A **dedicated knockout goal‑total** guess (separate from the group‑stage one) entered on the bracket page and used to break ties. |

### The Emergency Sub
| Your rule | Status | Notes |
|---|---|---|
| Each player can use it **once and only once** | ✅ Done | Enforced — a second attempt is rejected. |
| Using it costs a **6‑point penalty** | ✅ Done & verified | The −6 shows up in scoring; the test confirmed it. |
| You can only replace a team you predicted to win with the team that knocked them out, and nothing else | ✅ Done | The only swap offered is the loser → the team that actually beat them; that change then cascades through all later rounds (your Spain → USA example works exactly like that). |
| Window opens after each round | ✅ Done | After each round completes, anyone with an eligible swap who hasn't used theirs is offered it. |

### Usability
| Your requirement | Status | Notes |
|---|---|---|
| Easy way to see everyone's predictions | ✅ Done | The **Predictions** page shows every player's full bracket round‑by‑round, plus a **Predicted Champion** row so you can compare everyone's tournament‑winner pick at a glance. |
| Easy way to compare your picks to someone else's (like the Group Stage) | ✅ Done | The head‑to‑head comparison now includes the knockout rounds, with points per round and "impossible pick" greying. |
| Easy & obvious way to play your Emergency Sub | ✅ Done | A gold "🔄 Use Emergency Sub" prompt appears on your bracket the moment it becomes available. |
| Easy to see who has & hasn't played their Emergency Sub | ✅ Done | An **Emergency Subs** roster lists every player as **Played** (with the swap they made) or **Available**, with an "X / 10 played" count. |

---

## 3. The test run (full tournament, 10 players)

I created 10 simulated entries — 9 players plus an **Admin** entry ("The Gaffer") — each with a randomly generated group‑stage score and a complete, realistic bracket and goal‑total guess. Then the tournament was simulated round by round to the Final, with the AI players deciding whether to play their Emergency Subs along the way (the Admin always plays theirs, as you asked).

**Headline outcome:** champion **🇯🇵 Japan**, 90 total knockout goals, **8 of 10** players used their Emergency Sub (the two wildcard characters chose to hold theirs — exactly the "some consider it and decline" behaviour). The underdog **Jimmy No‑Stars** (a wildcard) ran out overall winner.

**Final standings**

| Rank | Player | Group | Knockout | Total | KO goal guess (actual 90) | Emergency Sub |
|---:|---|---:|---:|---:|---:|---|
| 1 | Jimmy No‑Stars | 23 | 40 | **63** | 62 (off by 28) | Played (after QF) |
| 2 | Dodgy Derek | 32 | 14 | 46 | 71 (off by 19) | Available |
| 3 | The Professor | 39 | 5 | 44 | 73 (off by 17) | Played (after R32) |
| 4 | Wildcard Wayne | 31 | 13 | 44 | 41 (off by 49) | Available |
| 5 | Tactical Tony | 30 | 11 | 41 | 79 (off by 11) | Played (after R32) |
| 6 | Steady Eddie | 33 | 7 | 40 | 98 (off by 8) | Played (after R32) |
| 7 | Mystic Meg | 30 | 3 | 33 | 80 (off by 10) | Played (after R32) |
| 8 | Lucky Pete | 28 | 5 | 33 | 99 (off by 9) | Played (after R32) |
| 9 | The Gaffer (Admin) | 31 | 1 | 32 | 73 (off by 17) | Played (after R32) |
| 10 | Punt Pauline | 33 | −1 | 32 | 63 (off by 27) | Played (after R32) |

*(Punt Pauline's −1 knockout score shows the 6‑point penalty biting — she played her sub but it cost more than it returned. The Gaffer's score of 1 is the same story: a −6 penalty offset by a few correct picks afterwards.)*

### How it was checked
A live end‑to‑end test drives the **real** simulation and scoring code, then **independently recomputes every figure** and asserts it matches what the game stored:
- Point values per round (1 / 2 / 4 / 8 / 16) ✔
- Each player's knockout total, rebuilt from their picks vs the actual winners, including the −6 sub penalty ✔
- Total = group + knockout ✔
- Knockout goal‑total tiebreaker = |guess − actual| ✔
- All 31 knockout matches decided; Admin played their sub; not everyone forced to ✔

It passed cleanly. There is also a full unit‑test suite (177 tests) covering the bracket logic, scoring, and the Emergency Sub, all green, plus a successful production build.

---

## 4. How to try it yourself

Everything is live on the test tournament (it's hidden from normal players). As admin:

1. **Bracket Setup** — `…/admin/tournaments/wc-2026-test/bracket` — place teams into the Round of 32 (or Auto‑fill).
2. **Testing page** — `…/admin/tournaments/wc-2026-test/testing` — the **Time Machine** resets and simulates the whole thing to any phase in one click; or step it round by round.
3. **Predictions page** — `…/tournament/wc-2026-test/predictions` — compare everyone's brackets, the Predicted Champion row, and the Emergency Sub roster.

To watch it as a *player* would: simulate "After Round of 32", then open the bracket page for any player to see the Emergency Sub prompt appear.

---

## 5. Decisions made along the way

- **"Emergency Sub" naming** — adopted everywhere players see it (the engine internally still references the original "golden ticket" name; no player sees that).
- **Knockout goal‑total tiebreaker** — added as a *new, separate* figure from the group‑stage goal tiebreaker, as it reads more naturally for the knockout competition.
- **Deployed to production now** — these are shared screens, so the improvements (notably the fill‑the‑whole‑bracket experience) also benefit the real World Cup 2026 game when its knockout stage opens. **No test data was written to the live game** — all simulation stayed on the test tournament.
- **A simulation bug was found and fixed** — when generating random group results, some combinations of "best 3rd‑placed" teams couldn't legally fill the bracket and left 8 ties empty. The qualifier selection now guarantees a complete, valid bracket every time.

---

## 6. Independent verification

_After the build, a separate automated multi‑agent review (15 agents) independently cross‑checked each area against both the code **and** the live database, with a second "skeptic" pass that actively tried to disprove each result._

**Overall: passed — no failures.** Every core area was confirmed correct:

- **Scoring** — all 310 individual predictions were re‑calculated from scratch and matched the game exactly (0 discrepancies). Points double per round (1/2/4/8/16) as specified, and all 8 Emergency Subs correctly carried the −6 penalty.
- **Emergency Sub rules** — once per player (enforced two ways), the −6 cost, "swap the loser for the team that beat them," and the cascade forward were all verified against the live data.
- **Fill‑the‑whole‑bracket** — every one of the 10 players had a complete bracket to the Final, built from their own picks; editing is properly locked once the stage starts.
- **Knockout tiebreaker** — correct for all 10 players, and the standings order matches the documented tie‑break rules.
- **🔒 Live‑game safety** — the real World Cup 2026 game is **completely untouched**: zero test players, zero knockout results, zero Emergency Subs, and its data was last changed a week *before* this testing.

The review raised **two minor, non‑blocking polish points, both of which have now been fixed and re‑deployed:**

1. In the comparison views, a team carried forward by an Emergency Sub could look like an ordinary "impossible" mistake. Those picks are now clearly badged with the 🔄 icon across every round.
2. The admin "place the teams" screen now also blocks the same team being placed in two slots even via an unusual partial save (the on‑screen flow already prevented it).

---

*Questions or changes welcome — happy to tweak any of the wording, scoring, or screens.*
