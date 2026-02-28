-- =============================================================================
-- Chat Phase 2+3: Unread cursors, pinned messages, rate limiting
-- =============================================================================

-- -------------------------------------------------------------------------
-- 1. chat_read_cursors — track last read position per player per tournament
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_read_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, tournament_id)
);

CREATE INDEX idx_chat_read_cursors_player ON chat_read_cursors(player_id, tournament_id);

ALTER TABLE chat_read_cursors ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read their own cursor
CREATE POLICY "Users can read own cursors"
  ON chat_read_cursors FOR SELECT
  TO authenticated
  USING (player_id IN (
    SELECT id FROM players WHERE auth_user_id = auth.uid()
  ));

-- Users can upsert their own cursor
CREATE POLICY "Users can upsert own cursors"
  ON chat_read_cursors FOR INSERT
  TO authenticated
  WITH CHECK (player_id IN (
    SELECT id FROM players WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update own cursors"
  ON chat_read_cursors FOR UPDATE
  TO authenticated
  USING (player_id IN (
    SELECT id FROM players WHERE auth_user_id = auth.uid()
  ))
  WITH CHECK (player_id IN (
    SELECT id FROM players WHERE auth_user_id = auth.uid()
  ));

-- -------------------------------------------------------------------------
-- 2. is_pinned column on chat_messages
-- -------------------------------------------------------------------------
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_chat_messages_pinned
  ON chat_messages(tournament_id)
  WHERE is_pinned = true;

-- -------------------------------------------------------------------------
-- 3. Rate limit function + trigger (max 1 message per 3 seconds per player)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_chat_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  last_msg_at TIMESTAMPTZ;
BEGIN
  -- Skip rate limit for system/pundit messages (player_id starts with 00000000)
  IF NEW.player_id::text LIKE '00000000-%' THEN
    RETURN NEW;
  END IF;

  SELECT created_at INTO last_msg_at
  FROM chat_messages
  WHERE player_id = NEW.player_id
    AND tournament_id = NEW.tournament_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF last_msg_at IS NOT NULL AND (now() - last_msg_at) < INTERVAL '3 seconds' THEN
    RAISE EXCEPTION 'Rate limit: please wait before sending another message';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_rate_limit ON chat_messages;

CREATE TRIGGER trg_chat_rate_limit
  BEFORE INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION check_chat_rate_limit();

-- -------------------------------------------------------------------------
-- 4. Add UPDATE policy for chat_messages so admins can pin/unpin
-- -------------------------------------------------------------------------
CREATE POLICY "Admins can update messages"
  ON chat_messages FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
