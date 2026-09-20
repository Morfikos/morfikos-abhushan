-- Spec 06: organization-scoped customer directory, per-channel consent,
-- and identity-file metadata (object bytes remain spec 13).
-- No customer Auth accounts. Sales and Girvi balances are not cached here.
-- Browser anon/authenticated stay without grants.

CREATE TABLE IF NOT EXISTS app.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  display_name text NOT NULL,
  phone_normalized text,
  phone_display text,
  email text,
  address_line text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT customers_display_name_not_blank CHECK (char_length(trim(display_name)) > 0),
  CONSTRAINT customers_phone_normalized_e164 CHECK (
    phone_normalized IS NULL OR phone_normalized ~ '^\+[1-9][0-9]{7,14}$'
  ),
  CONSTRAINT customers_phone_pair CHECK (
    (phone_normalized IS NULL AND phone_display IS NULL)
    OR (phone_normalized IS NOT NULL AND phone_display IS NOT NULL AND char_length(trim(phone_display)) > 0)
  ),
  CONSTRAINT customers_email_format CHECK (
    email IS NULL OR email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_org_phone_unique
  ON app.customers (organization_id, phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_org_name_idx
  ON app.customers (organization_id, display_name);

CREATE INDEX IF NOT EXISTS customers_org_created_idx
  ON app.customers (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customers_org_active_idx
  ON app.customers (organization_id, is_active);

CREATE TABLE IF NOT EXISTS app.customer_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  customer_id uuid NOT NULL REFERENCES app.customers (id),
  channel text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  granted_at timestamptz,
  revoked_at timestamptz,
  language text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT customer_consents_channel_check CHECK (channel IN ('whatsapp')),
  CONSTRAINT customer_consents_purpose_check CHECK (
    purpose IN ('transactional_invoice', 'transactional_receipt', 'due_reminder', 'girvi_reminder')
  ),
  CONSTRAINT customer_consents_status_check CHECK (status IN ('granted', 'revoked')),
  CONSTRAINT customer_consents_language_check CHECK (language IS NULL OR language IN ('en', 'hi')),
  CONSTRAINT customer_consents_granted_at_check CHECK (status = 'revoked' OR granted_at IS NOT NULL),
  CONSTRAINT customer_consents_revoked_at_check CHECK (status = 'granted' OR revoked_at IS NOT NULL),
  CONSTRAINT customer_consents_org_customer_channel_purpose_unique UNIQUE (organization_id, customer_id, channel, purpose)
);

CREATE INDEX IF NOT EXISTS customer_consents_customer_idx
  ON app.customer_consents (organization_id, customer_id);

CREATE TABLE IF NOT EXISTS app.customer_identity_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  customer_id uuid NOT NULL REFERENCES app.customers (id),
  object_key text NOT NULL,
  checksum_sha256 text NOT NULL,
  uploaded_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  purpose text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT customer_identity_files_object_key_not_blank CHECK (char_length(trim(object_key)) > 0),
  CONSTRAINT customer_identity_files_checksum_sha256 CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT customer_identity_files_purpose_not_blank CHECK (char_length(trim(purpose)) > 0),
  CONSTRAINT customer_identity_files_org_object_key_unique UNIQUE (organization_id, object_key)
);

CREATE INDEX IF NOT EXISTS customer_identity_files_customer_idx
  ON app.customer_identity_files (organization_id, customer_id);

ALTER TABLE app.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customers FORCE ROW LEVEL SECURITY;
ALTER TABLE app.customer_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE app.customer_identity_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_identity_files FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON app.customers
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.customer_consents
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.customer_identity_files
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.customers TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.customer_consents TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.customer_identity_files TO app_api, app_worker;

REVOKE ALL ON app.customers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.customer_consents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.customer_identity_files FROM PUBLIC, anon, authenticated;
