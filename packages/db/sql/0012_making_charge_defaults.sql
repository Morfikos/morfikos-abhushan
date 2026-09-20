-- Spec 08 UX: shop making-charge defaults by metal + purity (same axes as metal_rates).
-- Applied when POS adds a new draft line; explicit line_pricing patches still win.
-- Browser anon/authenticated stay without grants.

CREATE TABLE IF NOT EXISTS app.making_charge_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  metal text NOT NULL,
  purity text NOT NULL,
  making_charge jsonb NOT NULL,
  updated_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT making_charge_defaults_metal_check CHECK (metal IN ('gold', 'silver')),
  CONSTRAINT making_charge_defaults_purity_not_blank CHECK (char_length(trim(purity)) > 0),
  CONSTRAINT making_charge_defaults_org_metal_purity_unique UNIQUE (organization_id, metal, purity)
);

CREATE INDEX IF NOT EXISTS making_charge_defaults_org_idx
  ON app.making_charge_defaults (organization_id, metal, purity);

ALTER TABLE app.making_charge_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.making_charge_defaults FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON app.making_charge_defaults;
CREATE POLICY org_isolation ON app.making_charge_defaults
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.making_charge_defaults TO app_api, app_worker;

COMMENT ON TABLE app.making_charge_defaults IS
  'Default making_charge input (invoice.v1 shape) applied when a new POS draft line is added for that metal/purity.';
