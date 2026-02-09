# Football Prediction Game — Full Specification

## 1. Overview

A web-based football tournament prediction game where players pay an entry fee, predict group stage outcomes and knockout bracket results for major international tournaments (World Cup, Euros), and compete for a prize pool. The app replaces the current WordPress + Google Forms + Google Sheets workflow with a fully integrated Next.js + Supabase application.

### Target Tournament: World Cup 2026 (USA/Canada/Mexico)

---

## 2. Game Mechanics (Derived from Source)

### 2.1 Tournament Structure

Tournaments have two phases:

#### Phase 1: Group Stage Predictions
- Players predict which teams qualify from each group and their finishing position (1st, 2nd, or 3rd for Euros with 3rd-place qualifiers; 1st or 2nd for World Cup)
- Players also submit a **tiebreaker**: total goals scored in the group stage
- **Deadline**: Before the first group stage match kicks off

#### Phase 2: Knockout Stage Predictions
- Opens after group stage completes (admin triggers this)
- Players predict the winner of every knockout match from Round of 16 → Final
- Players must fill a valid bracket (winners advance correctly through the bracket)
- **Deadline**: Before the first knockout match kicks off

### 2.2 Scoring System

#### Group Stage Scoring
| Outcome | Points |
|---------|--------|
| Correctly predict a team qualifies for knockouts | 1 point |
| Correctly predict their exact finishing position (1st/2nd/3rd) | 1 bonus point |
| **Maximum possible** | **32 points** (16 qualifying teams × 2) |

#### Knockout Stage Scoring (Doubles Each Round)

The scoring has evolved across tournaments. Use the **Euro 2024 / WC 2022** version (most recent):

| Round | Points per correct winner |
|-------|--------------------------|
| Round of 16 | 2 points |
| Quarter-Finals | 4 points |
| Semi-Finals | 8 points |
| Final (tournament winner) | 16 points |
| **Maximum possible** | **64 points** (8×2 + 4×4 + 2×8 + 1×16) |

**Total maximum: 96 points** (32 group + 64 knockout)

### 2.3 Tiebreaker
- If players are tied on points, the tiebreaker is: **closest prediction to total goals scored in the group stage** (absolute difference, lower is better)

### 2.4 Prize Distribution
| Prize | % of Pool |
|-------|-----------|
| Overall winner | 75% |
| Group stage leader | 25% |

- Entry fee: £10 (or $12 USD equivalent)
- No prizes for runners-up
- Admin can adjust split per tournament

---

## 3. User Roles

### 3.1 Admin (Tournament Organiser)
- Create and configure tournaments
- Define groups, teams, and knockout bracket structure
- Set entry fee and prize split
- Open/close prediction windows
- Enter actual results (group standings, knockout match winners)
- Trigger scoring calculations
- Manage player registrations and payment status
- Publish results and leaderboard
- Post news/updates (blog-style)

### 3.2 Player
- Register with name, email, and optional nickname
- Submit group stage predictions before deadline
- Submit knockout bracket predictions before deadline
- View leaderboard and own predictions
- View all players' predictions (after deadline closes)
- Receive email notifications for key events

---

## 4. Data Model (Supabase/PostgreSQL)

### 4.1 Core Tables

