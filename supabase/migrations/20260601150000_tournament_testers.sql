-- ============================================================================
-- Tournament testers: allow specific players to view hidden tournaments
-- ============================================================================
-- Hidden tournaments (is_visible = false) are normally only visible to admins.
-- This table lets us flag specific players as testers for a hidden tournament
-- so we can run an end-to-end dry-run on a clone of a real tournament without
-- exposing it to everyone else.
--
-- Flagging is DB-only by design (no UI):
--   INSERT INTO tournament_testers (tournament_id, player_id)
--   VALUES ('<tournament-uuid>', '<player-uuid>');

CREATE TABLE tournament_testers (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tournament_id, player_id)
);

ALTER TABLE tournament_testers ENABLE ROW LEVEL SECURITY;

-- A player can see their own tester rows; admins see all.
CREATE POLICY "tournament_testers_select_self_or_admin"
  ON tournament_testers FOR SELECT
  TO authenticated
  USING (player_id = get_player_id() OR is_admin());

-- Only admins can flag/unflag testers.
CREATE POLICY "tournament_testers_insert_admin"
  ON tournament_testers FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "tournament_testers_update_admin"
  ON tournament_testers FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "tournament_testers_delete_admin"
  ON tournament_testers FOR DELETE
  TO authenticated
  USING (is_admin());

-- Helper used by the tournaments SELECT policy. SECURITY DEFINER so the
-- lookup bypasses RLS on players/tournament_testers and works for any caller.
CREATE OR REPLACE FUNCTION is_tournament_tester(t_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM tournament_testers tt
    JOIN players p ON p.id = tt.player_id
    WHERE tt.tournament_id = t_id
      AND p.auth_user_id = auth.uid()
  );
END;
$$;

-- Extend the tournaments SELECT policy: testers can see their hidden tournament.
-- Anon visibility (is_visible = true only) is untouched.
DROP POLICY IF EXISTS "tournaments_select_authenticated" ON tournaments;
CREATE POLICY "tournaments_select_authenticated"
  ON tournaments FOR SELECT
  TO authenticated
  USING (
    is_visible = true
    OR is_admin()
    OR is_tournament_tester(id)
  );
