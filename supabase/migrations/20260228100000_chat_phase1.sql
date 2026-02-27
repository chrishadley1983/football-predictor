-- ============================================================================
-- Chat Phase 1: Reactions, Replies, Mentions, Pundit System Players
-- ============================================================================

-- ── 1. Extend chat_messages ──

-- Bump content limit from 500 to 2000 chars (for future rich messages)
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_content_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_content_check
  CHECK (char_length(content) <= 2000);

-- Add reply_to for quoted replies (self-referencing FK)
ALTER TABLE chat_messages
  ADD COLUMN reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL;

-- Add message_type to distinguish regular, pundit, and system messages
ALTER TABLE chat_messages
  ADD COLUMN message_type TEXT NOT NULL DEFAULT 'user'
  CHECK (message_type IN ('user', 'pundit', 'system'));

-- Add metadata JSONB for extensible data (pundit_key, etc.)
ALTER TABLE chat_messages
  ADD COLUMN metadata JSONB DEFAULT NULL;

-- Index for reply lookups
CREATE INDEX idx_chat_messages_reply_to ON chat_messages(reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- ── 2. Chat reactions table ──

CREATE TABLE chat_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('⚽', '🔥', '😂', '💀', '👑', '🤡', '🫡', '🧊')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, player_id, emoji)
);

CREATE INDEX idx_chat_reactions_message ON chat_reactions(message_id);

ALTER TABLE chat_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can read reactions
CREATE POLICY "chat_reactions_select_authenticated" ON chat_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chat_reactions_select_anon" ON chat_reactions
  FOR SELECT TO anon USING (true);

-- Authenticated users can add their own reactions
CREATE POLICY "chat_reactions_insert_own" ON chat_reactions
  FOR INSERT TO authenticated
  WITH CHECK (player_id = (SELECT id FROM players WHERE auth_user_id = auth.uid()));

-- Authenticated users can remove their own reactions
CREATE POLICY "chat_reactions_delete_own" ON chat_reactions
  FOR DELETE TO authenticated
  USING (player_id = (SELECT id FROM players WHERE auth_user_id = auth.uid()));

-- ── 3. Chat mentions table ──

CREATE TABLE chat_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  mentioned_player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, mentioned_player_id)
);

CREATE INDEX idx_chat_mentions_player ON chat_mentions(mentioned_player_id, created_at DESC);

ALTER TABLE chat_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_mentions_select_authenticated" ON chat_mentions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chat_mentions_select_anon" ON chat_mentions
  FOR SELECT TO anon USING (true);

-- ── 4. System players for AI pundits ──
-- Deterministic UUIDs so code can reference them directly

INSERT INTO players (id, auth_user_id, display_name, nickname, email)
VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'Gary Neverill', 'Neverill', 'pundit-neverill@system.local'),
  ('00000000-0000-0000-0000-000000000002', NULL, 'Ian Bright', 'Bright', 'pundit-bright@system.local'),
  ('00000000-0000-0000-0000-000000000003', NULL, 'Roy Meane', 'Meane', 'pundit-meane@system.local'),
  ('00000000-0000-0000-0000-000000000004', NULL, 'Jamie Scaragher', 'Scaragher', 'pundit-scaragher@system.local')
ON CONFLICT (email) DO NOTHING;

-- Allow authenticated users to read pundit system players (auth_user_id IS NULL)
-- This is needed because the chat query joins players via FK
CREATE POLICY "players_select_system" ON players
  FOR SELECT TO authenticated
  USING (auth_user_id IS NULL);

-- Also allow anon to read system players (for MiniChat on homepage)
CREATE POLICY "players_select_system_anon" ON players
  FOR SELECT TO anon
  USING (auth_user_id IS NULL);

-- ── 5. Add chat_reactions to realtime publication ──

ALTER PUBLICATION supabase_realtime ADD TABLE chat_reactions;
