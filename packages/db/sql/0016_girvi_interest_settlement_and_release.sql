-- Spec 12: Girvi interest, repayment allocation, settlement, and physical release.
-- Calculation methods live in app.girvi_calculation_policies and must be 'approved'
-- before any payoff API returns a number. Financial settlement and packet handover
-- are separate rows with separate permissions. Released collateral never becomes
-- saleable inventory. Browser anon/authenticated stay without grants.

CREATE TABLE IF NOT EXISTS app.girvi_calculation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  -- Fields stay NULL until the owner confirms the rule. An approved policy must have all of them.
  rate_period text,
  interest_method text,
  day_count_convention text,
  minimum_period text,
  grace_period text,
  extra_charges text,
  allocation_order text,
  principal_reduction_rule text,
  rounding_mode text,
  rounding_scale integer,
  backdating_policy text,
  approved_at timestamptz,
  approved_by_staff_user_id uuid REFERENCES app.staff_users (id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT girvi_calculation_policies_version_not_blank CHECK (char_length(trim(version)) > 0),
  CONSTRAINT girvi_calculation_policies_status_check CHECK (status IN ('draft', 'approved', 'retired')),
  CONSTRAINT girvi_calculation_policies_rounding_scale_check CHECK (
    rounding_scale IS NULL OR (rounding_scale >= 0 AND rounding_scale <= 6)
  ),
  CONSTRAINT girvi_calculation_policies_org_version_unique UNIQUE (organization_id, version),
  CONSTRAINT girvi_calculation_policies_approved_complete CHECK (
    status <> 'approved'
    OR (
      rate_period IS NOT NULL
      AND interest_method IS NOT NULL
      AND day_count_convention IS NOT NULL
      AND minimum_period IS NOT NULL
      AND grace_period IS NOT NULL
      AND extra_charges IS NOT NULL
      AND allocation_order IS NOT NULL
      AND principal_reduction_rule IS NOT NULL
      AND rounding_mode IS NOT NULL
      AND rounding_scale IS NOT NULL
      AND backdating_policy IS NOT NULL
      AND approved_at IS NOT NULL
      AND approved_by_staff_user_id IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS girvi_calculation_policies_org_status_idx
  ON app.girvi_calculation_policies (organization_id, status);

-- Balance projections, rebuildable from app.girvi_financial_events at any time.
ALTER TABLE app.girvi_accounts
  ADD COLUMN IF NOT EXISTS principal_outstanding_inr numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_outstanding_inr numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz,
  ADD COLUMN IF NOT EXISTS settled_by_staff_user_id uuid REFERENCES app.staff_users (id),
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS released_by_staff_user_id uuid REFERENCES app.staff_users (id);

ALTER TABLE app.girvi_accounts
  DROP CONSTRAINT IF EXISTS girvi_accounts_outstanding_non_negative;
ALTER TABLE app.girvi_accounts
  ADD CONSTRAINT girvi_accounts_outstanding_non_negative CHECK (
    principal_outstanding_inr >= 0 AND interest_outstanding_inr >= 0
  );

-- Settlement and release are different events; a settled account keeps its packets.
ALTER TABLE app.girvi_accounts
  DROP CONSTRAINT IF EXISTS girvi_accounts_release_pair;
ALTER TABLE app.girvi_accounts
  ADD CONSTRAINT girvi_accounts_release_pair CHECK (
    (status = 'released' AND released_at IS NOT NULL AND released_by_staff_user_id IS NOT NULL)
    OR (status <> 'released' AND released_at IS NULL AND released_by_staff_user_id IS NULL)
  );

-- Repayment, settlement, waiver, and imported opening positions join disbursement.
ALTER TABLE app.girvi_financial_events
  DROP CONSTRAINT IF EXISTS girvi_financial_events_type_check;
ALTER TABLE app.girvi_financial_events
  ADD CONSTRAINT girvi_financial_events_type_check CHECK (
    event_type IN (
      'disbursement',
      'opening_balance',
      'interest_accrual',
      'interest_recognized',
      'repayment',
      'settlement',
      'waiver'
    )
  );

ALTER TABLE app.girvi_financial_events
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS notes text,
  -- Deterministic posting order for several events on the same business date.
  ADD COLUMN IF NOT EXISTS posting_sequence integer NOT NULL DEFAULT 1;

ALTER TABLE app.girvi_financial_events
  DROP CONSTRAINT IF EXISTS girvi_financial_events_method_check;
ALTER TABLE app.girvi_financial_events
  ADD CONSTRAINT girvi_financial_events_method_check CHECK (
    method IS NULL OR method IN ('cash', 'upi', 'card', 'bank')
  );

ALTER TABLE app.girvi_financial_events
  DROP CONSTRAINT IF EXISTS girvi_financial_events_posting_sequence_positive;
ALTER TABLE app.girvi_financial_events
  ADD CONSTRAINT girvi_financial_events_posting_sequence_positive CHECK (posting_sequence >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS girvi_financial_events_posting_order_unique
  ON app.girvi_financial_events (
    organization_id, girvi_account_id, effective_business_date, posting_sequence
  );

CREATE TABLE IF NOT EXISTS app.girvi_release_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES app.organizations (id),
  girvi_account_id uuid NOT NULL REFERENCES app.girvi_accounts (id) ON DELETE CASCADE,
  -- Required unless the balance was cleared through an authorized waiver.
  settlement_event_id uuid REFERENCES app.girvi_financial_events (id),
  packet_numbers_verified text[] NOT NULL,
  staff_acknowledged_by uuid NOT NULL REFERENCES app.staff_users (id),
  customer_acknowledged boolean NOT NULL,
  recipient_name text NOT NULL,
  waiver_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT girvi_release_events_packets_present CHECK (array_length(packet_numbers_verified, 1) >= 1),
  CONSTRAINT girvi_release_events_recipient_not_blank CHECK (char_length(trim(recipient_name)) > 0),
  CONSTRAINT girvi_release_events_acknowledged CHECK (customer_acknowledged),
  CONSTRAINT girvi_release_events_basis CHECK (
    settlement_event_id IS NOT NULL OR waiver_reason IS NOT NULL
  ),
  -- One physical handover per account; a retried request must not release twice.
  CONSTRAINT girvi_release_events_account_unique UNIQUE (organization_id, girvi_account_id)
);

CREATE INDEX IF NOT EXISTS girvi_release_events_account_idx
  ON app.girvi_release_events (organization_id, girvi_account_id, created_at DESC);

ALTER TABLE app.girvi_calculation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_calculation_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_release_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.girvi_release_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON app.girvi_calculation_policies;
CREATE POLICY org_isolation ON app.girvi_calculation_policies
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

DROP POLICY IF EXISTS org_isolation ON app.girvi_release_events;
CREATE POLICY org_isolation ON app.girvi_release_events
  FOR ALL TO app_api, app_worker
  USING (app.org_isolation_policy(organization_id))
  WITH CHECK (app.org_isolation_policy(organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON app.girvi_calculation_policies TO app_api, app_worker;
GRANT SELECT, INSERT ON app.girvi_release_events TO app_api;
GRANT SELECT ON app.girvi_release_events TO app_worker;

REVOKE ALL ON app.girvi_calculation_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app.girvi_release_events FROM PUBLIC, anon, authenticated;
