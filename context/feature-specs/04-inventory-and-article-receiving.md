# 04 — Inventory and Article Receiving

**Status:** Implemented — verified 20 September 2026  
**Depends on:** `03-shop-settings-and-organization`  
**Enables:** `05-barcode-tagging-and-hardware`, `08-pos-billing-and-finalization`, `16-opening-imports-and-pilot-readiness`  
**Blocked by:** none for receiving records; costing/profit and supplier ledgers remain out of scope  

## Feature Overview & Objectives

Give every physical jewellery article a unique shop record from receipt onward. Staff replace informal registers with traceable article identity, weights, location, photograph metadata, and movement history.

This unit records saleable inventory only. Customer-owned Girvi collateral is a different entity family (spec 11) and must never appear as available stock.

## Scope

### In this unit

- Catalogue categories
- Article create/update for receiving
- Weight fields: gross, non-metal, net metal
- Optional HUID, supplier/karigar reference, receipt date, optional acquisition cost
- Storage location
- Photograph upload metadata and authorized access (storage bytes may share spec 13; this unit at least defines ownership and validation)
- Search and filters
- Movement history for receipt and reviewed adjustments
- Physical stock count records
- Returned-article inspection gate (full return money flow is spec 10)

### Explicitly out of this unit

- Selling an article or reserving stock by draft
- Old-gold exchange, supplier payables, karigar job-work accounting
- Profit reports from acquisition cost
- Treating Girvi packets as inventory
- Claiming tags are printer-validated (spec 05)

## Acceptance Conditions

- Each article has one permanent `article_number` and will receive one permanent barcode in spec 05; receiving can create the article number now
- `net_metal_weight_grams` is consistent with gross and non-metal weights or the API rejects the row
- Status `available` is the only sellable state later used by POS
- Adjustments require permission, reason, and an audit/movement row
- Articles in `return_inspection` cannot be sold
- List/detail APIs are organization-scoped and paginated
- Acquisition cost is optional and never shown as a customer-facing price

## User Flows & Interactions

### Receive an article

1. Inventory staff open Inventory → Receive article (full page form, not a premium modal).
2. They enter category, metal, purity, and weights (and optional source/location/photo).
3. The API creates an `available` article with a `receipt` movement and allocates the next article number.
4. Barcode assignment is a separate step (spec 05).

Billing staff may also create the same kind of minimal `available`+`receipt` article from POS via **Receive & add** (`POST /invoices/drafts/:id/quick-articles` under `billing.write`) when selling a piece that was not received yet. That path does not replace full Inventory receive and does not assign a barcode in the same request.

### Search and inspect

1. Staff use search/scan and filters above a paginated table.
2. Opening a row shows identification, weights, pricing defaults, source, location, photographs, and movement history.
3. Manual lookup works without a scanner.

### Edit an article

1. Authorized staff open an unsold article and choose **Edit article** (`/inventory/:id/edit`).
2. They may change category, metal, purity, weights, HUID, supplier/karigar, location, and photograph. Article number, barcode, and receipt date stay immutable. Stones and acquisition cost stay receive-only (not on PATCH).
3. Photograph on detail: if a photo already exists, show the image only (no dropzone). First photo can be uploaded on detail when missing. On edit, show **Replace photograph** to reveal the dropzone; **Cancel replace** restores the current image. Save uploads the staged file.
4. Save calls `PATCH /api/v1/articles/:id` with `row_version`. A new photograph uses the spec 13 grant → upload → confirm path and **replaces** the previous `article_files` row (one current photo).
5. After save, staff may **Print tag** (no barcode yet) or **Reprint tag** (same barcode, reason required). Skip returns to detail. Sold articles have no Edit control; identity/weights stay locked (API rejects those patches).

### Adjust or count

1. Authorized staff record a stock count or an adjustment with a reason.
2. The article status may become `unavailable` or remain `available` according to the adjustment type.
3. History remains append-only.

### Return inspection (inventory side)

1. When spec 10 marks an article `return_inspection`, it does not reappear as available.
2. After inspection, authorized staff release it back to `available` or keep it unavailable. This release is a stock movement, not a sale.

## Data Models & Schema Changes

### `catalogue_categories`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `name` | `text` not null | |
| `default_metal` | `text` | |
| `is_active` | `boolean` not null default true | |

### `storage_locations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `branch_id` | `uuid` not null | |
| `name` | `text` not null | tray/safe/counter |

### `articles`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `branch_id` | `uuid` not null | |
| `article_number` | `text` not null | unique per org |
| `barcode` | `text` | unique per org; assigned in spec 05 if not yet printed |
| `category_id` | `uuid` not null | |
| `metal` | `text` not null | |
| `purity` | `text` not null | |
| `gross_weight_grams` | `numeric(14,4)` not null | `> 0` |
| `non_metal_weight_grams` | `numeric(14,4)` not null default 0 | `>= 0` |
| `net_metal_weight_grams` | `numeric(14,4)` not null | must equal gross − non-metal |
| `huid` | `text` | |
| `supplier_ref` | `text` | reference only, not a ledger |
| `karigar_ref` | `text` | reference only, not a ledger |
| `receipt_business_date` | `date` not null | |
| `acquisition_cost_inr` | `numeric(18,2)` | optional, internal |
| `location_id` | `uuid` | |
| `status` | `text` not null | see below |
| `row_version` | `integer` not null default 1 | optimistic concurrency for edits |
| `created_at` / `updated_at` | `timestamptz` | |

