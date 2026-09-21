# 08 — POS Billing and Invoice Finalization

**Status:** Implemented  
**Depends on:** `05-barcode-tagging-and-hardware`, `06-customers-and-consent`, `07-invoice-calculation-engine`  
**Enables:** payments, documents, dashboard sales  

## Feature Overview & Objectives

Let billing staff build a barcode-based invoice, set line pricing (making/wastage/stones/discounts), review the server quote, take an optional initial payment, and finalize in one atomic transaction.

This is staff POS, not a customer cart or checkout portal. Drafts do not reserve stock. Two counters cannot sell the same article. Retrying a committed finalize cannot create a second invoice. Totals always come from the server `quoteInvoice` engine (spec 07); the page must not invent a second calculator.

## Scope

### In this unit

- Resumable invoice drafts
- Customer selection
- Scan/manual add of available articles
- Line pricing editors: making (fixed / ₹/g / % metal), wastage (none / % net), optional stone charge, line discount (₹ or %)
- Whole-invoice discount (₹ or %)
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
- Per-carat stone pricing (fixed ₹ stone charge only in MVP)
- Place-of-supply / IGST picker (MVP quotes default to intra-state GST)

## Acceptance Conditions

- Finalization locks articles in a stable order, revalidates availability and quote version, and commits all business writes together
- Failure before commit leaves no invoice, stock change, payment, or outbox row
- Repeat finalize with the same idempotency key and payload returns the original result
- Same key, different payload → rejected
- Two concurrent finalizes of one article: exactly one succeeds; the other gets `409`
- Draft scan does not mark stock sold or reserved
- Issued invoice snapshots are immutable
- Daily rate changes after finalize do not alter the invoice
- Line and invoice pricing inputs are persisted on the draft, reloaded on resume, and used for quote and finalize
- Missing metal rate or invalid pricing → quote error on the draft; finalize refused
- Connectivity failure shows retryable/unresolved; never “sale succeeded” without server confirmation
- Invoice finalization p95 target is below 2 seconds under agreed pilot load; measure later

## User Flows & Interactions

### Build a draft

1. Billing staff open Invoices/POS.
2. They select a customer (combobox), tap **Walk-in**, or **New customer** (POS-light create). Changing customer on an existing draft PATCHes `customer_id`. The dedicated scan field autofocuses when the draft is editable.
3. They scan tags in the dedicated scan field, use **Browse articles** to multi-check available stock (`GET /articles?status=available`) and **Add N to sale** in one `add_article_ids` patch, or use **Receive & add** to create a minimal available article and attach it to the draft in one request (`POST /invoices/drafts/:id/quick-articles`). Browse and scan share the same add path.
4. Available articles appear as lines. New lines apply shop making defaults for that metal+purity when configured; otherwise ₹0 fixed making. Duplicate scan or browse selection in the draft shows feedback and does not add a second line for the same unique article. Scan focus returns after successful add/remove/pricing/discount/browse/quick-receive actions (not while Pricing, Browse articles, or Receive & add is open).
5. Unavailable/sold/unknown barcodes show labeled errors (**Unknown barcode.** / **This article is sold.** / **Unavailable.**).
6. Staff can set making method + value inline on the line row and Apply (or Enter) to patch `line_pricing` and re-quote. **Pricing** remains for wastage, stones, and line discount.
7. Staff may set an invoice-level discount on the totals panel and apply it (server re-quote).
8. The client displays the server breakdown only (metal, making, wastage, stones, discount, tax, round-off, grand total). Missing-rate quote errors link to Settings Daily rates (`/settings?tab=rates`). Finalize shows an explicit disabled reason when blocked.
9. Staff may leave and resume the draft. Local Zustand/React state is unsent and must be revalidated online.

### Finalize

1. Staff review customer, lines, amounts, and optional initial tender (full, partial, or split — payment records follow spec 09 shapes even if captured here). **Pay grand total** fills the first tender amount with the server `grand_total_inr` without finalizing.
2. Confirmation uses explicit copy: Finalize invoice. Scanner Enter does not confirm.
3. The client generates one idempotency key for this attempt and reuses it on retry of the same payload.
4. The API finalizes or returns conflict/validation errors with a refreshed quote. On `STALE_QUOTE` 409, POS refetches the draft, mints a new idempotency key, shows updated totals, and re-opens confirm (does not silent-finalize).
5. On success, the invoice is completed even if PDF or WhatsApp later fails. Detail shows **New sale** → `/invoices/new` and Back to list.
6. Staff can print or wait for the PDF job (spec 13).

## Data Models & Schema Changes

### `invoices`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` / `branch_id` | `uuid` not null | |
| `invoice_number` | `text` not null when finalized | unique per org |
| `customer_id` | `uuid` not null | |
| `status` | `text` not null | `draft`, `finalized` |
| `business_date` | `date` not null | Asia/Kolkata |
| `quote_version` | `integer` not null | |
| `calculation_policy_version` | `text` not null when finalized | |
| `metal_value_inr` … `grand_total_inr` | `numeric(18,2)` | snapshot totals |
| `amount_paid_inr` / `amount_due_inr` | `numeric(18,2)` | maintained transactionally |
| `invoice_discount_input` | `jsonb` | optional whole-invoice discount input |
| `finalized_at` / `finalized_by_staff_user_id` | | |
| `row_version` | `integer` not null | |

### `invoice_lines`

Snapshot: article id, article number, barcode, description, metal, purity, weights, rate per gram, charge breakdown, line total, plus:

| Column | Type | Notes |
| --- | --- | --- |
| `pricing_input` | `jsonb` not null | making / wastage / stones / line_discount inputs for `invoice.v1` |

Do not rely on live article rows for issued invoices.