```sql
-- Tournaments
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                           -- e.g. "World Cup 2026"
  slug TEXT UNIQUE NOT NULL,                    -- e.g. "wc-2026"
  type TEXT NOT NULL CHECK (type IN ('world_cup', 'euros')),
  year INTEGER NOT NULL,
  entry_fee_gbp DECIMAL(10,2) DEFAULT 10.00,
  prize_pool_gbp DECIMAL(10,2),                 -- calculated from entries
  group_stage_prize_pct INTEGER DEFAULT 25,     -- % of pool for group leader
  overall_prize_pct INTEGER DEFAULT 75,         -- % of pool for overall winner
  group_stage_deadline TIMESTAMPTZ,
  knockout_stage_deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'group_stage_open', 'group_stage_closed', 'knockout_open', 'knockout_closed', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Groups within a tournament
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                            -- e.g. "Group A"
  sort_order INTEGER NOT NULL,
  UNIQUE(tournament_id, name)
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                            -- e.g. "England"
  code TEXT NOT NULL,                            -- e.g. "ENG" (FIFA code)
  flag_emoji TEXT,                               -- e.g. "🏴󠁧󠁢󠁥󠁮󠁧󠁿" or "🇫🇷"
  flag_url TEXT,                                 -- optional flag image URL
  UNIQUE(code)
);

-- Teams assigned to groups in a tournament
CREATE TABLE group_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  seed_position INTEGER,                         -- pot/seeding position
  UNIQUE(group_id, team_id)
);

-- Knockout bracket matches
CREATE TABLE knockout_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round TEXT NOT NULL CHECK (round IN ('round_of_16', 'quarter_final', 'semi_final', 'final')),
  match_number INTEGER NOT NULL,                 -- position in bracket (1-15)
  bracket_side TEXT CHECK (bracket_side IN ('left', 'right')),
  home_source TEXT,                               -- e.g. "1A" (winner group A) or "W1" (winner match 1)
  away_source TEXT,                               -- e.g. "2B" or "W2"
  home_team_id UUID REFERENCES teams(id),         -- populated after groups complete
  away_team_id UUID REFERENCES teams(id),
  winner_team_id UUID REFERENCES teams(id),       -- actual result
  points_value INTEGER NOT NULL,                  -- 2, 4, 8, or 16
  sort_order INTEGER NOT NULL,
  UNIQUE(tournament_id, match_number)
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id),   -- Supabase Auth link
  display_name TEXT NOT NULL,
  nickname TEXT,                                   -- fun nickname e.g. "Kelly the Octopus"
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tournament entries (player registered for a tournament)
CREATE TABLE tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  tiebreaker_goals INTEGER,                       -- predicted total group stage goals
  group_stage_points INTEGER DEFAULT 0,
  knockout_points INTEGER DEFAULT 0,
  total_points INTEGER GENERATED ALWAYS AS (group_stage_points + knockout_points) STORED,
  tiebreaker_diff INTEGER,                        -- absolute diff from actual (calculated)
  group_stage_rank INTEGER,
  overall_rank INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, player_id)
);

-- Group stage predictions (one per group per entry)
CREATE TABLE group_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES tournament_entries(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id),
  predicted_1st UUID REFERENCES teams(id),
  predicted_2nd UUID REFERENCES teams(id),
  predicted_3rd UUID REFERENCES teams(id),         -- nullable (only for Euros with 3rd place qualifiers)
  points_earned INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, group_id)
);

-- Actual group results (admin enters these)
CREATE TABLE group_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id),
  team_id UUID REFERENCES teams(id),
  final_position INTEGER NOT NULL,                 -- 1, 2, 3, 4
  qualified BOOLEAN DEFAULT false,                 -- did they advance to knockouts?
  UNIQUE(group_id, team_id)
);

-- Knockout predictions (one per match per entry)
CREATE TABLE knockout_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES tournament_entries(id) ON DELETE CASCADE,
  match_id UUID REFERENCES knockout_matches(id),
  predicted_winner_id UUID REFERENCES teams(id),
  is_correct BOOLEAN,                              -- null until scored
  points_earned INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, match_id)
);

-- Tournament actual stats
CREATE TABLE tournament_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  total_group_stage_goals INTEGER,                 -- for tiebreaker resolution
  UNIQUE(tournament_id)
);

-- Honours board / historical results
CREATE TABLE honours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id),
  player_id UUID REFERENCES players(id),
  prize_type TEXT CHECK (prize_type IN ('overall_winner', 'group_stage_winner')),
  prize_amount_gbp DECIMAL(10,2),
  UNIQUE(tournament_id, prize_type)
);

-- Blog posts / updates
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id),
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,                            -- markdown content
  author TEXT DEFAULT 'Admin',
  published_at TIMESTAMPTZ DEFAULT now(),
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, slug)
);
```

### 4.2 Key Indexes

