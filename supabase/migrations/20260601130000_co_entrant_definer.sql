-- Fix: the players_select_co_entrants policy's EXISTS subquery reads
-- tournament_entries, which is itself RLS-protected — during group_stage_open a
-- viewer can only see their OWN entry row, so it could never confirm that
-- another player shares their tournament, and author names still showed
-- "Unknown". Move the check into a SECURITY DEFINER function that bypasses
-- tournament_entries RLS.

CREATE OR REPLACE FUNCTION shares_tournament(p_player uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tournament_entries te_them
    JOIN tournament_entries te_me
      ON te_me.tournament_id = te_them.tournament_id
    WHERE te_them.player_id = p_player
      AND te_me.player_id = get_player_id()
  );
$$;

GRANT EXECUTE ON FUNCTION shares_tournament(uuid) TO authenticated;

DROP POLICY IF EXISTS "players_select_co_entrants" ON players;
CREATE POLICY "players_select_co_entrants" ON players
  FOR SELECT TO authenticated
  USING (shares_tournament(players.id));
