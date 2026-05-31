-- ENVIRONMENT-SAFETY FIX (code-review M5):
-- 20260421120000_chat_audit_webhook.sql hard-coded the production webhook URL
-- (https://football-predictor-six.vercel.app/...). Every database this migration
-- runs against (preview branches, forked dev DBs, local dev pointed at a shared
-- DB) therefore POSTs chat inserts to PRODUCTION. Make the URL a Vault secret so
-- each environment targets its own app.
--
-- Bootstrap per environment (run once via SQL editor / CLI), e.g. production:
--   SELECT vault.create_secret(
--     'https://football-predictor-six.vercel.app/api/webhooks/chat-message',
--     'chat_audit_webhook_url',
--     'Chat audit webhook target URL for this environment');
-- If the URL secret is absent, the webhook is skipped (no cross-env leakage).

CREATE OR REPLACE FUNCTION public.chat_messages_audit_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  secret text;
  webhook_url text;
BEGIN
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE name = 'chat_audit_secret'
  LIMIT 1;

  SELECT decrypted_secret INTO webhook_url
  FROM vault.decrypted_secrets
  WHERE name = 'chat_audit_webhook_url'
  LIMIT 1;

  IF secret IS NULL OR secret = '' THEN
    RAISE WARNING 'chat_messages_audit_notify: vault secret "chat_audit_secret" is missing; skipping webhook for message %', NEW.id;
    RETURN NEW;
  END IF;

  IF webhook_url IS NULL OR webhook_url = '' THEN
    RAISE WARNING 'chat_messages_audit_notify: vault secret "chat_audit_webhook_url" is missing; skipping webhook for message %', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := webhook_url,
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