```sql
CREATE INDEX idx_tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX idx_tournament_entries_player ON tournament_entries(player_id);
CREATE INDEX idx_group_predictions_entry ON group_predictions(entry_id);
CREATE INDEX idx_knockout_predictions_entry ON knockout_predictions(entry_id);
CREATE INDEX idx_knockout_matches_tournament ON knockout_matches(tournament_id);
CREATE INDEX idx_posts_tournament ON posts(tournament_id);
```

### 4.3 RLS Policies (Summary)

| Table | Select | Insert | Update | Delete |
|-------|--------|--------|--------|--------|
| tournaments | All authenticated | Admin only | Admin only | Admin only |
| players | Own record | Self-register | Own record | Admin only |
| tournament_entries | All (after deadline) / Own (before) | Self | Self (before deadline) | Admin only |
| group_predictions | All (after deadline) / Own (before) | Self (before deadline) | Self (before deadline) | Admin only |
| knockout_predictions | All (after deadline) / Own (before) | Self (before deadline) | Self (before deadline) | Admin only |
| group_results | All authenticated | Admin only | Admin only | Admin only |
| knockout_matches | All authenticated | Admin only | Admin only | Admin only |
| posts | All (published) | Admin only | Admin only | Admin only |

---

## 5. Application Architecture

### 5.1 Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **Styling**: Tailwind CSS
- **Deployment**: Vercel
- **Email**: Supabase Edge Functions + Resend (or similar)

### 5.2 Page Structure

```
/                                    → Landing page (current/upcoming tournament, honours board)
/tournament/[slug]                   → Tournament hub (rules, status, leaderboard preview)
/tournament/[slug]/rules             → Rules & scoring explanation
/tournament/[slug]/enter             → Registration + payment info
/tournament/[slug]/predict/groups    → Group stage prediction form
/tournament/[slug]/predict/knockout  → Knockout bracket prediction form
/tournament/[slug]/predictions       → All players' predictions (visible after deadline)
/tournament/[slug]/leaderboard       → Live leaderboard with scores
/tournament/[slug]/results           → Final results, prizes, write-up
/tournament/[slug]/posts             → Blog updates for this tournament
/tournament/[slug]/posts/[post-slug] → Individual blog post
/honours                             → All-time honours board
/auth/login                          → Login (magic link or password)
/auth/register                       → Registration

-- Admin routes
/admin                               → Admin dashboard
/admin/tournaments/new               → Create tournament
/admin/tournaments/[slug]/manage     → Tournament management (enter results, trigger scoring)
/admin/tournaments/[slug]/entries    → Manage player entries & payment status
/admin/tournaments/[slug]/posts     → Manage blog posts
```

### 5.3 Key User Flows

#### Flow 1: Player Registration & Group Prediction
1. Player visits landing page → clicks "Enter Tournament"
2. Registers or logs in (magic link email)
3. Sees tournament rules and entry fee info
4. Pays entry fee (tracked manually by admin, or Stripe integration later)
5. Admin marks payment as received
6. Player accesses group stage prediction form
7. For each group: selects 1st, 2nd, (and optionally 3rd) from dropdown of teams in that group
8. Enters tiebreaker (total group stage goals prediction)
9. Submits → predictions locked (can edit until deadline)

#### Flow 2: Knockout Bracket Prediction
1. Admin closes group stage, enters actual group results, opens knockout stage
2. Players receive email notification
3. Player logs in → sees knockout bracket with qualified teams populated
4. Fills bracket from R16 → QF → SF → Final (interactive bracket UI)
5. Bracket auto-validates (winners must advance correctly)
6. Submits → predictions locked (can edit until deadline)

#### Flow 3: Admin Results Entry & Scoring
1. Admin enters actual group stage results (position + qualified for each team)
2. System auto-calculates group stage scores for all players
3. System ranks players, resolves ties via tiebreaker
4. Admin enters knockout results match-by-match as tournament progresses
5. System recalculates leaderboard after each result entry
6. After final: admin marks tournament complete, prizes calculated

---

## 6. UI Components

### 6.1 Interactive Knockout Bracket
- Visual bracket display showing all 15 matches (R16: 8, QF: 4, SF: 2, Final: 1)
- Left side / right side of bracket
- When predicting: clicking a team advances them to the next round
- Colour coding: correct (green), incorrect (red), pending (grey)
- Responsive: stacks vertically on mobile

