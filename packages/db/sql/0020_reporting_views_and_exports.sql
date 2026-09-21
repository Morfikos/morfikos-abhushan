-- Spec 15: reporting views and export jobs.
--
-- These views are reconcilable projections over the existing tables. They do
-- not store a second set of books and hold no aggregates of their own: every
-- row can be recomputed from app.invoices, app.credit_notes, app.payments,
-- app.articles, and app.girvi_* at any time.
--
-- RLS: views run with the invoker's privileges, so base-table org_isolation
-- still filters rows. Grants below mirror the table pattern; anon/authenticated
-- stay without access.

-- Sales per Kolkata business date: finalized invoices on that date, plus credit
-- notes issued on that date (Asia/Kolkata). Draft invoices never count as sales.
-- Gross and returns can land on different dates; net is that day's difference.
CREATE OR REPLACE VIEW app.v_sales_by_business_date AS
WITH sales AS (
  SELECT
    i.organization_id,
    i.business_date,
    count(*)::bigint AS invoice_count,
    sum(i.grand_total_inr)::numeric(18, 2) AS gross_sales_inr
  FROM app.invoices i
  WHERE i.status = 'finalized'
  GROUP BY i.organization_id, i.business_date
),
returns AS (
  SELECT
    cn.organization_id,
    (timezone('Asia/Kolkata', cn.issued_at))::date AS business_date,
    sum(cn.amount_inr)::numeric(18, 2) AS returns_inr
  FROM app.credit_notes cn
  GROUP BY cn.organization_id, (timezone('Asia/Kolkata', cn.issued_at))::date
)
SELECT
  COALESCE(s.organization_id, r.organization_id) AS organization_id,
  COALESCE(s.business_date, r.business_date) AS business_date,
  COALESCE(s.invoice_count, 0)::bigint AS invoice_count,
  COALESCE(s.gross_sales_inr, 0)::numeric(18, 2) AS gross_sales_inr,
  COALESCE(r.returns_inr, 0)::numeric(18, 2) AS returns_inr
FROM sales s
FULL OUTER JOIN returns r
  ON r.organization_id = s.organization_id
 AND r.business_date = s.business_date;

-- Collections by method: posted sales collections minus refund and reversal
-- outflows. Girvi money never lands in app.payments, so it cannot leak in.
CREATE OR REPLACE VIEW app.v_collections_by_method AS
SELECT
  p.organization_id,
  p.received_business_date,
  p.method,
  sum(
    CASE
      WHEN p.kind = 'collection' AND p.status = 'posted' THEN p.amount_inr
      WHEN p.kind IN ('refund', 'reversal') THEN -p.amount_inr
      ELSE 0
    END
  )::numeric(18, 2) AS net_collected_inr,
  count(*) FILTER (WHERE p.kind = 'collection' AND p.status = 'posted')::bigint AS collection_count,
  count(*) FILTER (WHERE p.kind IN ('refund', 'reversal'))::bigint AS outflow_count
FROM app.payments p
GROUP BY p.organization_id, p.received_business_date, p.method;

-- Open customer sales dues, one row per finalized invoice still owing.
CREATE OR REPLACE VIEW app.v_sales_dues AS
SELECT
  i.organization_id,
  i.id AS invoice_id,
  i.invoice_number,
  i.business_date,
  i.customer_id,
  c.display_name AS customer_display_name,
  i.grand_total_inr,
  i.amount_paid_inr,
  i.amount_due_inr
FROM app.invoices i
JOIN app.customers c
  ON c.id = i.customer_id
 AND c.organization_id = i.organization_id
WHERE i.status = 'finalized'
  AND i.amount_due_inr > 0;

-- Available stock by category, metal, and purity. Sold, return_inspection, and
-- unavailable pieces are excluded from availability but stay in app.articles.
CREATE OR REPLACE VIEW app.v_inventory_available AS
SELECT
  a.organization_id,
  a.category_id,
  cc.name AS category_name,
  a.metal,
  a.purity,
  count(*)::bigint AS article_count,
  sum(a.net_metal_weight_grams)::numeric(14, 4) AS net_metal_weight_grams,
  sum(a.gross_weight_grams)::numeric(14, 4) AS gross_weight_grams
