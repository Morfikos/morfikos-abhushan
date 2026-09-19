# 08 — POS Billing and Invoice Finalization

**Status:** Specification only — not implemented  
**Depends on:** `05-barcode-tagging-and-hardware`, `06-customers-and-consent`, `07-invoice-calculation-engine`  
**Enables:** payments, documents, dashboard sales  
**Blocked by:** approved calculation policy (spec 07) for live totals  

## Feature Overview & Objectives

Let billing staff build a barcode-based invoice, review the server quote, take an optional initial payment, and finalize in one atomic transaction.

This is staff POS, not a customer cart or checkout portal. Drafts do not reserve stock. Two counters cannot sell the same article. Retrying a committed finalize cannot create a second invoice.

## Scope

### In this unit

- Resumable invoice drafts
- Customer selection
- Scan/manual add of available articles
- Server quotes and stale-quote handling
- Atomic finalization: invoice snapshot, stock movements to `sold`, initial payment allocations, audit, outbox events
- Invoice numbering from sequences
- Concurrent sale protection with deterministic article locks
- Idempotency keys
- Print invoice action (PDF generation may complete asynchronously in spec 13)

### Explicitly out of this unit

- Customer cart, e-commerce checkout, or self-service
- Offline financial posting or sync
- Payment gateways / automatic UPI confirmation
- Returns (spec 10)
- Old-gold exchange
- Implementing a second calculator in the page

## Acceptance Conditions

- Finalization locks articles in a stable order, revalidates availability and quote version, and commits all business writes together
- Failure before commit leaves no invoice, stock change, payment, or outbox row
- Repeat finalize with the same idempotency key and payload returns the original result
- Same key, different payload → rejected
- Two concurrent finalizes of one article: exactly one succeeds; the other gets `409`
- Draft scan does not mark stock sold or reserved
- Issued invoice snapshots are immutable
- Daily rate changes after finalize do not alter the invoice
- Connectivity failure shows retryable/unresolved; never “sale succeeded” without server confirmation
- Invoice finalization p95 target is below 2 seconds under agreed pilot load; measure later

## User Flows & Interactions

### Build a draft

1. Billing staff open Invoices/POS.
2. They select or create a customer.
3. They focus the dedicated scan field and scan tags, or look up manually.
4. Available articles appear as lines. Duplicate scan in the draft shows feedback and does not add a second line for the same unique article.
5. Unavailable/sold/unknown barcodes show labeled errors.
6. The client requests `POST /invoices/quote` after line changes. Display the server breakdown.
7. Staff may leave and resume the draft. Local Zustand/React state is unsent and must be revalidated online.

### Finalize

1. Staff review customer, lines, amounts, and optional initial tender (full, partial, or split — payment records follow spec 09 shapes even if captured here).
2. Confirmation uses explicit copy: Finalize invoice. Scanner Enter does not confirm.
3. The client generates one idempotency key for this attempt and reuses it on retry of the same payload.
4. The API finalizes or returns conflict/validation errors with a refreshed quote.
5. On success, the invoice is completed even if PDF or WhatsApp later fails.
6. Staff can print or wait for the PDF job.

## Data Models & Schema Changes

### `invoices`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` / `branch_id` | `uuid` not null | |
| `invoice_number` | `text` not null | unique per org |
| `customer_id` | `uuid` not null | |
| `status` | `text` not null | `draft`, `finalized` |
| `business_date` | `date` not null | Asia/Kolkata |
| `quote_version` | `integer` not null | |
| `calculation_policy_version` | `text` not null | |
| `metal_value_inr` | `numeric(18,2)` | snapshot |
| `making_charges_inr` | `numeric(18,2)` | |
| `wastage_inr` | `numeric(18,2)` | |
| `stone_charges_inr` | `numeric(18,2)` | |
| `discount_inr` | `numeric(18,2)` | |
| `tax_inr` | `numeric(18,2)` | |
| `round_off_inr` | `numeric(18,2)` | |
| `grand_total_inr` | `numeric(18,2)` not null | |
| `amount_paid_inr` | `numeric(18,2)` not null default 0 | maintained transactionally |
| `amount_due_inr` | `numeric(18,2)` not null | |
| `finalized_at` | `timestamptz` | |
| `finalized_by_staff_user_id` | `uuid` | |
| `row_version` | `integer` not null | |

