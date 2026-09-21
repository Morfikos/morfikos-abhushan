-- Spec 11: Girvi accounts, collateral custody, custody events, and disbursement
-- financial events. Collateral is never an article and never saleable inventory.
-- Interest calculation stays unsupported until owner-approved examples (spec 12).
-- Browser anon/authenticated stay without grants.

CREATE TABLE IF NOT EXISTS app.girvi_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  account_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES app.customers (id),
  status text NOT NULL DEFAULT 'draft',
  principal_inr numeric(18, 2) NOT NULL,
  start_business_date date NOT NULL,
  maturity_business_date date NOT NULL,
  terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculation_policy_version text,
  activated_at timestamptz,
  activated_by_staff_user_id uuid REFERENCES app.staff_users (id),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT girvi_accounts_status_check CHECK (status IN ('draft', 'active', 'settled', 'released')),
  CONSTRAINT girvi_accounts_account_number_not_blank CHECK (char_length(trim(account_number)) > 0),
  CONSTRAINT girvi_accounts_principal_non_negative CHECK (principal_inr >= 0),
  CONSTRAINT girvi_accounts_maturity_after_start CHECK (maturity_business_date >= start_business_date),
  CONSTRAINT girvi_accounts_row_version_positive CHECK (row_version >= 1),
  CONSTRAINT girvi_accounts_org_account_number_unique UNIQUE (organization_id, account_number),
  CONSTRAINT girvi_accounts_activation_pair CHECK (
    (status = 'draft' AND activated_at IS NULL AND activated_by_staff_user_id IS NULL)
    OR (status <> 'draft')
  )
);

CREATE INDEX IF NOT EXISTS girvi_accounts_org_status_idx
  ON app.girvi_accounts (organization_id, status, maturity_business_date);

CREATE INDEX IF NOT EXISTS girvi_accounts_org_customer_idx
  ON app.girvi_accounts (organization_id, customer_id);

CREATE INDEX IF NOT EXISTS girvi_accounts_org_maturity_idx
  ON app.girvi_accounts (organization_id, maturity_business_date);

CREATE TABLE IF NOT EXISTS app.girvi_collateral_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  girvi_account_id uuid NOT NULL REFERENCES app.girvi_accounts (id) ON DELETE CASCADE,
  description text NOT NULL,
  metal text,
  purity text,
  gross_weight_grams numeric(14, 4),
  net_metal_weight_grams numeric(14, 4),
  assessed_value_inr numeric(18, 2),
  packet_number text NOT NULL,
  custody_location text NOT NULL,
  status text NOT NULL DEFAULT 'in_custody',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT girvi_collateral_items_description_not_blank CHECK (char_length(trim(description)) > 0),
  CONSTRAINT girvi_collateral_items_packet_not_blank CHECK (char_length(trim(packet_number)) > 0),
  CONSTRAINT girvi_collateral_items_location_not_blank CHECK (char_length(trim(custody_location)) > 0),
  CONSTRAINT girvi_collateral_items_status_check CHECK (status IN ('in_custody', 'released')),
  CONSTRAINT girvi_collateral_items_metal_check CHECK (metal IS NULL OR metal IN ('gold', 'silver')),
  CONSTRAINT girvi_collateral_items_weights_non_negative CHECK (
    (gross_weight_grams IS NULL OR gross_weight_grams >= 0)
    AND (net_metal_weight_grams IS NULL OR net_metal_weight_grams >= 0)
  ),
  CONSTRAINT girvi_collateral_items_assessed_non_negative CHECK (
    assessed_value_inr IS NULL OR assessed_value_inr >= 0
  )
);

-- One in-custody packet number per organization (collision = 409 at activate/save).
CREATE UNIQUE INDEX IF NOT EXISTS girvi_collateral_in_custody_packet_unique
  ON app.girvi_collateral_items (organization_id, packet_number)
  WHERE status = 'in_custody';

