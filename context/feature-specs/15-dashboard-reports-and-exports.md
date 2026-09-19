# 15 — Dashboard, Reports, and Exports

**Status:** Specification only — not implemented  
**Depends on:** inventory, invoices, payments, Girvi, notifications  
**Enables:** owner supervision, pilot reviews  
**Blocked by:** none for measure definitions; profit reporting remains out of scope  

## Feature Overview & Objectives

Give the owner a dashboard and exportable statements that reconcile to underlying records for a business-date range. Sales, collections, customer dues, Girvi principal, and interest must stay separate.

Missing data is shown as empty, not as decorative trends. This unit does not introduce a second set of books.

## Scope

### In this unit

- Period filters in `Asia/Kolkata` business dates
- Sales, invoice count, returns
- Collections by method
- Outstanding customer sales dues
- Available article counts and metal weights by category/purity
- Active Girvi: outstanding principal, accrued unpaid interest, upcoming maturities, overdue
- Girvi disbursements, principal repayments, interest receipts
- Operational attention: stock discrepancies, failed/unknown notifications
- CSV/statement exports of inventory, sales, dues, and Girvi
- Charts from public chart foundations with explicit series labels

### Explicitly out of this unit

- Profit reporting
- Statutory accounting
- Fabricated percentages or demo series
- Realtime WebSockets
- Multi-branch rollups

## Acceptance Conditions

- Each metric has a written definition against source tables
- Dashboard sales for a range equals sum of finalized invoices (net of issued credits) in that range
- Collections equals posted payments minus reversals in that range, excluding Girvi
- Girvi interest received is only interest portions of Girvi events
- Exports use the same definitions
- Color is never the only series distinction
- Reports permission is enforced; billing-limited roles see only allowed tiles
- No caching that can serve another user’s dashboard

## User Flows & Interactions

1. Owner opens Dashboard.
2. They select a date range (free date-range picker).
3. Metric summaries and tables load from the API.
4. They drill to the source list (invoices, payments, Girvi, notifications) using existing screens.
5. They export a statement. The file is generated on the API/worker and downloaded through an authorized URL or streamed response — not a public bucket.

## Data Models & Schema Changes

Prefer live aggregate queries with indexes already specified. Add reporting views if they stay reconcilable:

- `v_sales_by_business_date`
- `v_collections_by_method`
- `v_sales_dues`
- `v_inventory_available`
- `v_girvi_balances`

Do not store independent dashboard ledgers.

### `export_jobs`

Optional: id, type, filters, status, stored_object_id, requested_by. Large exports can use the worker; small CSV may stream from the API with bounds.

## API Contracts

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/reports/dashboard` | `reports.read` |
| `GET` | `/api/v1/reports/sales` | `reports.read` |
| `GET` | `/api/v1/reports/collections` | `reports.read` |
| `GET` | `/api/v1/reports/inventory` | inventory or reports |
| `GET` | `/api/v1/reports/girvi` | girvi or reports |
| `POST` | `/api/v1/exports` | `reports.read` |

All amounts as decimal strings. Bound date ranges.

Metric definitions to implement and test:

| Metric | Source |
| --- | --- |
| Sales | Sum `invoices.grand_total_inr` where finalized and `business_date` in range |
| Returns | Sum `credit_notes.amount_inr` in range |
| Collections | Sum posted sales `payments.amount_inr` minus reversals/refunds in range |
| Customer dues | Sum open `amount_due_inr` as of range end |
| Girvi disbursed | Sum disbursement events |
| Principal recovered | Sum repayment/settlement principal portions |
| Interest received | Sum interest portions only |

## UI/UX Requirements

- Original metric summaries; public `charts-base` and table
- Local headings; no paid dashboard template
- Separate tiles for Sales, Collections, Outstanding sales dues, Girvi principal, Accrued interest
- Empty states instead of fake charts
- Useful density for desktop; do not hide totals on tablet
- Export buttons with visible labels

## Edge Cases & Error Handling

- Range with no data: zeros and empty tables
- Partial role: omit unauthorized tiles; do not return the JSON either
- Export too large: `422` or async job with pending status
- Interest cannot be computed because Girvi policy is unapproved: show Unavailable with explanation, not ₹0 pretending to be calculated
- Filters must not change series colors as the only legend

## Open Questions

- Which staff roles see which tiles
- Preferred export file layout
- Whether opening balances appear as a separate dashboard line

## Step-by-Step Implementation Sub-tasks

1. Write metric SQL/views and repository functions.
2. Add dashboard and export endpoints.
3. Build dashboard UI from free charts/tables and local summaries.
4. Add reconciliation tests: seed invoices/payments/Girvi and assert tile values.
5. Wire drill-through links to existing list pages.
6. Verify no share-cache of authenticated dashboard responses.

## Verification

A seeded fixture set must make every tile match hand-computed totals. Screenshot review is not reconciliation.
