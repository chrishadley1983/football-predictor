-- Allow anon users to read knockout predictions for tournaments past knockout open
CREATE POLICY "knockout_predictions_select_anon"
  ON knockout_predictions FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM tournament_entries te
      JOIN tournaments t ON t.id = te.tournament_id
      WHERE te.id = knockout_predictions.entry_id
        AND t.status NOT IN ('draft', 'group_stage_open', 'group_stage_closed', 'knockout_open')
    )
  );
