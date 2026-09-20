-- Spec 04: saleable inventory — categories, locations, articles, stones,
-- photograph metadata, movements, and reviewed stock counts.
-- Girvi collateral is a different entity family and is not created here.
-- Browser anon/authenticated stay without grants.

CREATE TABLE IF NOT EXISTS app.catalogue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  name text NOT NULL,
  default_metal text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT catalogue_categories_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT catalogue_categories_metal_check CHECK (default_metal IS NULL OR default_metal IN ('gold', 'silver')),
  CONSTRAINT catalogue_categories_org_name_unique UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS app.storage_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT storage_locations_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT storage_locations_org_branch_name_unique UNIQUE (organization_id, branch_id, name)
);

CREATE TABLE IF NOT EXISTS app.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  article_number text NOT NULL,
  barcode text,
  category_id uuid NOT NULL REFERENCES app.catalogue_categories (id),
  metal text NOT NULL,
  purity text NOT NULL,
  gross_weight_grams numeric(14, 4) NOT NULL,
  non_metal_weight_grams numeric(14, 4) NOT NULL DEFAULT 0,
  net_metal_weight_grams numeric(14, 4) NOT NULL,
  huid text,
  supplier_ref text,
  karigar_ref text,
  receipt_business_date date NOT NULL,
  acquisition_cost_inr numeric(18, 2),
  location_id uuid REFERENCES app.storage_locations (id),
  status text NOT NULL,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT articles_number_not_blank CHECK (char_length(trim(article_number)) > 0),
  CONSTRAINT articles_purity_not_blank CHECK (char_length(trim(purity)) > 0),
  CONSTRAINT articles_metal_check CHECK (metal IN ('gold', 'silver')),
  CONSTRAINT articles_status_check CHECK (status IN ('available', 'sold', 'return_inspection', 'unavailable')),
  CONSTRAINT articles_gross_positive CHECK (gross_weight_grams > 0),
  CONSTRAINT articles_non_metal_non_negative CHECK (non_metal_weight_grams >= 0),
  CONSTRAINT articles_net_positive CHECK (net_metal_weight_grams > 0),
  CONSTRAINT articles_net_matches CHECK (net_metal_weight_grams = gross_weight_grams - non_metal_weight_grams),
  CONSTRAINT articles_cost_non_negative CHECK (acquisition_cost_inr IS NULL OR acquisition_cost_inr >= 0),
  CONSTRAINT articles_row_version_positive CHECK (row_version >= 1),
  CONSTRAINT articles_org_number_unique UNIQUE (organization_id, article_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS articles_org_barcode_unique
  ON app.articles (organization_id, barcode)
  WHERE barcode IS NOT NULL AND char_length(trim(barcode)) > 0;

CREATE INDEX IF NOT EXISTS articles_org_status_category_idx
  ON app.articles (organization_id, status, category_id);

CREATE INDEX IF NOT EXISTS articles_org_number_idx
  ON app.articles (organization_id, article_number);

CREATE INDEX IF NOT EXISTS articles_org_gross_weight_idx
  ON app.articles (organization_id, gross_weight_grams);

CREATE TABLE IF NOT EXISTS app.article_stones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  article_id uuid NOT NULL REFERENCES app.articles (id),
  description text NOT NULL,
  weight_grams numeric(14, 4),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT article_stones_description_not_blank CHECK (char_length(trim(description)) > 0),
  CONSTRAINT article_stones_weight_non_negative CHECK (weight_grams IS NULL OR weight_grams >= 0)
);

CREATE TABLE IF NOT EXISTS app.article_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  article_id uuid NOT NULL REFERENCES app.articles (id),
  object_key text NOT NULL,
  checksum_sha256 text NOT NULL,
  content_type text NOT NULL,
  original_filename text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT article_files_object_key_not_blank CHECK (char_length(trim(object_key)) > 0),
  CONSTRAINT article_files_checksum_sha256 CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT article_files_content_type_check CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT article_files_byte_size_check CHECK (byte_size > 0 AND byte_size <= 5242880),
  CONSTRAINT article_files_org_object_key_unique UNIQUE (organization_id, object_key)
);

CREATE TABLE IF NOT EXISTS app.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  article_id uuid NOT NULL REFERENCES app.articles (id),
  movement_type text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  actor_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  related_invoice_id uuid,
  related_return_id uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT inventory_movements_type_check CHECK (
    movement_type IN ('receipt', 'sale', 'return_in', 'inspection_release', 'adjustment')
  ),
  CONSTRAINT inventory_movements_from_status_check CHECK (
    from_status IS NULL OR from_status IN ('available', 'sold', 'return_inspection', 'unavailable')
  ),
  CONSTRAINT inventory_movements_to_status_check CHECK (
    to_status IS NULL OR to_status IN ('available', 'sold', 'return_inspection', 'unavailable')
  ),
  CONSTRAINT inventory_movements_adjustment_reason CHECK (
    movement_type <> 'adjustment' OR (reason IS NOT NULL AND char_length(trim(reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS inventory_movements_org_article_idx
  ON app.inventory_movements (organization_id, article_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  counted_on date NOT NULL,
  status text NOT NULL,
  notes text,
  actor_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT stock_counts_status_check CHECK (status = 'reviewed')
);

CREATE TABLE IF NOT EXISTS app.stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  stock_count_id uuid NOT NULL REFERENCES app.stock_counts (id),
  article_id uuid NOT NULL REFERENCES app.articles (id),
  expected_status text NOT NULL,
  counted_status text NOT NULL,
  has_discrepancy boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT stock_count_lines_expected_status_check CHECK (
    expected_status IN ('available', 'sold', 'return_inspection', 'unavailable')
  ),
  CONSTRAINT stock_count_lines_counted_status_check CHECK (
    counted_status IN ('available', 'unavailable', 'missing')
  ),
  CONSTRAINT stock_count_lines_unique UNIQUE (stock_count_id, article_id)
);

INSERT INTO app.catalogue_categories (organization_id, name, default_metal, is_active)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Rings', 'gold', true),
  ('11111111-1111-4111-8111-111111111111', 'Chains', 'gold', true),
  ('11111111-1111-4111-8111-111111111111', 'Earrings', 'gold', true),
  ('11111111-1111-4111-8111-111111111111', 'Bangles', 'gold', true),
  ('11111111-1111-4111-8111-111111111111', 'Pendants', 'gold', true),
  ('11111111-1111-4111-8111-111111111111', 'Coins', 'silver', true)
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO app.storage_locations (organization_id, branch_id, name)
VALUES
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Counter'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Tray 1'),
  ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Safe')
ON CONFLICT (organization_id, branch_id, name) DO NOTHING;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'catalogue_categories',
    'storage_locations',
    'articles',
    'article_stones',
    'article_files',
    'inventory_movements',
    'stock_counts',
    'stock_count_lines'
  ]
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON app.%I', table_name);
  END LOOP;
END
$$;

CREATE POLICY org_isolation ON app.catalogue_categories
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.storage_locations
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.articles
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.article_stones
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.article_files
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.inventory_movements
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.stock_counts
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.stock_count_lines
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.catalogue_categories TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.storage_locations TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.articles TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.article_stones TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.article_files TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.inventory_movements TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.stock_counts TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.stock_count_lines TO app_api, app_worker;

REVOKE ALL ON app.catalogue_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.storage_locations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.articles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.article_stones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.article_files FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.inventory_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.stock_counts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.stock_count_lines FROM PUBLIC, anon, authenticated;
