-- Only registered entrants (or admins) may post chat messages, matching the
-- read gate. Previously the insert policy only checked message ownership, so a
-- logged-in non-entrant could post even though they couldn't read the chat.
-- (Pundit/system messages are inserted with the service-role client, which
-- bypasses RLS, so they're unaffected.)
DROP POLICY IF EXISTS "chat_messages_insert_own" ON chat_messages;
CREATE POLICY "chat_messages_insert_own" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    player_id = get_player_id()
    AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM tournament_entries te
        WHERE te.tournament_id = chat_messages.tournament_id
          AND te.player_id = get_player_id()
      )
    )
  );