### 6.2 Group Prediction Grid
- One card per group showing all 4 teams with flags
- Drag-and-drop or dropdown to set predicted positions
- Visual feedback on submission

### 6.3 Leaderboard Table
- Sortable columns: Rank, Player, Nickname, Group Pts, Knockout Pts, Total, Tiebreaker
- Highlight current user's row
- Expandable row to show individual prediction breakdown
- Conditional colour coding (yellow = 2pts exact, purple = 1pt qualify)

### 6.4 Prediction Comparison Grid
- Matrix: Players as columns, Groups/Matches as rows
- Colour coded cells showing predictions vs actuals
- Similar to the Google Sheets view from the original site

### 6.5 Honours Board
- Historical table of all tournament winners
- Year, Tournament, Winner, Prize amount

### 6.6 Blog/Updates Feed
- Markdown-rendered posts with images
- Filterable by tournament
- Commentary and analysis posts

---

## 7. Scoring Engine (Supabase Edge Function or DB Function)

### 7.1 Group Stage Scoring Function

```sql
-- Pseudocode for scoring group predictions
FOR each group_prediction:
  FOR each predicted position (1st, 2nd, 3rd):
    IF predicted_team is in group_results AND qualified = true:
      score += 1  -- team qualified
      IF predicted_position = actual_position:
        score += 1  -- exact position bonus
```

### 7.2 Knockout Scoring Function

```sql
FOR each knockout_prediction:
  IF predicted_winner = actual_winner:
    is_correct = true
    points_earned = match.points_value  -- 2, 4, 8, or 16
```

### 7.3 Ranking Function

```sql
-- Rank by total_points DESC, then tiebreaker_diff ASC (closer to actual goals = better)
RANK() OVER (
  ORDER BY total_points DESC,
           tiebreaker_diff ASC NULLS LAST,
           knockout_points DESC  -- secondary tiebreaker: knockout performance
)
```

---

## 8. Notifications (Edge Functions)

| Event | Recipient | Channel |
|-------|-----------|---------|
| Tournament created / entries open | All registered users | Email |
| Group stage deadline reminder (24h) | Entered players who haven't submitted | Email |
| Knockout stage opens | All entered players | Email |
| Knockout deadline reminder (24h) | Entered players who haven't submitted | Email |
| Results updated (new knockout results) | All entered players | Email (optional) |
| Tournament complete / final results | All entered players | Email |

---

## 9. World Cup 2026 Specific Considerations

### 9.1 Expanded Format
- **48 teams** in **12 groups** of 4
- Top 2 from each group qualify (24 teams) + 8 best 3rd-place teams = **32 teams** in knockout
- Knockout: Round of 32 → Round of 16 → QF → SF → Final

### 9.2 Adjusted Scoring for 48-Team Format

| Phase | Detail |
|-------|--------|
| Group Stage | 12 groups × (2 qualifiers + potentially 3rd) = more predictions, more points |
| Max group points | ~64-72 (depending on 3rd place rules) |
| Knockout rounds | R32 (1pt each), R16 (2pts), QF (4pts), SF (8pts), Final (16pts) |
| Max knockout points | 16×1 + 8×2 + 4×4 + 2×8 + 1×16 = 80 points |

**Note**: The exact format should be configurable per tournament via admin. The scoring multipliers per round should be stored in a `knockout_round_config` table.

### 9.3 Additional Config Table

```sql
CREATE TABLE knockout_round_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round TEXT NOT NULL,
  points_value INTEGER NOT NULL,
  match_count INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(tournament_id, round)
);
```

---

## 10. Admin Dashboard Features

