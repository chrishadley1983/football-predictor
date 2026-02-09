-- ============================================================================
-- Football Prediction Game - Initial Schema Migration
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- Updated_at trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Tables
-- ============================================================================

-- Tournaments
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('world_cup', 'euros')),
  year INTEGER NOT NULL,
  entry_fee_gbp DECIMAL(10,2) DEFAULT 10.00,
  prize_pool_gbp DECIMAL(10,2),
  group_stage_prize_pct INTEGER DEFAULT 25,
  overall_prize_pct INTEGER DEFAULT 75,
  group_stage_deadline TIMESTAMPTZ,
  knockout_stage_deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'group_stage_open', 'group_stage_closed', 'knockout_open', 'knockout_closed', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER set_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Groups within a tournament
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(tournament_id, name)
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  flag_emoji TEXT,
  flag_url TEXT,
  UNIQUE(code)
);

-- Teams assigned to groups in a tournament
CREATE TABLE group_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  seed_position INTEGER,
  UNIQUE(group_id, team_id)
);

-- Knockout bracket matches
CREATE TABLE knockout_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round TEXT NOT NULL CHECK (round IN ('round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final')),
  match_number INTEGER NOT NULL,
  bracket_side TEXT CHECK (bracket_side IN ('left', 'right')),
  home_source TEXT,
  away_source TEXT,
  home_team_id UUID REFERENCES teams(id),
  away_team_id UUID REFERENCES teams(id),
  winner_team_id UUID REFERENCES teams(id),
  points_value INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(tournament_id, match_number)
);

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id),
  display_name TEXT NOT NULL,
  nickname TEXT,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tournament entries (player registered for a tournament)
CREATE TABLE tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  tiebreaker_goals INTEGER,
  group_stage_points INTEGER DEFAULT 0,
  knockout_points INTEGER DEFAULT 0,
  total_points INTEGER GENERATED ALWAYS AS (group_stage_points + knockout_points) STORED,
  tiebreaker_diff INTEGER,
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
  predicted_3rd UUID REFERENCES teams(id),
  points_earned INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, group_id)
);

-- Actual group results (admin enters these)
CREATE TABLE group_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id),
  team_id UUID REFERENCES teams(id),
  final_position INTEGER NOT NULL,
  qualified BOOLEAN DEFAULT false,
  UNIQUE(group_id, team_id)
);

-- Knockout predictions (one per match per entry)
CREATE TABLE knockout_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES tournament_entries(id) ON DELETE CASCADE,
  match_id UUID REFERENCES knockout_matches(id),
  predicted_winner_id UUID REFERENCES teams(id),
  is_correct BOOLEAN,
  points_earned INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, match_id)
);

-- Tournament actual stats
CREATE TABLE tournament_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  total_group_stage_goals INTEGER,
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
  content TEXT NOT NULL,
  author TEXT DEFAULT 'Admin',
  published_at TIMESTAMPTZ DEFAULT now(),
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, slug)
);

-- Knockout round configuration (scoring per round, configurable per tournament)
CREATE TABLE knockout_round_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  round TEXT NOT NULL,
  points_value INTEGER NOT NULL,
  match_count INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(tournament_id, round)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX idx_tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX idx_tournament_entries_player ON tournament_entries(player_id);
CREATE INDEX idx_group_predictions_entry ON group_predictions(entry_id);
CREATE INDEX idx_knockout_predictions_entry ON knockout_predictions(entry_id);
CREATE INDEX idx_knockout_matches_tournament ON knockout_matches(tournament_id);
CREATE INDEX idx_posts_tournament ON posts(tournament_id);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE honours ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE knockout_round_config ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is admin
-- Admin is identified by having the 'admin' role in app_metadata
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: get player_id for current auth user
CREATE OR REPLACE FUNCTION get_player_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM players WHERE auth_user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -------------------------------------------------------
-- tournaments: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "tournaments_select_authenticated"
  ON tournaments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "tournaments_insert_admin"
  ON tournaments FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "tournaments_update_admin"
  ON tournaments FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "tournaments_delete_admin"
  ON tournaments FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- groups: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "groups_select_authenticated"
  ON groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "groups_insert_admin"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "groups_update_admin"
  ON groups FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "groups_delete_admin"
  ON groups FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- teams: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "teams_select_authenticated"
  ON teams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "teams_insert_admin"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "teams_update_admin"
  ON teams FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "teams_delete_admin"
  ON teams FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- group_teams: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "group_teams_select_authenticated"
  ON group_teams FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "group_teams_insert_admin"
  ON group_teams FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "group_teams_update_admin"
  ON group_teams FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "group_teams_delete_admin"
  ON group_teams FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- knockout_matches: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "knockout_matches_select_authenticated"
  ON knockout_matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "knockout_matches_insert_admin"
  ON knockout_matches FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "knockout_matches_update_admin"
  ON knockout_matches FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "knockout_matches_delete_admin"
  ON knockout_matches FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- players: Own record read/update, self-register, admin delete
-- -------------------------------------------------------

CREATE POLICY "players_select_own"
  ON players FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid() OR is_admin());

CREATE POLICY "players_insert_self"
  ON players FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "players_update_own"
  ON players FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid() OR is_admin());

