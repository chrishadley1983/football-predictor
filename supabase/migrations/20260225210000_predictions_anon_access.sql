-- Allow anonymous users to view group predictions and results
-- when the tournament is past the group stage (predictions are public after deadline)

CREATE POLICY "group_predictions_select_anon" ON group_predictions
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = group_predictions.entry_id
      AND t.status NOT IN ('draft', 'group_stage_open')
    )
  );

CREATE POLICY "group_results_select_anon" ON group_results
  FOR SELECT TO anon
  USING (true);

-- Widen the players anon policy to include players with tournament entries
-- (not just those in honours), so the predictions grid can show player names
DROP POLICY IF EXISTS "players_select_anon_limited" ON players;

CREATE POLICY "players_select_anon_limited" ON players
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM honours WHERE honours.player_id = players.id)
    OR
    EXISTS (
      SELECT 1 FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.player_id = players.id
      AND t.status NOT IN ('draft', 'group_stage_open')
    )
  );
