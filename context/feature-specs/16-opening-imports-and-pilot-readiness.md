# 16 — Opening Imports and Pilot Readiness

**Status:** Specification only — not implemented  
**Depends on:** all prior feature specs for the objects being imported or launched  
**Enables:** supervised launch  
**Blocked by:** opening-data samples, hosting/backup choices, hardware drill, recovery targets  

## Feature Overview & Objectives

Load reviewed opening stock, sales dues, and active Girvi accounts, then prove the deployment can be operated and restored. The shop already has registers; the MVP must not invent balances.

This unit also records operational readiness that is not a product screen: independent backups, restore drill, worker/quota monitoring, and hardware checks. Offline synchronization is out of scope. Connectivity failures stay retryable and unresolved.

## Scope

### In this unit

- Reviewed import batches for articles, customer sales dues, and Girvi opening balances/accrual dates
- Totals review before commit
- Pilot checklist: authz/concurrency tests, e2e flows, scanner/printer, backups, restore, monitoring, staff training
- Health/readiness already present is wired to monitoring
- Runbooks in `docs/` for backup and recovery
- Explicit non-goals for cart/checkout and offline sync so they are not implemented later “by example”

### Explicitly out of this unit

- Unreviewed bulk overwrites of live financial history
- Mobile app
- Multi-branch cutover
- Promising zero-cost or automatic Supabase Free backups
- Offline posting, conflict replay, or service-worker financial queues
- Customer cart and checkout
- Payment gateways

## Acceptance Conditions

- Imports run as reviewed batches with actor, timestamp, and before/after totals
- Opening Girvi interest uses owner-provided accrual dates; the engine does not invent them
- Imported articles receive unique numbers/barcodes and `receipt` or `opening` movements
- Opening sales dues create equivalent finalized opening invoices or explicit opening-balance records that reports can explain
- A failed import batch rolls back
- Restore drill recovers database rows **and** private object bytes into a separate environment
- Hardware validation is recorded pass/fail independently from unit tests
- Progress tracker does not mark launch complete if the restore drill or hardware drill was skipped

## User Flows & Interactions

### Import

1. Owner/admin opens Settings → Opening import (or a restricted tools page).
2. They upload a validated file (format TBD with the shop) or enter a controlled template.
3. The API parses into a `staging` batch and returns counts and rupee/weight totals.
4. A reviewer confirms Commit import.
5. Commit is idempotent per batch id. Success writes business rows and an audit event.

### Pilot launch

1. Operators complete the checklist below.
2. Staff train on receive → tag → sell → collect → Girvi open → repay → release.
3. Monitoring watches DB/storage quotas, worker backlog, and failed notifications.
4. First live day is supervised.

## Data Models & Schema Changes

### `import_batches`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `import_type` | `text` not null | `articles`, `sales_dues`, `girvi_opening` |
| `status` | `text` not null | `staged`, `committed`, `failed`, `rejected` |
| `source_filename` | `text` | |
| `row_count` | `integer` | |
| `control_totals` | `jsonb` | weights/amounts |
| `reviewed_by_staff_user_id` | `uuid` | |
| `committed_at` | `timestamptz` | |
| `idempotency_key` | `text` unique per org | |

### `import_batch_rows`

Raw normalized row, validation errors, resulting entity id after commit.

Opening Girvi rows must include: customer, principal, start date, accrual date, packet ids, terms snapshot fields that are approved.

Opening sales due rows must include: customer, amount due, as-of date, optional legacy invoice reference.

## API Contracts

| Method | Path | Permission | Idempotent |
| --- | --- | --- | --- |
| `POST` | `/api/v1/imports` | owner/admin | upload/parse |
| `GET` | `/api/v1/imports/:id` | owner/admin | |
| `POST` | `/api/v1/imports/:id/commit` | owner/admin | **required** |
| `GET` | `/health/ready` | none | includes worker/db |

No ad hoc SQL maintenance scripts for finalized money or stock.

## UI/UX Requirements

- Restricted original tools page: free uploader, table of staged rows, control totals, Commit import confirmation
- Show validation errors per row
- Do not use a marketing import wizard
- Pilot checklist can live in `docs/` rather than a customer-facing UI

## Edge Cases & Error Handling

- Partial file: stage with row errors; commit blocked until resolved or rejected rows dropped explicitly
- Duplicate opening article barcode: reject row
- Opening Girvi without packet: reject
- Re-commit same batch: return original result
- Connectivity loss on commit: retry same key; never show imported without server confirm
- Database restore without storage restore: runbook must call this incomplete
- Host down: reminders stop; monitoring must alert

## Open Questions

- Exact import file format
- Who reviews totals
- Existing stock, dues, packets, opening interest, accrual dates
- Always-on host, domain, SMTP, backup destination, monitoring destination
- Acceptable downtime and data-loss targets
- Repository/deployment owners

## Pilot checklist

Copy into `progress-tracker.md` when execution starts; do not tick from this spec alone.

1. Authorization and concurrency tests green on real PostgreSQL
2. E2E: receive → tag → scan → finalize → collect → return/inspect → Girvi activate → repay → settle → release
3. Scanner/printer physical validation
4. Independent encrypted DB export + object-file backup scheduled
5. Restore drill into a separate environment
6. Quota, backup freshness, and worker backlog monitoring
7. WhatsApp templates accepted if messaging is in the launch cut
8. Calculation fixtures approved
9. Staff training and supervised first day

## Out of scope reminder (do not implement)

| Request that may appear later | Decision |
| --- | --- |
| Customer cart and checkout | Out of MVP; staff POS is spec 08 |
| Offline synchronization | Out of MVP; show retryable/unresolved online states only |
| Payment gateways | Deferred |
| Redis / realtime | Deferred |
| Multi-business SaaS | Deferred |

## Step-by-Step Implementation Sub-tasks

1. Agree import columns with the shop; do not invent balances.
2. Implement staging, validation, and transactional commit.
3. Add opening movement/event types that reports can exclude or label as Opening.
4. Write backup/restore runbooks.
5. Wire health metrics to the chosen monitor when hosting is chosen.
6. Execute hardware and restore drills; record evidence in the tracker.
7. Only then consider the MVP implementation sequence complete.

## Verification

An import demo with synthetic rows is not a launch. Opening totals must be reviewer-approved. A restore drill that only reloads Postgres is a failed drill if files are required.
