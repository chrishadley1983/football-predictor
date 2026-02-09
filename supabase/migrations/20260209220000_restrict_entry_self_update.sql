-- Fix CR-015: Players can update their own scores via RLS
-- The tournament_entries_update_self policy allows players to update ANY column,
-- including group_stage_points, knockout_points, and overall_rank.
-- Replace with a restricted policy that only allows updating tiebreaker_goals and payment-related fields.

-- Drop the overly permissive self-update policy
DROP POLICY IF EXISTS "tournament_entries_update_self" ON tournament_entries;

-- Recreate with column-level restriction using a trigger
-- Since RLS can't restrict columns, we use a trigger to reject score modifications by non-admins

CREATE OR REPLACE FUNCTION check_entry_update_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Admins can update anything
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admins: reject changes to scoring columns
  IF NEW.group_stage_points IS DISTINCT FROM OLD.group_stage_points
    OR NEW.knockout_points IS DISTINCT FROM OLD.knockout_points
    OR NEW.tiebreaker_diff IS DISTINCT FROM OLD.tiebreaker_diff
    OR NEW.group_stage_rank IS DISTINCT FROM OLD.group_stage_rank
    OR NEW.overall_rank IS DISTINCT FROM OLD.overall_rank
    OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
  THEN
    RAISE EXCEPTION 'You can only update your tiebreaker prediction';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER entry_update_guard
  BEFORE UPDATE ON tournament_entries
  FOR EACH ROW
  EXECUTE FUNCTION check_entry_update_columns();

-- Recreate the update policy (row-level access unchanged)
CREATE POLICY "tournament_entries_update_self"
  ON tournament_entries FOR UPDATE
  TO authenticated
  USING (
    player_id = get_player_id()
    OR is_admin()
  );
