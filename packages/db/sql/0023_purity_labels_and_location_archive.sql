-- Purity catalogue + soft-archive for storage locations.
-- Articles/rates/making keep storing purity as text labels; catalogue drives UI and write validation.

CREATE TABLE IF NOT EXISTS app.purity_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT purity_labels_label_not_blank CHECK (char_length(trim(label)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS purity_labels_org_label_lower_uidx
  ON app.purity_labels (organization_id, lower(trim(label)));

CREATE INDEX IF NOT EXISTS purity_labels_org_active_idx
  ON app.purity_labels (organization_id, is_active, sort_order, label);

ALTER TABLE app.purity_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.purity_labels FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON app.purity_labels;
CREATE POLICY org_isolation ON app.purity_labels
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON app.purity_labels TO app_api, app_worker;
REVOKE ALL ON app.purity_labels FROM PUBLIC, anon, authenticated;

ALTER TABLE app.storage_locations
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Common defaults + distinct purities already in use (per organization).
INSERT INTO app.purity_labels (organization_id, label, sort_order, is_active)
SELECT o.id, v.label, v.sort_order, true
FROM app.organizations o
CROSS JOIN (
  VALUES
    ('22K', 10),
    ('18K', 20),
    ('14K', 30),
    ('999', 40),
    ('925', 50)
) AS v(label, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM app.purity_labels p
  WHERE p.organization_id = o.id
    AND lower(trim(p.label)) = lower(trim(v.label))
);

INSERT INTO app.purity_labels (organization_id, label, sort_order, is_active)
SELECT DISTINCT used.org_id, trim(used.purity), 100, true
FROM (
  SELECT organization_id AS org_id, purity FROM app.articles WHERE char_length(trim(purity)) > 0
  UNION
  SELECT organization_id, purity FROM app.metal_rates WHERE char_length(trim(purity)) > 0
  UNION
  SELECT organization_id, purity FROM app.making_charge_defaults WHERE char_length(trim(purity)) > 0
) AS used
WHERE NOT EXISTS (
  SELECT 1
  FROM app.purity_labels p
  WHERE p.organization_id = used.org_id
    AND lower(trim(p.label)) = lower(trim(used.purity))
);

COMMENT ON TABLE app.purity_labels IS
  'Org catalogue of purity labels for inventory, rates, and making defaults. Articles store the label string.';
