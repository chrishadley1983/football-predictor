-- Fix CR-004: Player emails exposed to anon users
-- The players_select_anon policy grants full SELECT (including email) to anonymous users.
-- RLS cannot restrict at the column level, so we:
-- 1. Replace the blanket policy with one limited to players visible in public data
-- 2. Create a safe view for direct lookups

-- Drop the blanket anon SELECT policy that exposes all player emails
DROP POLICY IF EXISTS "players_select_anon" ON players;

-- Add a restricted anon policy: only allow reading players who appear in honours
-- This limits the blast radius - only players with public achievements are visible
CREATE POLICY "players_select_anon_limited" ON players
  FOR SELECT TO anon
  USING (
    EXISTS (SELECT 1 FROM honours WHERE honours.player_id = players.id)
  );

-- Also create a safe view with only non-sensitive columns for public access
CREATE OR REPLACE VIEW public_player_profiles AS
  SELECT id, display_name, nickname, avatar_url
  FROM players;

GRANT SELECT ON public_player_profiles TO anon;
GRANT SELECT ON public_player_profiles TO authenticated;