- **Tournament Setup Wizard**: Step-by-step creation (name → groups → teams → bracket structure → scoring config → publish)
- **Bulk Team Import**: Paste or CSV import of teams into groups
- **Result Entry**: Click through each group/match and enter results; auto-calculates immediately
- **Payment Tracker**: Mark players as paid/unpaid; calculate prize pool automatically
- **Blog Editor**: Markdown editor with image upload for tournament updates
- **Analytics**: Charts showing prediction distributions (who's picking which teams, consensus picks vs contrarian)
- **Export**: Export leaderboard and predictions as CSV/PDF

---

## 11. Future Enhancements (Post-MVP)

- **Stripe Payment Integration**: Auto-collect entry fees, auto-distribute prizes
- **Social Features**: Comments on predictions, trash talk feed
- **Live Score Integration**: Auto-populate results via football API (football-data.org or similar)
- **Push Notifications**: Web push for deadline reminders and result updates
- **Prediction Analytics**: Charts showing prediction consensus (like the knockout chart from the original site)
- **Multi-Language Support**: For international player groups
- **Mobile App**: React Native wrapper
- **Invite System**: Share tournament invite links
- **Historical Data Import**: Import past tournament results from the original site
- **Peterbot Integration**: Discord notifications for results, leaderboard updates, and deadline reminders

---

## 12. MVP Scope (Phase 1)

For the initial Claude Code build, focus on:

1. **Supabase schema** — all tables, RLS, indexes
2. **Auth** — magic link login, player registration
3. **Tournament landing page** — rules, honours board, status
4. **Group stage prediction form** — dropdown-based, with tiebreaker
5. **Knockout bracket prediction** — interactive bracket UI
6. **Leaderboard** — real-time scoring, tiebreaker resolution
7. **Admin: tournament management** — create tournament, enter results, manage entries
8. **Admin: scoring engine** — auto-calculate scores on result entry
9. **Prediction comparison grid** — see everyone's picks after deadline
10. **Blog/updates** — simple markdown posts per tournament

---

## 13. Implementation Notes for Claude Code

### File Structure
```
src/
├── app/
│   ├── page.tsx                          # Landing
│   ├── honours/page.tsx                  # Honours board
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── tournament/[slug]/
│   │   ├── page.tsx                      # Tournament hub
│   │   ├── rules/page.tsx
│   │   ├── enter/page.tsx
│   │   ├── predict/
│   │   │   ├── groups/page.tsx
│   │   │   └── knockout/page.tsx
│   │   ├── predictions/page.tsx
│   │   ├── leaderboard/page.tsx
│   │   └── posts/
│   │       ├── page.tsx
│   │       └── [post-slug]/page.tsx
│   └── admin/
│       ├── page.tsx
│       └── tournaments/
│           ├── new/page.tsx
│           └── [slug]/
│               ├── manage/page.tsx
│               ├── entries/page.tsx
│               └── posts/page.tsx
├── components/
│   ├── bracket/
│   │   ├── KnockoutBracket.tsx           # Interactive bracket
│   │   ├── BracketMatch.tsx              # Single match in bracket
│   │   └── BracketTeam.tsx               # Team selector in bracket
│   ├── groups/
│   │   ├── GroupPredictionCard.tsx        # Single group prediction
│   │   └── GroupResultsCard.tsx          # Group with actual results
│   ├── leaderboard/
│   │   ├── LeaderboardTable.tsx
│   │   └── PlayerRow.tsx
│   ├── predictions/
│   │   └── PredictionGrid.tsx            # All players' predictions matrix
│   ├── ui/                               # Shared UI components
│   ├── HonoursBoard.tsx
│   ├── TournamentCard.tsx
│   └── BlogPost.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts
│   ├── scoring.ts                        # Scoring calculation logic
│   ├── types.ts                          # TypeScript types (from Supabase gen)
│   └── utils.ts
└── supabase/
    ├── migrations/
    └── functions/
        ├── calculate-scores/
        └── send-notification/
```

### Agent Workflow
After implementation of each feature:
1. `/test-plan analyze` — generate test plan
2. `/test-build` — build tests
3. `/test-execute` — run tests
4. `/code-review` — review before commit
5. Commit with conventional commit message

### Do NOT
- Use any external CSS frameworks beyond Tailwind
- Store sensitive payment data in the database
- Allow prediction submission after deadlines (enforce both client & server side)
- Show other players' predictions before the relevant deadline has passed
- Use client-side scoring — all scoring must happen server-side via Supabase functions
- Hardcode tournament-specific data — everything must be configurable per tournament
