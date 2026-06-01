-- Chat visibility: only users registered (entered) for a tournament may read
-- its chat, and entrants can resolve each other's player display info so author
-- names render instead of "Unknown".
--
-- Also reloads the PostgREST schema cache: the chat_messages self-referencing
-- reply_to_id FK existed in the DB but wasn't in PostgREST's cache, so the chat
-- query (which embeds reply previews) failed with PGRST200 and the room showed
-- no messages at all.

-- ── 1. Chat messages: entrants (or admins) only ──
DROP POLICY IF EXISTS "chat_messages_select_authenticated" ON chat_messages;
CREATE POLICY "chat_messages_select_entrants" ON chat_messages
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM tournament_entries te
      WHERE te.tournament_id = chat_messages.tournament_id
        AND te.player_id = get_player_id()
    )
  );

-- Anonymous visitors aren't registered for any tournament, so they no longer
-- see chat content.
DROP POLICY IF EXISTS "chat_messages_select_anon" ON chat_messages;

-- ── 2. Players: co-entrants can see each other's display info ──
-- An authenticated user can read the player row of anyone they share a
-- tournament with, so chat / leaderboard / predictions resolve names instead of
-- showing "Unknown". (Own row and system/pundit players remain covered by their
-- existing policies.)
DROP POLICY IF EXISTS "players_select_co_entrants" ON players;
CREATE POLICY "players_select_co_entrants" ON players
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM tournament_entries te_them
      JOIN tournament_entries te_me
        ON te_me.tournament_id = te_them.tournament_id
      WHERE te_them.player_id = players.id
        AND te_me.player_id = get_player_id()
    )
  );

-- ── 3. Refresh PostgREST's schema cache so the reply_to_id FK is recognised ──
NOTIFY pgrst, 'reload schema';
