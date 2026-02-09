-- Fix: public_player_profiles view bypasses RLS because views run as owner.
-- Recreate with security_invoker = true so the view respects the caller's RLS policies.

DROP VIEW IF EXISTS public_player_profiles;

CREATE VIEW public_player_profiles
  WITH (security_invoker = true) AS
  SELECT id, display_name, nickname, avatar_url
  FROM players;

GRANT SELECT ON public_player_profiles TO anon;
GRANT SELECT ON public_player_profiles TO authenticated;

-- Fix: Chat delete policy uses inline admin check instead of is_admin()
DROP POLICY IF EXISTS "chat_messages_delete_admin" ON chat_messages;
CREATE POLICY "chat_messages_delete_admin" ON chat_messages FOR DELETE TO authenticated
  USING (is_admin());

-- Fix: Chat insert policy uses inline subquery instead of get_player_id()
DROP POLICY IF EXISTS "chat_messages_insert_own" ON chat_messages;
CREATE POLICY "chat_messages_insert_own" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (player_id = get_player_id());

-- Fix: Guard tournament_id and player_id in entry update trigger
CREATE OR REPLACE FUNCTION check_entry_update_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Admins can update anything
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admins cannot change scoring columns, payment_status, or ownership columns
  IF NEW.tournament_id IS DISTINCT FROM OLD.tournament_id
    OR NEW.player_id IS DISTINCT FROM OLD.player_id
    OR NEW.group_stage_points IS DISTINCT FROM OLD.group_stage_points
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix: Add NOT NULL constraints to structural FK columns
-- (only safe columns that should never be null)
ALTER TABLE groups ALTER COLUMN tournament_id SET NOT NULL;
ALTER TABLE group_teams ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE group_teams ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE tournament_entries ALTER COLUMN tournament_id SET NOT NULL;
ALTER TABLE tournament_entries ALTER COLUMN player_id SET NOT NULL;
ALTER TABLE group_predictions ALTER COLUMN entry_id SET NOT NULL;
ALTER TABLE group_predictions ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE group_results ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE group_results ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE knockout_predictions ALTER COLUMN entry_id SET NOT NULL;
ALTER TABLE knockout_predictions ALTER COLUMN match_id SET NOT NULL;
ALTER TABLE knockout_matches ALTER COLUMN tournament_id SET NOT NULL;
ALTER TABLE posts ALTER COLUMN tournament_id SET NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN tournament_id SET NOT NULL;
ALTER TABLE chat_messages ALTER COLUMN player_id SET NOT NULL;

-- Fix: Add SET search_path to existing SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_player_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT id FROM players WHERE auth_user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix: Drop duplicate indexes (same columns, different names from migration 150000 vs 240000)
DROP INDEX IF EXISTS idx_tournament_entries_tournament;
DROP INDEX IF EXISTS idx_tournament_entries_player;
DROP INDEX IF EXISTS idx_group_predictions_entry;
DROP INDEX IF EXISTS idx_knockout_predictions_entry;
DROP INDEX IF EXISTS idx_knockout_matches_tournament;
DROP INDEX IF EXISTS idx_posts_tournament;
