-- Chat audit webhook: after each chat_messages insert, POST to the app so it
-- can render the audit email. The webhook's shared secret is stored in
-- Supabase Vault under the name 'chat_audit_secret' and must match
-- CHAT_AUDIT_WEBHOOK_SECRET in the deployed app.
--
-- One-off bootstrap (run once via the Supabase SQL editor or the CLI):
--   SELECT vault.create_secret('<random-32-byte-hex>', 'chat_audit_secret',
--     'Audit webhook shared secret for chat_messages trigger');
-- Rotate by updating the vault secret — no need to redeploy this migration.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.chat_messages_audit_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  secret text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'chat_audit_secret'
  LIMIT 1;

  IF secret IS NULL OR secret = '' THEN
    RAISE WARNING 'chat_messages_audit_notify: vault secret "chat_audit_secret" is missing; skipping webhook for message %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://football-predictor-six.vercel.app/api/webhooks/chat-message',
    body    := jsonb_build_object('message_id', NEW.id),
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'X-Audit-Secret', secret
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never fail the chat insert because the webhook broke.
  RAISE WARNING 'chat_messages_audit_notify failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_audit_trigger ON chat_messages;
CREATE TRIGGER chat_messages_audit_trigger
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.chat_messages_audit_notify();