CREATE INDEX IF NOT EXISTS girvi_collateral_items_account_idx
  ON app.girvi_collateral_items (organization_id, girvi_account_id);

CREATE TABLE IF NOT EXISTS app.girvi_collateral_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  girvi_account_id uuid NOT NULL REFERENCES app.girvi_accounts (id) ON DELETE CASCADE,
  collateral_item_id uuid NOT NULL REFERENCES app.girvi_collateral_items (id) ON DELETE CASCADE,
  object_key text NOT NULL,
  checksum_sha256 text NOT NULL,
  uploaded_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  purpose text NOT NULL DEFAULT 'collateral_photo',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT girvi_collateral_files_object_key_not_blank CHECK (char_length(trim(object_key)) > 0),
  CONSTRAINT girvi_collateral_files_checksum_sha256 CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT girvi_collateral_files_purpose_not_blank CHECK (char_length(trim(purpose)) > 0),
  CONSTRAINT girvi_collateral_files_org_object_key_unique UNIQUE (organization_id, object_key)
);

CREATE INDEX IF NOT EXISTS girvi_collateral_files_item_idx
  ON app.girvi_collateral_files (organization_id, collateral_item_id);

CREATE TABLE IF NOT EXISTS app.girvi_custody_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  girvi_account_id uuid NOT NULL REFERENCES app.girvi_accounts (id) ON DELETE CASCADE,
  collateral_item_id uuid REFERENCES app.girvi_collateral_items (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  packet_number text NOT NULL,
  custody_location text,
  actor_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  occurred_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  notes text,
  CONSTRAINT girvi_custody_events_type_check CHECK (
    event_type IN ('received', 'location_changed', 'released')
  ),
  CONSTRAINT girvi_custody_events_packet_not_blank CHECK (char_length(trim(packet_number)) > 0)
);

CREATE INDEX IF NOT EXISTS girvi_custody_events_account_idx
  ON app.girvi_custody_events (organization_id, girvi_account_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS app.girvi_financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  girvi_account_id uuid NOT NULL REFERENCES app.girvi_accounts (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  effective_business_date date NOT NULL,
  principal_delta_inr numeric(18, 2) NOT NULL DEFAULT 0,
  interest_delta_inr numeric(18, 2) NOT NULL DEFAULT 0,
  amount_inr numeric(18, 2) NOT NULL,
  actor_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT girvi_financial_events_type_check CHECK (
    event_type IN ('disbursement', 'interest_accrual', 'repayment', 'settlement')
  ),
  CONSTRAINT girvi_financial_events_org_event_key_unique UNIQUE (organization_id, event_key)
);

CREATE INDEX IF NOT EXISTS girvi_financial_events_account_idx
  ON app.girvi_financial_events (organization_id, girvi_account_id, effective_business_date);

ALTER TABLE app.girvi_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_collateral_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_collateral_items FORCE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_collateral_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_collateral_files FORCE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_custody_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_custody_events FORCE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_financial_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON app.girvi_accounts;
CREATE POLICY org_isolation ON app.girvi_accounts
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

DROP POLICY IF EXISTS org_isolation ON app.girvi_collateral_items;
CREATE POLICY org_isolation ON app.girvi_collateral_items
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

DROP POLICY IF EXISTS org_isolation ON app.girvi_collateral_files;
CREATE POLICY org_isolation ON app.girvi_collateral_files
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

DROP POLICY IF EXISTS org_isolation ON app.girvi_custody_events;
CREATE POLICY org_isolation ON app.girvi_custody_events
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

DROP POLICY IF EXISTS org_isolation ON app.girvi_financial_events;
CREATE POLICY org_isolation ON app.girvi_financial_events
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.girvi_accounts TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.girvi_collateral_items TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.girvi_collateral_files TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.girvi_custody_events TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.girvi_financial_events TO app_api, app_worker;

REVOKE ALL ON app.girvi_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.girvi_collateral_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.girvi_collateral_files FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.girvi_custody_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.girvi_financial_events FROM PUBLIC, anon, authenticated;
