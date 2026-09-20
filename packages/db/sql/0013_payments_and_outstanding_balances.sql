-- Spec 09: manually verified sales collections. Payment and allocation tables
-- already exist from 0009; this migration adds numbered receipts, collection
-- lookup indexes, and the allocation guard that the locked service relies on.
-- Sales collections stay separate from Girvi principal and interest: nothing
-- here references Girvi tables. Browser roles stay without grants.

CREATE TABLE IF NOT EXISTS app.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  receipt_number text NOT NULL,
  payment_id uuid NOT NULL REFERENCES app.payments (id),
  issued_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT receipts_number_not_blank CHECK (char_length(trim(receipt_number)) > 0),
  CONSTRAINT receipts_org_number_unique UNIQUE (organization_id, receipt_number),
  CONSTRAINT receipts_org_payment_unique UNIQUE (organization_id, payment_id)
);

CREATE INDEX IF NOT EXISTS receipts_org_issued_idx
  ON app.receipts (organization_id, issued_at DESC);

-- Daily collections group posted receipts by method for one business date.
CREATE INDEX IF NOT EXISTS payments_org_date_status_idx
  ON app.payments (organization_id, received_business_date, status, method);

-- Invoice detail and customer statements read allocations by payment.
CREATE INDEX IF NOT EXISTS payment_allocations_org_payment_idx
  ON app.payment_allocations (organization_id, payment_id);

ALTER TABLE app.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.receipts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON app.receipts;

CREATE POLICY org_isolation ON app.receipts
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.receipts TO app_api, app_worker;

REVOKE ALL ON app.receipts FROM PUBLIC, anon, authenticated;
