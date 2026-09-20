-- Spec 10: linked returns, credit notes, and compensating refund/reversal
-- payments. Finalized invoices are never updated in place for amounts, lines,
-- or customer snapshots. Credit reduces due; refunds are a separate cash
-- outflow. Returned articles move to return_inspection, not available.
-- Browser roles stay without grants.

ALTER TABLE app.document_sequences
  DROP CONSTRAINT IF EXISTS document_sequences_type_check;

ALTER TABLE app.document_sequences
  ADD CONSTRAINT document_sequences_type_check
  CHECK (document_type IN ('invoice', 'receipt', 'girvi_account', 'article', 'credit_note', 'refund'));

INSERT INTO app.document_sequences (organization_id, branch_id, document_type, prefix, padding, next_value)
SELECT organization_id, branch_id, 'credit_note', 'CN', 5, 1
FROM app.document_sequences
WHERE document_type = 'invoice'
ON CONFLICT (organization_id, branch_id, document_type) DO NOTHING;

INSERT INTO app.document_sequences (organization_id, branch_id, document_type, prefix, padding, next_value)
SELECT organization_id, branch_id, 'refund', 'RFD', 5, 1
FROM app.document_sequences
WHERE document_type = 'invoice'
ON CONFLICT (organization_id, branch_id, document_type) DO NOTHING;

ALTER TABLE app.payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'collection';

ALTER TABLE app.payments
  ADD COLUMN IF NOT EXISTS reverses_payment_id uuid REFERENCES app.payments (id);

ALTER TABLE app.payments
  DROP CONSTRAINT IF EXISTS payments_kind_check;

ALTER TABLE app.payments
  ADD CONSTRAINT payments_kind_check CHECK (kind IN ('collection', 'refund', 'reversal'));

ALTER TABLE app.payments
  DROP CONSTRAINT IF EXISTS payments_reverses_kind_check;

ALTER TABLE app.payments
  ADD CONSTRAINT payments_reverses_kind_check CHECK (
    (kind = 'collection' AND reverses_payment_id IS NULL)
    OR (kind IN ('refund', 'reversal') AND reverses_payment_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_reversal_per_original
  ON app.payments (organization_id, reverses_payment_id)
  WHERE kind = 'reversal' AND reverses_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_org_reverses_idx
  ON app.payments (organization_id, reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app.invoice_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  invoice_id uuid NOT NULL REFERENCES app.invoices (id),
  article_id uuid NOT NULL REFERENCES app.articles (id),
  invoice_line_id uuid NOT NULL REFERENCES app.invoice_lines (id),
  status text NOT NULL,
  reason text NOT NULL,
  accepted_by_staff_user_id uuid NOT NULL REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT invoice_returns_status_check CHECK (status IN ('accepted', 'rejected')),
  CONSTRAINT invoice_returns_reason_not_blank CHECK (char_length(trim(reason)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_returns_accepted_line_unique
  ON app.invoice_returns (organization_id, invoice_line_id)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS invoice_returns_org_invoice_idx
  ON app.invoice_returns (organization_id, invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  branch_id uuid NOT NULL REFERENCES app.branches (id),
  credit_note_number text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES app.invoices (id),
  return_id uuid REFERENCES app.invoice_returns (id),
  amount_inr numeric(18,2) NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT credit_notes_number_not_blank CHECK (char_length(trim(credit_note_number)) > 0),
  CONSTRAINT credit_notes_amount_positive CHECK (amount_inr > 0),
  CONSTRAINT credit_notes_org_number_unique UNIQUE (organization_id, credit_note_number),
  CONSTRAINT credit_notes_org_return_unique UNIQUE (organization_id, return_id)
);

CREATE INDEX IF NOT EXISTS credit_notes_org_invoice_idx
  ON app.credit_notes (organization_id, invoice_id, issued_at DESC);

ALTER TABLE app.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_related_return_fk;

ALTER TABLE app.inventory_movements
  ADD CONSTRAINT inventory_movements_related_return_fk
  FOREIGN KEY (related_return_id) REFERENCES app.invoice_returns (id);

ALTER TABLE app.invoice_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoice_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE app.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.credit_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON app.invoice_returns;
CREATE POLICY org_isolation ON app.invoice_returns
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

DROP POLICY IF EXISTS org_isolation ON app.credit_notes;
CREATE POLICY org_isolation ON app.credit_notes
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.invoice_returns TO app_api, app_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.credit_notes TO app_api, app_worker;

REVOKE ALL ON app.invoice_returns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.credit_notes FROM PUBLIC, anon, authenticated;
