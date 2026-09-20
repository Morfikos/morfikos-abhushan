-- Spec 03: shop profile, rates, sequences, devices, reminders, audit, and
-- organization-scoped RLS for runtime roles. Organizations/branches/staff
-- tables already exist from 0002. Browser anon/authenticated stay without grants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
    CREATE ROLE app_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA app TO app_api, app_worker;

DO $$
BEGIN
  EXECUTE format('GRANT app_api TO %I', current_user);
  EXECUTE format('GRANT app_worker TO %I', current_user);
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_mvp_single
  ON app.organizations ((true));

CREATE TABLE IF NOT EXISTS app.shop_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  legal_name text NOT NULL,
  address_line text,
  phone text,
  invoice_footer text,
  logo_object_key text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT shop_profiles_organization_unique UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS app.metal_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  metal text NOT NULL,
  purity text NOT NULL,
  rate_per_gram numeric(18, 6) NOT NULL,
  effective_business_date date NOT NULL,
  created_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT metal_rates_metal_check CHECK (metal IN ('gold', 'silver')),
  CONSTRAINT metal_rates_purity_not_blank CHECK (char_length(trim(purity)) > 0),
  CONSTRAINT metal_rates_positive CHECK (rate_per_gram > 0),
  CONSTRAINT metal_rates_org_metal_purity_date_unique UNIQUE (organization_id, metal, purity, effective_business_date)
);

CREATE INDEX IF NOT EXISTS metal_rates_org_date_idx
  ON app.metal_rates (organization_id, effective_business_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS app.document_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  document_type text NOT NULL,
  prefix text NOT NULL,
  padding integer NOT NULL,
  next_value integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT document_sequences_type_check CHECK (document_type IN ('invoice', 'receipt', 'girvi_account', 'article')),
  CONSTRAINT document_sequences_padding_check CHECK (padding >= 1 AND padding <= 12),
  CONSTRAINT document_sequences_next_value_check CHECK (next_value >= 1),
  CONSTRAINT document_sequences_org_branch_type_unique UNIQUE (organization_id, branch_id, document_type)
);

CREATE TABLE IF NOT EXISTS app.device_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  scan_terminator text NOT NULL,
  expected_suffix text NOT NULL DEFAULT '',
  tag_width_mm numeric(8, 2) NOT NULL,
  tag_height_mm numeric(8, 2) NOT NULL,
  invoice_paper_size text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT device_settings_organization_unique UNIQUE (organization_id),
  CONSTRAINT device_settings_terminator_check CHECK (scan_terminator IN ('Enter', 'Tab', 'None')),
  CONSTRAINT device_settings_paper_check CHECK (invoice_paper_size IN ('A4', 'A5', '80mm')),
  CONSTRAINT device_settings_tag_positive CHECK (tag_width_mm > 0 AND tag_height_mm > 0)
);

CREATE TABLE IF NOT EXISTS app.reminder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  girvi_reminders_enabled boolean NOT NULL DEFAULT false,
  invoice_due_reminders_enabled boolean NOT NULL DEFAULT false,
  send_window_start time NOT NULL,
  send_window_end time NOT NULL,
  language text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT reminder_settings_organization_unique UNIQUE (organization_id),
  CONSTRAINT reminder_settings_language_check CHECK (language IN ('en', 'hi'))
);

CREATE TABLE IF NOT EXISTS app.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  actor_staff_user_id uuid REFERENCES app.staff_users (id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS audit_events_org_created_idx
  ON app.audit_events (organization_id, created_at DESC);

INSERT INTO app.shop_profiles (organization_id, legal_name, address_line, invoice_footer)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Aabhushan',
  NULL,
  NULL
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO app.document_sequences (organization_id, branch_id, document_type, prefix, padding, next_value)
VALUES
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'invoice', 'INV', 5, 1),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'receipt', 'RCT', 5, 1),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'girvi_account', 'GRV', 5, 1),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'article', 'ART', 5, 1)
ON CONFLICT (organization_id, branch_id, document_type) DO NOTHING;

INSERT INTO app.device_settings (
  organization_id,
  scan_terminator,
  expected_suffix,
  tag_width_mm,
  tag_height_mm,
  invoice_paper_size
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Enter',
  '',
  50,
  25,
  'A5'
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO app.reminder_settings (
  organization_id,
  girvi_reminders_enabled,
  invoice_due_reminders_enabled,
  send_window_start,
  send_window_end,
  language
)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  false,
  false,
  '10:00',
  '18:00',
  'en'
)
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION app.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.organization_id', true), '')::uuid
$$;

REVOKE ALL ON FUNCTION app.current_organization_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO app_api, app_worker;

CREATE OR REPLACE FUNCTION app.org_isolation_policy(row_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT row_organization_id IS NOT NULL
    AND app.current_organization_id() IS NOT NULL
    AND row_organization_id = app.current_organization_id()
$$;

REVOKE ALL ON FUNCTION app.org_isolation_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.org_isolation_policy(uuid) TO app_api, app_worker;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations',
    'branches',
    'staff_users',
    'staff_memberships',
    'staff_invitations',
    'shop_profiles',
    'metal_rates',
    'document_sequences',
    'device_settings',
    'reminder_settings',
    'audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON app.%I', table_name);
  END LOOP;
END
$$;

CREATE POLICY org_isolation ON app.organizations
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(id))
  WITH CHECK (app.org_isolation_policy(id));

CREATE POLICY org_isolation ON app.branches
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.staff_users
  FOR ALL TO app_api, app_worker
  USING (
    app.current_organization_id() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM app.staff_memberships m
      WHERE m.staff_user_id = staff_users.id
        AND m.organization_id = app.current_organization_id()
    )
  )
  WITH CHECK (app.current_organization_id() IS NOT NULL);

CREATE POLICY org_isolation ON app.staff_memberships
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.staff_invitations
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.shop_profiles
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.metal_rates
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.document_sequences
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.device_settings
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.reminder_settings
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.audit_events
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_api, app_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO app_api, app_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_api, app_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO app_api, app_worker;

REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM authenticated;
