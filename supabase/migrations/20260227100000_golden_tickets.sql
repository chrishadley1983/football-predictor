-- Golden Tickets
-- Each player gets one per tournament to swap an eliminated knockout prediction
-- for a surviving team in the next round, with changes cascading downstream.

CREATE TABLE IF NOT EXISTS golden_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES tournament_entries(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  original_match_id UUID NOT NULL REFERENCES knockout_matches(id),
  original_team_id UUID NOT NULL REFERENCES teams(id),
  new_team_id UUID NOT NULL REFERENCES teams(id),
  played_after_round TEXT NOT NULL CHECK (played_after_round IN (
    'round_of_32', 'round_of_16', 'quarter_final', 'semi_final'
  )),
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id) -- one golden ticket per tournament entry
);

-- Indexes
CREATE INDEX idx_golden_tickets_tournament ON golden_tickets(tournament_id);
CREATE INDEX idx_golden_tickets_entry ON golden_tickets(entry_id);

-- RLS
ALTER TABLE golden_tickets ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all golden tickets (usage is public)
CREATE POLICY "Authenticated users can read golden tickets"
  ON golden_tickets FOR SELECT
  TO authenticated
  USING (true);

-- Anon users can read golden tickets for tournaments past group stage
CREATE POLICY "Anon users can read golden tickets for active tournaments"
  ON golden_tickets FOR SELECT
  TO anon
  USING (
    tournament_id IN (
      SELECT id FROM tournaments
      WHERE status NOT IN ('draft', 'group_stage_open')
    )
  );

-- Only service_role can insert/update/delete (via admin client in API route)
CREATE POLICY "Service role can manage golden tickets"
  ON golden_tickets FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