CREATE POLICY "players_delete_admin"
  ON players FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- tournament_entries: Own before deadline / All after deadline for SELECT
-- Self insert/update before deadline, admin delete
-- -------------------------------------------------------

CREATE POLICY "tournament_entries_select"
  ON tournament_entries FOR SELECT
  TO authenticated
  USING (
    -- Own entry is always visible
    player_id = get_player_id()
    OR is_admin()
    -- Others' entries visible after group stage deadline
    OR EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_entries.tournament_id
      AND t.status NOT IN ('draft', 'group_stage_open')
    )
  );

CREATE POLICY "tournament_entries_insert_self"
  ON tournament_entries FOR INSERT
  TO authenticated
  WITH CHECK (player_id = get_player_id());

CREATE POLICY "tournament_entries_update_self"
  ON tournament_entries FOR UPDATE
  TO authenticated
  USING (
    player_id = get_player_id()
    OR is_admin()
  );

CREATE POLICY "tournament_entries_delete_admin"
  ON tournament_entries FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- group_predictions: Own before deadline / All after deadline for SELECT
-- Self insert/update before group deadline, admin delete
-- -------------------------------------------------------

CREATE POLICY "group_predictions_select"
  ON group_predictions FOR SELECT
  TO authenticated
  USING (
    -- Own predictions always visible
    EXISTS (
      SELECT 1 FROM tournament_entries te
      WHERE te.id = group_predictions.entry_id
      AND te.player_id = get_player_id()
    )
    OR is_admin()
    -- All visible after group stage closes
    OR EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = group_predictions.entry_id
      AND t.status NOT IN ('draft', 'group_stage_open')
    )
  );

CREATE POLICY "group_predictions_insert_self"
  ON group_predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = group_predictions.entry_id
      AND te.player_id = get_player_id()
      AND t.status = 'group_stage_open'
      AND (t.group_stage_deadline IS NULL OR t.group_stage_deadline > now())
    )
  );

CREATE POLICY "group_predictions_update_self"
  ON group_predictions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = group_predictions.entry_id
      AND te.player_id = get_player_id()
      AND t.status = 'group_stage_open'
      AND (t.group_stage_deadline IS NULL OR t.group_stage_deadline > now())
    )
    OR is_admin()
  );

CREATE POLICY "group_predictions_delete_admin"
  ON group_predictions FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- group_results: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "group_results_select_authenticated"
  ON group_results FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "group_results_insert_admin"
  ON group_results FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "group_results_update_admin"
  ON group_results FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "group_results_delete_admin"
  ON group_results FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- knockout_predictions: Own before deadline / All after deadline for SELECT
-- Self insert/update before knockout deadline, admin delete
-- -------------------------------------------------------

CREATE POLICY "knockout_predictions_select"
  ON knockout_predictions FOR SELECT
  TO authenticated
  USING (
    -- Own predictions always visible
    EXISTS (
      SELECT 1 FROM tournament_entries te
      WHERE te.id = knockout_predictions.entry_id
      AND te.player_id = get_player_id()
    )
    OR is_admin()
    -- All visible after knockout stage closes
    OR EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = knockout_predictions.entry_id
      AND t.status NOT IN ('draft', 'group_stage_open', 'group_stage_closed', 'knockout_open')
    )
  );

CREATE POLICY "knockout_predictions_insert_self"
  ON knockout_predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = knockout_predictions.entry_id
      AND te.player_id = get_player_id()
      AND t.status = 'knockout_open'
      AND (t.knockout_stage_deadline IS NULL OR t.knockout_stage_deadline > now())
    )
  );

CREATE POLICY "knockout_predictions_update_self"
  ON knockout_predictions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = knockout_predictions.entry_id
      AND te.player_id = get_player_id()
      AND t.status = 'knockout_open'
      AND (t.knockout_stage_deadline IS NULL OR t.knockout_stage_deadline > now())
    )
    OR is_admin()
  );

CREATE POLICY "knockout_predictions_delete_admin"
  ON knockout_predictions FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- tournament_stats: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "tournament_stats_select_authenticated"
  ON tournament_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "tournament_stats_insert_admin"
  ON tournament_stats FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "tournament_stats_update_admin"
  ON tournament_stats FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "tournament_stats_delete_admin"
  ON tournament_stats FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- honours: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "honours_select_authenticated"
  ON honours FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "honours_insert_admin"
  ON honours FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "honours_update_admin"
  ON honours FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "honours_delete_admin"
  ON honours FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- posts: All can read published, admin-only write
-- -------------------------------------------------------

CREATE POLICY "posts_select_published"
  ON posts FOR SELECT
  TO authenticated
  USING (is_published = true OR is_admin());

CREATE POLICY "posts_insert_admin"
  ON posts FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "posts_update_admin"
  ON posts FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "posts_delete_admin"
  ON posts FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- knockout_round_config: All authenticated can read, admin-only write
-- -------------------------------------------------------

CREATE POLICY "knockout_round_config_select_authenticated"
  ON knockout_round_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "knockout_round_config_insert_admin"
  ON knockout_round_config FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "knockout_round_config_update_admin"
  ON knockout_round_config FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "knockout_round_config_delete_admin"
  ON knockout_round_config FOR DELETE
  TO authenticated
  USING (is_admin());
