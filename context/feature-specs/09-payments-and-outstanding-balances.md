# 09 — Payments and Outstanding Balances

**Status:** Specification only — not implemented  
**Depends on:** `08-pos-billing-and-finalization`  
**Enables:** returns/refunds, dashboard collections, receipt PDFs, due reminders  
**Blocked by:** confirmation of due dates, credit sales, and whether overpayments/advances are required  

## Feature Overview & Objectives

Let staff record manually verified collections against invoices and explain each customer’s outstanding sales balance. Cash, UPI, card, and bank receipts are entered by staff. There is no payment gateway and no automatic bank confirmation.

Sales collections stay distinct from Girvi principal and interest. Refunds that reverse money are specified in spec 10; this unit posts collections and allocations.

## Scope

### In this unit

- Payment recording: cash, UPI, bank transfer, card
- Split tender and partial payments
- Later collections on unpaid invoices
- Payment references and numbered receipts
- Invoice-level allocations
- Customer sales statement (dues only)
- Daily collections grouped by method
- Idempotent payment posts
- Receipt print/PDF trigger via outbox

### Explicitly out of this unit

- Payment gateways, automatic UPI verify, bank reconciliation
- Customer advances/overpayments unless explicitly approved
- Accounting/statutory books
- Girvi repayments (spec 12)
- Offline payment queues

## Acceptance Conditions

- Every posted payment has allocations that sum to the payment amount
- Allocations cannot exceed remaining invoice due; enforced under row locks
- Concurrent allocations cannot overpay an invoice or spend the same payment twice
- Repeat post with the same idempotency key returns the original payment
- Customer sales due equals sum of finalized invoice dues after allocations and later credits
- Cached due fields, if any, are reconcilable projections
- Collections totals do not equal sales totals and must not be displayed as such
- Unconfirmed network posts never show as received

## User Flows & Interactions

### Pay at finalization

1. POS finalize (spec 08) may include initial tenders.
2. Those tenders use this unit’s payment/allocation tables inside the finalize transaction.

### Collect later

1. Staff open Payments or the invoice/customer profile.
2. They choose an unpaid invoice, amount, method, and optional reference (UPI/bank/card ref).
3. Confirmation shows customer, invoice, amount, method, and Record payment.
4. The client reuses one idempotency key for retries of that payload.
5. On success, a receipt number is issued and a receipt document job is queued.
6. The invoice due and customer statement update after server confirmation.

### Review

1. Invoice detail lists allocations and receipts.
2. Customer Sales tab lists outstanding invoices and payment history.
3. Daily collections view groups received amounts by method for a business date.

## Data Models & Schema Changes

### `payments`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` / `branch_id` | `uuid` not null | |
| `customer_id` | `uuid` not null | |
| `method` | `text` not null | `cash`, `upi`, `card`, `bank` |
| `amount_inr` | `numeric(18,2)` not null | `> 0` |
| `reference` | `text` | |
| `status` | `text` not null | `posted`, `reversed` |
| `received_business_date` | `date` not null | |
| `received_at` | `timestamptz` not null | |
| `received_by_staff_user_id` | `uuid` not null | |
| `reversed_by_payment_id` | `uuid` | spec 10 |

### `payment_allocations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `payment_id` | `uuid` not null | |
| `invoice_id` | `uuid` not null | |
| `amount_inr` | `numeric(18,2)` not null | `> 0` |

Constraint: sum(allocations for invoice) ≤ invoice grand total minus credits, under lock. Sum(allocations for payment) = payment.amount.

### `receipts`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `receipt_number` | `text` not null unique per org | |
| `payment_id` | `uuid` not null | |
| `issued_at` | `timestamptz` not null | |

### `customer_sales_balances` (optional projection)

`sales_due_inr` maintained in the same transaction as payments/invoices. Must be rebuildable from invoices − allocations − credits.

Girvi balances never live here.

## API Contracts

| Method | Path | Permission | Idempotent |
| --- | --- | --- | --- |
| `POST` | `/api/v1/payments` | `payments.write` | **required** |
| `GET` | `/api/v1/payments/:id` | `payments.write` or reports | |
| `GET` | `/api/v1/invoices/:id/payments` | billing | |
| `GET` | `/api/v1/customers/:id/sales-statement` | billing | |
| `GET` | `/api/v1/collections/daily` | billing/admin | query by business date |

Payment service:

1. Lock invoices in id order, then payment insertion.
2. Reject if amount would exceed remaining due.
3. Reject overpayment; do not create a customer credit unless policy is approved.
4. Write payment, allocations, receipt number, invoice due, audit, outbox `receipt.requested`.
5. Do not send WhatsApp inside the transaction.

## UI/UX Requirements

- Payments list/detail from free table/tabs/modal foundation
- Local receipt and confirmation content
- Amounts right-aligned with ₹ and tabular numerals
- Method shown as text, not color alone
- Daily collections labels: Cash, UPI, Card, Bank — separate from Sales
- Record payment label visible; icon-only is not enough
- Unsent collection form preserved on validation error; not queued offline

## Edge Cases & Error Handling

- Amount `0` or negative: `422`
- Allocation to a draft invoice: `422`
- Allocation to another organization’s invoice: `404`/`403` without leak
- Split tender where one method fails validation: reject the whole post
- Lost response: retry same key
- Customer with Girvi due only: sales statement shows zero sales due, not the loan
- Refunds: do not subtract here except through spec 10 linked reversals

## Open Questions

- Due dates and permitted credit sales
- Payment correction policy
- Whether advances/overpayments are essential (MVP default: reject)
- Receipt paper size

## Step-by-Step Implementation Sub-tasks

1. Migrate payments, allocations, receipts, and optional balance projection.
2. Implement locked allocation service and idempotency.
3. Hook initial tenders from invoice finalize into the same tables.
4. Build later-collection UI and daily collections view.
5. Add PostgreSQL tests: concurrent partial payments, overpay rejection, idempotent retry, sales vs Girvi isolation.
6. Queue receipt document events only after commit.

## Verification

Prove that two simultaneous collections cannot overpay. Prove collections reports do not include Girvi receipts.
