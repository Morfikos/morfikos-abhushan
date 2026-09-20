-- Spec 07: versioned invoice calculation policies.
-- Seed owner-approved invoice.v1 with: pnpm seed:calculation-policy
-- Do not invent method defaults in this migration.
-- Browser anon/authenticated stay without grants.

CREATE TABLE IF NOT EXISTS app.calculation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  version text NOT NULL,
  status text NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  weight_unit text NOT NULL DEFAULT 'g',
  rate_unit text NOT NULL DEFAULT 'per_g',
  making_charge_method text,
  wastage_method text,
  discount_method text,
  tax_method text,
  rounding_mode text,
  rounding_scale integer,
  approved_at timestamptz,
  approved_by_staff_user_id uuid REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT calculation_policies_version_not_blank CHECK (char_length(trim(version)) > 0),
  CONSTRAINT calculation_policies_status_check CHECK (status IN ('draft', 'approved', 'retired')),
  CONSTRAINT calculation_policies_currency_check CHECK (currency IN ('INR')),
  CONSTRAINT calculation_policies_weight_unit_check CHECK (weight_unit IN ('g')),
  CONSTRAINT calculation_policies_rate_unit_check CHECK (rate_unit IN ('per_g')),
  CONSTRAINT calculation_policies_rounding_scale_check CHECK (
    rounding_scale IS NULL OR (rounding_scale >= 0 AND rounding_scale <= 18)
  ),
  CONSTRAINT calculation_policies_approved_pair CHECK (
    (status <> 'approved' AND approved_at IS NULL AND approved_by_staff_user_id IS NULL)
    OR (status = 'approved' AND approved_at IS NOT NULL AND approved_by_staff_user_id IS NOT NULL)
  ),
  CONSTRAINT calculation_policies_org_version_unique UNIQUE (organization_id, version)
);

CREATE INDEX IF NOT EXISTS calculation_policies_org_status_idx
  ON app.calculation_policies (organization_id, status, updated_at DESC);

ALTER TABLE app.calculation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.calculation_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON app.calculation_policies
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.calculation_policies TO app_api, app_worker;

REVOKE ALL ON app.calculation_policies FROM PUBLIC, anon, authenticated;