Statuses: `available`, `sold`, `return_inspection`, `unavailable`.

Do not add `reserved` from draft scans. Scanning or saving a draft does not reserve stock.

### `article_stones`

Optional child rows: description, weight, amount if the shop later confirms stone handling. Until invoice examples are approved, store descriptive fields only and do not invent pricing.

### `article_files`

Object key, checksum, content type, ownership (`article_id`). No public URLs.

### `inventory_movements`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `article_id` | `uuid` not null | |
| `movement_type` | `text` not null | `receipt`, `sale`, `return_in`, `inspection_release`, `adjustment` |
| `from_status` / `to_status` | `text` | |
| `reason` | `text` | required for adjustment |
| `actor_staff_user_id` | `uuid` not null | |
| `related_invoice_id` | `uuid` | later |
| `related_return_id` | `uuid` | later |
| `created_at` | `timestamptz` not null | |

### `stock_counts`

Header + lines for a reviewed physical count. Discrepancies produce adjustments, not silent status flips.

Indexes: `(organization_id, barcode)`, `(organization_id, article_number)`, `(organization_id, status, category_id)`, weight-range queries as needed.

## API Contracts

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/articles` | `inventory.read` |
| `GET` | `/api/v1/articles/:id` | `inventory.read` |
| `GET` | `/api/v1/articles/lookup?barcode=` | `inventory.read` or billing read |
| `POST` | `/api/v1/articles` | `inventory.write` |
| `POST` | `/api/v1/invoices/drafts/:id/quick-articles` | `billing.write` — POS minimal receive into draft (same `available`+`receipt` article; see spec 08) |
| `PATCH` | `/api/v1/articles/:id` | `inventory.write` |
| `DELETE` | `/api/v1/articles/:id` | `inventory.write` — mistaken receipts only |
| `POST` | `/api/v1/articles/bulk-delete` | `inventory.write` — mistaken receipts only; returns deleted and skipped |
| `POST` | `/api/v1/articles/:id/adjustments` | `inventory.write` + reason |
| `POST` | `/api/v1/articles/:id/inspection-release` | `inventory.write` |
| `GET` | `/api/v1/articles/:id/movements` | `inventory.read` |
| `POST` | `/api/v1/stock-counts` | `inventory.write` |

Hard-delete is limited to mistaken receipts: status `available`, movements are only `receipt`, and the article is not referenced by a stock-count line. Sold, under-review, unavailable, adjusted, and counted articles cannot be deleted; staff use adjustments or inspection release instead. Deletes write an `article.delete` audit event. `404` for missing articles in-scope; do not leak other-organization existence. `409` on stale `row_version` or `ARTICLE_NOT_DELETABLE`. `422` on invalid weights.

## UI/UX Requirements

- Search/scan + local filter row above `table/table.tsx` and shared list-table footer (`Page X of Y`, rows-per-page select, Previous/Next)
- Status badges with labels: Available, Sold, Under review, Unavailable
- Row and bulk delete for `inventory.write`, always behind a confirmation modal; disable delete when the article is not a mistaken receipt
- Article detail is a full page grouped as identification, weights, source, location, photographs, history
- Unsold articles with `inventory.write` offer **Edit article** (full page, not a modal)
- Photograph on detail and edit uses private signed URLs; re-upload replaces the current file
- Detail hides the dropzone when a photograph already exists; first upload remains on detail when missing
- Edit uses **Replace photograph** / **Cancel replace** before showing the dropzone; upload still commits on save
- After edit save, offer Print tag or Reprint tag; never auto-print
- Weights right-aligned with g units and tabular numerals
- File upload uses public `file-upload-base.tsx`
- Empty state uses free empty-state foundation
- Loading uses free loading indicator
- Do not use a marketing card as the tag preview; preview arrives in spec 05

## Edge Cases & Error Handling

- Net weight mismatch: reject, do not auto-correct silently
- Duplicate article number: `409`
- Edit of a `sold` article’s identity/weights: reject; corrections use return/adjustment workflows
- Photo too large or wrong type: `400`/`422` with field error
- Network loss while saving: show retryable failure; do not mark received
- Draft POS elsewhere must not change availability
- Girvi collateral lookup must not return these rows as sellable

## Open Questions

- Required vs optional HUID by category
- Whether acquisition cost is collected at launch
- Location naming used on the shop floor
- Opening stock import format (spec 16)

## Step-by-Step Implementation Sub-tasks

1. Migrate categories, locations, articles, stones, files, movements, and counts.
2. Implement weight constraints and unique identifiers.
3. Build article application services and DTOs (never raw rows).
4. Add lookup-by-barcode used later by POS and scanners.
5. Build inventory list/detail/receive/adjust screens.
6. Write movement + audit on receipt and adjustment.
7. Add PostgreSQL tests for constraints, status transitions, and org isolation.
8. Add a focused e2e path: receive → appear in search → open detail.

## Verification

Verify unavailable and inspection states cannot be returned as sellable by lookup. Do not treat a UI list as proof of stock safety.