Migration: `0010_invoice_line_pricing_inputs.sql`.

### `idempotency_keys` / `outbox_events`

Unchanged from the initial POS schema (`0009`).

## API Contracts

| Method | Path | Permission | Idempotent |
| --- | --- | --- | --- |
| `POST` | `/api/v1/invoices/drafts` | `billing.write` | no |
| `GET/PATCH` | `/api/v1/invoices/drafts/:id` | `billing.write` | no |
| `POST` | `/api/v1/invoices/drafts/:id/quick-articles` | `billing.write` | no |
| `POST` | `/api/v1/invoices/quote` | `billing.write` | no |
| `POST` | `/api/v1/invoices/:id/finalize` | `billing.write` | **required** |
| `GET` | `/api/v1/invoices` | billing/admin | |
| `GET` | `/api/v1/invoices/:id` | billing/admin | |

`PATCH /invoices/drafts/:id` may include:

- `add_article_ids` / `remove_article_ids` / `customer_id`
- `line_pricing[]` — per-article making/wastage/stone/line_discount inputs
- `invoice_discount` — amount or percent, or `null` to clear

Each successful patch increments `quote_version` and re-runs the server quote.

`POST /invoices/drafts/:id/quick-articles` (POS Receive & add) in one transaction: insert a minimal `available` article with `receipt` movement (category, metal, purity, weights; optional location/HUID; no barcode), then add it to the draft and re-quote. Does not require `inventory.write`. Full Inventory → Receive remains the rich path under `inventory.write`.

Finalize transaction outline:

1. Verify membership and permission.
2. Begin transaction; set org context.
3. Lock invoice draft and articles by id ascending.
4. Revalidate each article `available`.
5. Recompute quote from persisted pricing; if it differs from client `quote_version`, abort `409` with new quote.
6. Allocate invoice number.
7. Write immutable invoice/lines, `sale` movements, status `sold`, initial payments/allocations (spec 09 tables), audit, outbox.
8. Commit.
9. Return DTO. Do not generate PDF inside the lock.

Status codes: `409` conflict/stale quote/article taken, `422` business validation, `401`/`403` as usual.

## UI/UX Requirements

Desktop POS workspace from free inputs, table, buttons, modal, and a sticky totals/payment panel. Stack on tablet. Preserve scan focus.

- Customer combobox (deferred name/phone search, active-only, Load more paging, Walk-in pinned) plus **Walk-in** shortcut and **New customer** (POS-light: name, optional phone, WhatsApp invoice consent only; requires `customers.write`)
- Changing customer / Walk-in / New customer on a draft PATCHes `customer_id` so finalize uses the selected customer
- Walk-in selection shows a gray modern Walk-in badge beside the field label
- Dedicated barcode field with autofocus/refocus while the draft is editable (paused while browse / pricing / create-customer dialogs are open)
- **Browse articles** modal beside scan: available-only checkbox list (search + Load more), multi-check up to 50, **Add N to sale** via batch `add_article_ids`; articles already on the draft are hidden; no Select all
- **Receive & add** for pieces not yet in stock (toolbar and browse modal footer): minimal category/metal/purity/weights → available article + draft line in one transaction (`billing.write`)
- Line table with weights and amounts right-aligned
- New lines pick up Settings making defaults by metal+purity when present
- Inline making method + value Apply on each draft line → `line_pricing` patch + server re-quote
- Per-line **Pricing** opens a modal for wastage, stones, and line discount (and full making edit) → server re-quote
- Invoice discount controls on the totals panel → server re-quote
- Server breakdown, not a silent local total; missing-rate banner CTA to `/settings?tab=rates`
- Explicit Finalize disabled reason near the button
- **Pay grand total** on the tender panel (does not finalize)
- Confirmation modal with customer, amount, and Finalize invoice; `STALE_QUOTE` refreshes quote and re-opens confirm
- Disabled/loading buttons complement idempotency; they do not replace it
- After success, finalized detail offers **New sale** and Back to list
- No optimistic “Paid” or “Sold” before `200` from finalize

## Edge Cases & Error Handling

- Article sold between quote and finalize: `409`, remove or replace line
- Stale quote on finalize: `STALE_QUOTE` 409; client refetches draft and reconfirm
- Lost response after commit: client retries same key and receives the original invoice
- Split tender overpaying the invoice: reject unless credit policy is approved
- Zero-line finalize: `422`
- Excessive discount / missing rate: `422` with quote error retained on the draft
- Permission lost mid-draft: save locally if safe, API finalize `403`
- Hidden tab: stop extra polling
- Do not queue finalize in IndexedDB

## Open Questions

- Whether credit sales with due dates are permitted at launch
- Due-date default if partial payment is allowed
- Document print: paper size from Settings; bilingual EN+HI (spec 13)

## Step-by-Step Implementation Sub-tasks

1. Migrate invoices, lines, drafts, idempotency, and outbox (`0009`).
2. Persist line/invoice pricing inputs (`0010`).
3. Implement draft CRUD and quote integration with pricing.
4. Implement finalize application service with locking and single transaction.
5. Increment document sequences inside that transaction.
6. Build the POS workspace: scan, pricing modal, invoice discount, list/detail.
7. Add PostgreSQL tests: concurrent double-sell, rollback, idempotent retry, live finalize with rate.
8. Seed approved `invoice.v1` and enter daily metal rates for live sales.

## Verification

- `pnpm verify:pos-billing` — RLS, draft patch, fail-closed missing rate, concurrent fail-closed, live finalize with `invoice.v1` + rate, idempotency
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck`
- Apply `0010_invoice_line_pricing_inputs.sql` on the project database
- Concurrency and idempotency tests against real PostgreSQL are mandatory. A happy-path UI sale alone is not sufficient.
