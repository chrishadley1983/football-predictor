-- Player Achievements / Badges
-- Automatically awarded based on prediction performance

CREATE TABLE IF NOT EXISTS player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES tournament_entries(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, badge_type)
);

-- Indexes
CREATE INDEX idx_player_achievements_tournament ON player_achievements(tournament_id);
CREATE INDEX idx_player_achievements_entry ON player_achievements(entry_id);

-- RLS
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all achievements
CREATE POLICY "Authenticated users can read achievements"
  ON player_achievements FOR SELECT
  TO authenticated
  USING (true);

-- Anon users can read achievements for tournaments past group stage
CREATE POLICY "Anon users can read achievements for active tournaments"
  ON player_achievements FOR SELECT
  TO anon
  USING (
    tournament_id IN (
      SELECT id FROM tournaments
      WHERE status NOT IN ('draft', 'group_stage_open')
    )
  );

-- Only service_role can insert/update/delete (via admin client)
CREATE POLICY "Service role can manage achievements"
  ON player_achievements FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
