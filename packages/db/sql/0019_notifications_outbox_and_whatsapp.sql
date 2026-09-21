-- Spec 14: notification history independent of queue retention, webhook
-- durable dedupe, and pgboss schema grants for the worker. Financial
-- transactions still only write outbox rows; WhatsApp send happens after
-- commit via the dispatcher + pg-boss. Browser anon/authenticated stay
-- without grants on app tables.

CREATE TABLE IF NOT EXISTS app.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  customer_id uuid NOT NULL REFERENCES app.customers (id),
  channel text NOT NULL DEFAULT 'whatsapp',
  purpose text NOT NULL,
  template_name text,
  provider_message_id text,
  status text NOT NULL DEFAULT 'pending',
  last_error_code text,
  retry_safe boolean NOT NULL DEFAULT false,
  last_webhook_at timestamptz,
  consent_checked_at timestamptz,
  balance_checked_at timestamptz,
  related_type text,
  related_id uuid,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT notifications_channel_check CHECK (channel = 'whatsapp'),
  CONSTRAINT notifications_purpose_check CHECK (
    purpose IN (
      'transactional_invoice',
      'transactional_receipt',
      'due_reminder',
      'girvi_reminder'
    )
  ),
  CONSTRAINT notifications_status_check CHECK (
    status IN ('pending', 'accepted', 'sent', 'delivered', 'failed', 'unknown', 'skipped')
  ),
  CONSTRAINT notifications_related_type_check CHECK (
    related_type IS NULL
    OR related_type IN ('invoice', 'payment', 'girvi')
  ),
  CONSTRAINT notifications_dedupe_key_not_blank CHECK (char_length(trim(dedupe_key)) > 0),
  CONSTRAINT notifications_org_dedupe_key_unique UNIQUE (organization_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS notifications_org_created_idx
  ON app.notifications (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_org_status_idx
  ON app.notifications (organization_id, status);

CREATE INDEX IF NOT EXISTS notifications_org_customer_idx
  ON app.notifications (organization_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_provider_message_id_idx
  ON app.notifications (organization_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.notification_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES app.organizations (id),
  provider text NOT NULL DEFAULT 'whatsapp_cloud',
  provider_event_id text NOT NULL,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT notification_webhook_events_provider_not_blank CHECK (char_length(trim(provider)) > 0),
  CONSTRAINT notification_webhook_events_provider_event_id_not_blank CHECK (char_length(trim(provider_event_id)) > 0),
  CONSTRAINT notification_webhook_events_payload_hash_not_blank CHECK (char_length(trim(payload_hash)) > 0),
  CONSTRAINT notification_webhook_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS notification_webhook_events_received_idx
  ON app.notification_webhook_events (received_at DESC);

ALTER TABLE app.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE app.notification_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.notification_webhook_events FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON app.notifications
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

-- Webhook insert may land before org mapping is known; allow worker/api read/write
-- when organization_id is set, and inserts with null org for durable receipt.
CREATE POLICY webhook_worker_all ON app.notification_webhook_events
  FOR ALL TO app_api, app_worker
  USING (
    organization_id IS NULL
    OR app.org_isolation_policy(organization_id)
  )
  WITH CHECK (
    organization_id IS NULL
    OR app.org_isolation_policy(organization_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON app.notifications TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.notification_webhook_events TO app_api, app_worker;

REVOKE ALL ON app.notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.notification_webhook_events FROM PUBLIC, anon, authenticated;

-- pg-boss owns its schema; worker creates job tables on start.
CREATE SCHEMA IF NOT EXISTS pgboss;
GRANT USAGE, CREATE ON SCHEMA pgboss TO app_worker;
GRANT ALL ON ALL TABLES IN SCHEMA pgboss TO app_worker;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgboss TO app_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT ALL ON TABLES TO app_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT ALL ON SEQUENCES TO app_worker;
