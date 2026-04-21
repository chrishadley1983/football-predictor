-- Chat audit webhook: after each chat_messages insert, POST to the app so it
-- can render the audit email. Secret is read from a per-database GUC
-- (app.chat_audit_secret) that must be set once by the operator via:
--   ALTER DATABASE postgres SET app.chat_audit_secret = '<random-32-byte-hex>';
-- The same value must also live in the app as CHAT_AUDIT_WEBHOOK_SECRET.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.chat_messages_audit_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  secret text;
BEGIN
  secret := current_setting('app.chat_audit_secret', true);
  IF secret IS NULL OR secret = '' THEN
    RAISE WARNING 'chat_messages_audit_notify: app.chat_audit_secret is not configured; skipping webhook for message %', NEW.id;
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
