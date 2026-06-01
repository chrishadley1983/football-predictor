-- Re-create the chat_messages self-referencing reply FK to nudge PostgREST into
-- re-introspecting it. (PostgREST's schema cache had dropped this relationship,
-- which 400'd the chat query; the app no longer depends on the embed, but the
-- constraint is recreated here so the relationship is present and consistent.)
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_reply_to_id_fkey;
ALTER TABLE chat_messages
  ADD CONSTRAINT chat_messages_reply_to_id_fkey
  FOREIGN KEY (reply_to_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
