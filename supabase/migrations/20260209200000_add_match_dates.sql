-- Add scheduling columns to knockout_matches
ALTER TABLE knockout_matches ADD COLUMN scheduled_at TIMESTAMPTZ;
ALTER TABLE knockout_matches ADD COLUMN venue TEXT;

-- New group_matches table for tracking individual group stage matches
CREATE TABLE group_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  home_team_id UUID REFERENCES teams(id),
  away_team_id UUID REFERENCES teams(id),
  match_number INTEGER,
  scheduled_at TIMESTAMPTZ,
  venue TEXT,
  home_score INTEGER,
  away_score INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(group_id, home_team_id, away_team_id)
);

ALTER TABLE group_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read group_matches" ON group_matches
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage group_matches" ON group_matches
  FOR ALL USING (is_admin());