FROM app.articles a
JOIN app.catalogue_categories cc
  ON cc.id = a.category_id
 AND cc.organization_id = a.organization_id
WHERE a.status = 'available'
GROUP BY a.organization_id, a.category_id, cc.name, a.metal, a.purity;

-- Girvi position per account. Outstanding principal and unpaid interest are the
-- projections maintained on app.girvi_accounts by the settlement workflow.
CREATE OR REPLACE VIEW app.v_girvi_balances AS
SELECT
  g.organization_id,
  g.id AS girvi_account_id,
  g.account_number,
  g.customer_id,
  c.display_name AS customer_display_name,
  g.status,
  g.start_business_date,
  g.maturity_business_date,
  g.principal_inr,
  g.principal_outstanding_inr,
  g.interest_outstanding_inr,
  g.calculation_policy_version
FROM app.girvi_accounts g
JOIN app.customers c
  ON c.id = g.customer_id
 AND c.organization_id = g.organization_id;

GRANT SELECT ON app.v_sales_by_business_date TO app_api, app_worker;
GRANT SELECT ON app.v_collections_by_method TO app_api, app_worker;
GRANT SELECT ON app.v_sales_dues TO app_api, app_worker;
GRANT SELECT ON app.v_inventory_available TO app_api, app_worker;
GRANT SELECT ON app.v_girvi_balances TO app_api, app_worker;

REVOKE ALL ON app.v_sales_by_business_date FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.v_collections_by_method FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.v_sales_dues FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.v_inventory_available FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.v_girvi_balances FROM PUBLIC, anon, authenticated;

-- Indexes the dashboard range queries rely on. The existing invoices
-- business_date index is partial (unpaid only), so add a full one.
CREATE INDEX IF NOT EXISTS invoices_org_finalized_business_date_idx
  ON app.invoices (organization_id, business_date)
  WHERE status = 'finalized';

CREATE INDEX IF NOT EXISTS credit_notes_org_issued_idx
  ON app.credit_notes (organization_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS girvi_financial_events_org_date_type_idx
  ON app.girvi_financial_events (organization_id, effective_business_date, event_type);

CREATE INDEX IF NOT EXISTS stock_counts_org_counted_on_idx
  ON app.stock_counts (organization_id, counted_on DESC);

ALTER TABLE app.stored_objects
  DROP CONSTRAINT IF EXISTS stored_objects_owner_type_check;
ALTER TABLE app.stored_objects
  ADD CONSTRAINT stored_objects_owner_type_check CHECK (
    owner_type IS NULL
    OR owner_type IN ('article', 'customer', 'girvi', 'invoice', 'receipt', 'girvi_collateral', 'export')
  );

-- Export jobs: large exports are queued for the worker; small CSV streams
-- directly from the API. stored_object_id points at the private object once a
-- queued export has been rendered.
CREATE TABLE IF NOT EXISTS app.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  export_type text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  row_count integer,
  stored_object_id uuid REFERENCES app.stored_objects (id),
  last_error text,
  requested_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT export_jobs_type_check CHECK (
    export_type IN ('inventory', 'sales', 'dues', 'girvi')
  ),
  CONSTRAINT export_jobs_status_check CHECK (
    status IN ('pending', 'running', 'ready', 'failed')
  ),
  CONSTRAINT export_jobs_row_count_non_negative CHECK (row_count IS NULL OR row_count >= 0),
  CONSTRAINT export_jobs_ready_needs_object CHECK (
    status <> 'ready' OR stored_object_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS export_jobs_org_created_idx
  ON app.export_jobs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS export_jobs_org_status_idx
  ON app.export_jobs (organization_id, status);

ALTER TABLE app.export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.export_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON app.export_jobs;
CREATE POLICY org_isolation ON app.export_jobs
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.export_jobs TO app_api, app_worker;

REVOKE ALL ON app.export_jobs FROM PUBLIC, anon, authenticated;
