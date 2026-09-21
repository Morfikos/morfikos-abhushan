-- Spec 15: reconstruct customer sales dues as of a business date, and ignore
-- non-posted refunds/reversals in collections.
--
-- Dues are not a second ledger. The function reapplies the same identity as
-- syncInvoicePaidFromAllocations, with credits, collections, refunds, and
-- reversals included only when their Kolkata business date is on or before
-- p_as_of. v_sales_dues stays the live open-invoice snapshot.

CREATE OR REPLACE FUNCTION app.sales_dues_as_of(p_organization_id uuid, p_as_of date)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  business_date date,
  customer_id uuid,
  customer_display_name text,
  grand_total_inr numeric(18, 2),
  amount_paid_inr numeric(18, 2),
  amount_due_inr numeric(18, 2)
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    i.id AS invoice_id,
    i.invoice_number,
    i.business_date,
    i.customer_id,
    c.display_name AS customer_display_name,
    i.grand_total_inr,
    GREATEST(0, COALESCE(collected.net_collected_inr, 0))::numeric(18, 2) AS amount_paid_inr,
    GREATEST(
      0,
      i.grand_total_inr
        - COALESCE(credited.credits_inr, 0)
        - GREATEST(0, COALESCE(collected.net_collected_inr, 0))
    )::numeric(18, 2) AS amount_due_inr
  FROM app.invoices i
  JOIN app.customers c
    ON c.id = i.customer_id
   AND c.organization_id = i.organization_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(cn.amount_inr), 0)::numeric(18, 2) AS credits_inr
    FROM app.credit_notes cn
    WHERE cn.organization_id = i.organization_id
      AND cn.invoice_id = i.id
      AND (timezone('Asia/Kolkata', cn.issued_at))::date <= p_as_of
  ) credited ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(
      CASE
        WHEN p.kind = 'collection'
          AND p.received_business_date <= p_as_of
          AND NOT EXISTS (
            SELECT 1
            FROM app.payments rev
            WHERE rev.organization_id = p.organization_id
              AND rev.reverses_payment_id = p.id
              AND rev.kind = 'reversal'
              AND rev.status = 'posted'
              AND rev.received_business_date <= p_as_of
          )
        THEN pa.amount_inr
        WHEN p.kind = 'refund'
          AND p.status = 'posted'
          AND p.received_business_date <= p_as_of
        THEN -pa.amount_inr
        ELSE 0
      END
    ), 0)::numeric(18, 2) AS net_collected_inr
    FROM app.payment_allocations pa
    JOIN app.payments p
      ON p.id = pa.payment_id
     AND p.organization_id = pa.organization_id
    WHERE pa.organization_id = i.organization_id
      AND pa.invoice_id = i.id
  ) collected ON true
  WHERE i.organization_id = p_organization_id
    AND i.status = 'finalized'
    AND i.business_date <= p_as_of
    AND i.finalized_at IS NOT NULL
    AND (timezone('Asia/Kolkata', i.finalized_at))::date <= p_as_of
    AND GREATEST(
      0,
      i.grand_total_inr
        - COALESCE(credited.credits_inr, 0)
        - GREATEST(0, COALESCE(collected.net_collected_inr, 0))
    ) > 0
$$;

REVOKE ALL ON FUNCTION app.sales_dues_as_of(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.sales_dues_as_of(uuid, date) TO app_api, app_worker;

CREATE OR REPLACE VIEW app.v_collections_by_method AS
SELECT
  p.organization_id,
  p.received_business_date,
  p.method,
  sum(
    CASE
      WHEN p.kind = 'collection' AND p.status = 'posted' THEN p.amount_inr
      WHEN p.kind IN ('refund', 'reversal') AND p.status = 'posted' THEN -p.amount_inr
      ELSE 0
    END
  )::numeric(18, 2) AS net_collected_inr,
  count(*) FILTER (WHERE p.kind = 'collection' AND p.status = 'posted')::bigint AS collection_count,
  count(*) FILTER (
    WHERE p.kind IN ('refund', 'reversal') AND p.status = 'posted'
  )::bigint AS outflow_count
FROM app.payments p
GROUP BY p.organization_id, p.received_business_date, p.method;
