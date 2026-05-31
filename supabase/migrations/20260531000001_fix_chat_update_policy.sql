-- SECURITY FIX (code-review H1):
-- The policy "Admins can update messages" (added in 20260228200000_chat_phase2_3.sql)
-- was defined FOR UPDATE TO authenticated USING (true) WITH CHECK (true). Despite
-- its name it allowed ANY authenticated user to UPDATE ANY row in chat_messages —
-- rewriting other players' content, toggling is_pinned, flipping message_type to
-- 'pundit'/'system' (impersonation), or editing metadata.
--
-- Restrict it to admins. (Players do not edit messages in the app; if self-edit is
-- ever wanted, add a separate narrow policy scoped to player_id = get_player_id().)

DROP POLICY IF EXISTS "Admins can update messages" ON chat_messages;

CREATE POLICY "Admins can update messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