### `invoice_lines`

Snapshot: article id, article number, barcode, description, metal, purity, weights, rate per gram, charge breakdown, line total, policy fields needed to reprint the document. Do not rely on live article rows for issued invoices.

### `invoice_drafts`

Editable header/lines and `quote_version`. Drafts may live as `invoices.status = draft` instead of a second table if simpler. Choose one; do not dual-write.

### `idempotency_keys`

| Column | Type | Notes |
| --- | --- | --- |
| `organization_id` | `uuid` not null | |
| `key` | `text` not null | header `Idempotency-Key` |
| `operation` | `text` not null | `invoice.finalize` |
| `request_hash` | `text` not null | canonical payload hash |
| `response_status` | `integer` | |
| `response_body` | `jsonb` | DTO only |
| `created_at` | `timestamptz` | |

Unique `(organization_id, operation, key)`.

### `outbox_events`

Insert `invoice.finalized` with unique event key in the same transaction. Consumers are spec 13/14.

Indexes: invoice number, customer unpaid due dates, article barcode already exist.

## API Contracts

| Method | Path | Permission | Idempotent |
| --- | --- | --- | --- |
| `POST` | `/api/v1/invoices/drafts` | `billing.write` | no |
| `GET/PATCH` | `/api/v1/invoices/drafts/:id` | `billing.write` | no |
| `POST` | `/api/v1/invoices/quote` | `billing.write` | no |
| `POST` | `/api/v1/invoices/:id/finalize` | `billing.write` | **required** |
| `GET` | `/api/v1/invoices` | billing/admin | |
| `GET` | `/api/v1/invoices/:id` | billing/admin | |

Finalize transaction outline:

1. Verify membership and permission.
2. Begin transaction; set org context.
3. Lock invoice draft and articles by id ascending.
4. Revalidate each article `available`.
5. Recompute quote; if it differs from client `quote_version`, abort `409` with new quote.
6. Allocate invoice number.
7. Write immutable invoice/lines, `sale` movements, status `sold`, initial payments/allocations (spec 09 tables), audit, outbox.
8. Commit.
9. Return DTO. Do not generate PDF inside the lock.

Status codes: `409` conflict/stale quote/article taken, `422` business validation, `401`/`403` as usual.

## UI/UX Requirements

Desktop POS workspace from free inputs, table, buttons, and a sticky totals/payment panel. Stack on tablet. Preserve scan focus.

- Customer combobox
- Dedicated barcode field
- Line table with weights and amounts right-aligned
- Server breakdown, not a silent local total
- Confirmation modal foundation with customer, amount, method, and Finalize invoice
- Disabled/loading buttons complement idempotency; they do not replace it
- After success, show completed sale even if document/message status is pending/failed
- No optimistic “Paid” or “Sold” before `200` from finalize

## Edge Cases & Error Handling

- Article sold between quote and finalize: `409`, remove or replace line
- Lost response after commit: client retries same key and receives the original invoice
- Split tender overpaying the invoice: reject unless credit policy is approved
- Zero-line finalize: `422`
- Permission lost mid-draft: save locally if safe, API finalize `403`
- Hidden tab: stop extra polling
- Do not queue finalize in IndexedDB

## Open Questions

- Whether credit sales with due dates are permitted at launch
- Due-date default if partial payment is allowed
- Invoice paper size and bilingual invoice text

## Step-by-Step Implementation Sub-tasks

1. Migrate invoices, lines, drafts, idempotency, and outbox.
2. Implement draft CRUD and quote integration.
3. Implement finalize application service with locking and single transaction.
4. Increment document sequences inside that transaction.
5. Build the POS workspace and invoice list/detail.
6. Add PostgreSQL tests: concurrent double-sell, rollback, idempotent retry, stale quote.
7. Add e2e: scan available article, finalize, article lookup becomes sold.
8. Do not enable live finalization until spec 07 fixtures are approved.

## Verification

Concurrency and idempotency tests against real PostgreSQL are mandatory. A happy-path UI sale is not sufficient.
