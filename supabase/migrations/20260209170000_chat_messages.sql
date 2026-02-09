-- Chat messages for tournament forums
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) <= 500),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_tournament ON chat_messages(tournament_id, created_at DESC);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read chat messages
CREATE POLICY "chat_messages_select_authenticated" ON chat_messages FOR SELECT TO authenticated USING (true);

-- Authenticated users can insert their own messages
CREATE POLICY "chat_messages_insert_own" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (player_id = (SELECT id FROM players WHERE auth_user_id = auth.uid()));

-- Admin can delete any message
CREATE POLICY "chat_messages_delete_admin" ON chat_messages FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Public can read chat messages too
CREATE POLICY "chat_messages_select_anon" ON chat_messages FOR SELECT TO anon USING (true);
