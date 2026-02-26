-- Pundit snippets table for AI-generated punditry commentary
CREATE TABLE IF NOT EXISTS pundit_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  pundit_key TEXT NOT NULL CHECK (pundit_key IN ('neverill', 'bright', 'meane', 'scaragher')),
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('leaderboard', 'predictions', 'results', 'chat', 'news', 'wildcard')),
  generated_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient random snippet fetch
CREATE INDEX idx_pundit_snippets_tournament_date
  ON pundit_snippets (tournament_id, generated_date);

-- RLS
ALTER TABLE pundit_snippets ENABLE ROW LEVEL SECURITY;

-- Everyone can read snippets (anon + authenticated)
CREATE POLICY "pundit_snippets_select_all"
  ON pundit_snippets FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only service_role can insert/delete (generation job uses admin client)
CREATE POLICY "pundit_snippets_insert_service"
  ON pundit_snippets FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "pundit_snippets_delete_service"
  ON pundit_snippets FOR DELETE
  TO service_role
  USING (true);
