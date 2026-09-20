-- Spec 08: invoice drafts/finalization, initial payment tables (spec 09 shapes),
-- idempotency keys, and transactional outbox. Live successful finalization still
-- requires an approved calculation policy (spec 07). Browser roles stay without grants.

CREATE TABLE IF NOT EXISTS app.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  invoice_number text,
  customer_id uuid NOT NULL REFERENCES app.customers (id),
  status text NOT NULL,
  business_date date NOT NULL,
  quote_version integer NOT NULL DEFAULT 1,
  calculation_policy_version text,
  metal_value_inr numeric(18,2) NOT NULL DEFAULT 0,
  making_charges_inr numeric(18,2) NOT NULL DEFAULT 0,
  wastage_inr numeric(18,2) NOT NULL DEFAULT 0,
  stone_charges_inr numeric(18,2) NOT NULL DEFAULT 0,
  discount_inr numeric(18,2) NOT NULL DEFAULT 0,
  tax_inr numeric(18,2) NOT NULL DEFAULT 0,
  round_off_inr numeric(18,2) NOT NULL DEFAULT 0,
  grand_total_inr numeric(18,2) NOT NULL DEFAULT 0,
  amount_paid_inr numeric(18,2) NOT NULL DEFAULT 0,
  amount_due_inr numeric(18,2) NOT NULL DEFAULT 0,
  finalized_at timestamptz,
  finalized_by_staff_user_id uuid REFERENCES app.staff_users (id),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT invoices_status_check CHECK (status IN ('draft', 'finalized')),
  CONSTRAINT invoices_quote_version_check CHECK (quote_version >= 1),
  CONSTRAINT invoices_row_version_check CHECK (row_version >= 1),
  CONSTRAINT invoices_amounts_non_negative CHECK (
    metal_value_inr >= 0
    AND making_charges_inr >= 0
    AND wastage_inr >= 0
    AND stone_charges_inr >= 0
    AND discount_inr >= 0
    AND tax_inr >= 0
    AND grand_total_inr >= 0
    AND amount_paid_inr >= 0
    AND amount_due_inr >= 0
  ),
  CONSTRAINT invoices_draft_number_null CHECK (
    (status = 'draft' AND invoice_number IS NULL AND finalized_at IS NULL AND finalized_by_staff_user_id IS NULL)
    OR (status = 'finalized' AND invoice_number IS NOT NULL AND finalized_at IS NOT NULL AND finalized_by_staff_user_id IS NOT NULL
        AND calculation_policy_version IS NOT NULL AND char_length(trim(calculation_policy_version)) > 0)
  ),
  CONSTRAINT invoices_org_number_unique UNIQUE (organization_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS invoices_org_status_updated_idx
  ON app.invoices (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS invoices_org_customer_idx
  ON app.invoices (organization_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_org_due_idx
  ON app.invoices (organization_id, business_date)
  WHERE status = 'finalized' AND amount_due_inr > 0;

CREATE TABLE IF NOT EXISTS app.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  invoice_id uuid NOT NULL REFERENCES app.invoices (id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  article_id uuid NOT NULL REFERENCES app.articles (id),
  article_number text NOT NULL,
  barcode text,
  description text NOT NULL,
  metal text NOT NULL,
  purity text NOT NULL,
  gross_weight_grams numeric(14,4) NOT NULL,
  non_metal_weight_grams numeric(14,4) NOT NULL,
  net_metal_weight_grams numeric(14,4) NOT NULL,
  rate_per_gram numeric(18,6),
  metal_value_inr numeric(18,2) NOT NULL DEFAULT 0,
  making_charge_inr numeric(18,2) NOT NULL DEFAULT 0,
  wastage_inr numeric(18,2) NOT NULL DEFAULT 0,
  stone_charges_inr numeric(18,2) NOT NULL DEFAULT 0,
  line_discount_inr numeric(18,2) NOT NULL DEFAULT 0,
  line_total_inr numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT invoice_lines_line_no_check CHECK (line_no >= 1),
  CONSTRAINT invoice_lines_metal_check CHECK (metal IN ('gold', 'silver')),
  CONSTRAINT invoice_lines_weights_check CHECK (
    gross_weight_grams >= 0
    AND non_metal_weight_grams >= 0
    AND net_metal_weight_grams >= 0
    AND gross_weight_grams >= non_metal_weight_grams
  ),
  CONSTRAINT invoice_lines_org_invoice_line_unique UNIQUE (organization_id, invoice_id, line_no),
  CONSTRAINT invoice_lines_org_invoice_article_unique UNIQUE (organization_id, invoice_id, article_id)
);

CREATE INDEX IF NOT EXISTS invoice_lines_org_invoice_idx
  ON app.invoice_lines (organization_id, invoice_id, line_no);

CREATE INDEX IF NOT EXISTS invoice_lines_org_article_idx
  ON app.invoice_lines (organization_id, article_id);

CREATE TABLE IF NOT EXISTS app.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  customer_id uuid NOT NULL REFERENCES app.customers (id),
  method text NOT NULL,
  amount_inr numeric(18,2) NOT NULL,
  reference text,
  status text NOT NULL,
  received_business_date date NOT NULL,
  received_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  received_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  reversed_by_payment_id uuid REFERENCES app.payments (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT payments_method_check CHECK (method IN ('cash', 'upi', 'card', 'bank')),
  CONSTRAINT payments_status_check CHECK (status IN ('posted', 'reversed')),
  CONSTRAINT payments_amount_positive CHECK (amount_inr > 0)
);

CREATE INDEX IF NOT EXISTS payments_org_customer_idx
  ON app.payments (organization_id, customer_id, received_at DESC);

CREATE INDEX IF NOT EXISTS payments_org_date_idx
  ON app.payments (organization_id, received_business_date, method);

CREATE TABLE IF NOT EXISTS app.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  payment_id uuid NOT NULL REFERENCES app.payments (id),
  invoice_id uuid NOT NULL REFERENCES app.invoices (id),
  amount_inr numeric(18,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT payment_allocations_amount_positive CHECK (amount_inr > 0),
  CONSTRAINT payment_allocations_org_payment_invoice_unique UNIQUE (organization_id, payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS payment_allocations_org_invoice_idx
  ON app.payment_allocations (organization_id, invoice_id);

CREATE TABLE IF NOT EXISTS app.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  key text NOT NULL,
  operation text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT idempotency_keys_key_not_blank CHECK (char_length(trim(key)) > 0),
  CONSTRAINT idempotency_keys_operation_not_blank CHECK (char_length(trim(operation)) > 0),
  CONSTRAINT idempotency_keys_hash_not_blank CHECK (char_length(trim(request_hash)) > 0),
  CONSTRAINT idempotency_keys_org_operation_key_unique UNIQUE (organization_id, operation, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_org_created_idx
  ON app.idempotency_keys (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  event_key text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  dispatched_at timestamptz,
  CONSTRAINT outbox_events_event_key_not_blank CHECK (char_length(trim(event_key)) > 0),
  CONSTRAINT outbox_events_event_type_not_blank CHECK (char_length(trim(event_type)) > 0),
  CONSTRAINT outbox_events_org_event_key_unique UNIQUE (organization_id, event_key)
);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
  ON app.outbox_events (organization_id, created_at ASC)
  WHERE dispatched_at IS NULL;

ALTER TABLE app.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_related_invoice_fk;

ALTER TABLE app.inventory_movements
  ADD CONSTRAINT inventory_movements_related_invoice_fk
  FOREIGN KEY (related_invoice_id) REFERENCES app.invoices (id);

ALTER TABLE app.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE app.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoice_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE app.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payments FORCE ROW LEVEL SECURITY;
ALTER TABLE app.payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.payment_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.idempotency_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON app.invoices
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.invoice_lines
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.payments
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.payment_allocations
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.idempotency_keys
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

CREATE POLICY org_isolation ON app.outbox_events
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.invoices TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.invoice_lines TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.payments TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.payment_allocations TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.idempotency_keys TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.outbox_events TO app_api, app_worker;

REVOKE ALL ON app.invoices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.invoice_lines FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.payments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.payment_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.idempotency_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.outbox_events FROM PUBLIC, anon, authenticated;
