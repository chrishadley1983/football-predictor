# Overview

## What the app is for

Football Predictor runs a **sweepstake-style prediction competition** for a major international
football tournament. It is built for a small, private group (friends/colleagues) — registration
is open but accounts are auto-confirmed and audit emails go to a single inbox, so it is not a
public, multi-tenant SaaS.

A tournament runs in two predictable phases mirroring a real World Cup / Euros:

1. **Group stage** — players predict the 1st/2nd/(3rd) finishing order of each group.
2. **Knockout stage** — players predict the winner of every bracket match, all the way to the
   final.

Players accrue points as the admin enters real results, are ranked on a leaderboard, win
achievement badges, and at the end are immortalised on an **Honours Board** (a "Roll of Honour"
for the winners and a "Wall of Shame" for the wooden-spoon / worst-tiebreaker awards).

## Core feature set

- **Accounts & profiles** — email/password or magic-link sign-in; editable display name,
  nickname, and avatar (uploaded to Supabase Storage).
- **Tournament entry** — pay a fixed entry fee (handled **manually** — admin marks paid); the
  prize pool is the sum of paid entries.
- **Group predictions** — per-group 1st/2nd/3rd selectors plus an optional 3rd-place-qualifier
  mechanism (modern World Cup format) and a goals **tiebreaker** guess.
- **Knockout predictions** — an interactive bracket; pick the winner of each tie.
- **Golden ticket** — once per tournament, after a knockout round completes, retroactively swap
  one wrong pick to the team that actually won; the swap carries forward through the bracket.
- **Scoring & leaderboard** — automatic group/knockout scoring, multi-criteria ranking, a
  sortable leaderboard, and a side-by-side prediction analyser.
- **Achievement badges** — 11 badge types (see `scoring-and-badges.md`).
- **AI pundits** — four parody pundit characters post daily "takes" and occasionally drop
  messages into chat (Anthropic Claude generates the content).
- **Realtime chat** — per-tournament chat with reactions, replies, @mentions, GIFs, typing
  indicators, presence, pinned messages, unread badges, and sound.
- **Blog/posts** — admin-authored markdown posts per tournament.
- **Admin console** — full tournament lifecycle, results entry, payments, and a "time machine"
  test harness that seeds players/predictions/results to any phase.
- **Email audit** — every meaningful event (sign-up, entry, predictions, payment, chat, admin
  actions) fires an internal notification email via Resend.

## Tournament lifecycle (status state machine)

A tournament's `status` advances through a fixed sequence; the status API enforces that
transitions only move one step forward (no skipping, no reversing):

```
draft → group_stage_open → group_stage_closed → knockout_open → knockout_closed → completed
```

| Status | What it means | What players can do |
|--------|---------------|---------------------|
| `draft` | Being configured by admin | Nothing (not visible as joinable) |
| `group_stage_open` | Entry + group predictions open | Enter tournament; submit/edit group predictions (until deadline) |
| `group_stage_closed` | Group predictions locked | View others' group predictions; await results |
| `knockout_open` | Knockout predictions open | Submit/edit bracket picks (until deadline) |
| `knockout_closed` | Bracket locked | View all predictions; golden-ticket window opens between rounds |
| `completed` | Tournament finished | View final leaderboard, honours, badges |

Deadlines (`group_stage_deadline`, `knockout_stage_deadline`) provide a second, time-based lock
that the prediction APIs enforce independently of status.

## Key roles

- **Player** — any registered user. Sees public pages, enters tournaments, predicts, chats.
- **Admin** — a user whose Supabase `app_metadata.role === 'admin'`. There is no UI to grant
  this; it is set out-of-band in Supabase. Admin unlocks `/admin` and all management APIs.
- **AI pundits** — four system "players" (`players` rows with `auth_user_id = NULL`) used as the
  authors of pundit chat messages.

## Glossary

- **Entry** — a player's participation in one tournament (`tournament_entries`). Holds their
  points, ranks, tiebreaker, and payment status.
- **Group prediction** — one row per (entry, group): the predicted 1st/2nd/3rd teams.
- **Knockout prediction** — one row per (entry, match): the predicted winner.
- **Group result** — the actual final position + qualified flag for a team in a group.
- **Source code** (bracket) — placeholder strings like `1A` ("winner/1st of Group A") or
  `3C/D/E` ("a qualifying 3rd-placed team from C, D or E") or `W57` ("winner of match 57") that
  describe how the bracket fills in.
- **Tiebreaker** — each player guesses the total number of goals in the group stage; the
  absolute difference from the actual total breaks ranking ties.
- **Golden ticket** — a one-time retroactive correction of a wrong knockout pick.
