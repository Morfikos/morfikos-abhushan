# 12 — Girvi Interest, Settlement, and Release

**Status:** Specification only — not implemented  
**Depends on:** `11-girvi-accounts-and-collateral`, `07` domain patterns  
**Enables:** Girvi reminders, dashboard Girvi metrics  
**Blocked by:** owner-approved Girvi calculation examples  

## Feature Overview & Objectives

Calculate interest from frozen terms and effective-dated principal, record repayments against principal and interest separately, settle the financial balance, and only then allow physical release.

Reminders must not create interest. Unsupported backdating is rejected. Settlement and packet handover are different events with different permissions.

## Scope

### In this unit

- Versioned Girvi calculation in `packages/domain`
- Statements: outstanding principal, accrued unpaid interest, principal recovered, interest received
- Partial repayment allocation
- Settlement quote and settlement post
- Physical release with packet verification, `girvi.release` permission, and acknowledgment
- Concurrent repayment protection
- Idempotency for repay, settle, release

### Explicitly out of this unit

- Top-ups, renewals, partial collateral release, auction
- Additional interest methods beyond the one confirmed MVP method
- Creating charges when a reminder job runs
- Automatic release on settlement without the release action
- Offline repayments

## Acceptance Conditions

- Interest uses decimal arithmetic, explicit period, and business-date rules in `Asia/Kolkata`
- Calendar days are not milliseconds/86400000
- Allocation order is the approved order; if unapproved, the operation is blocked
- Repayment locks the account and writes financial events; reminder jobs never write interest
- Settlement requires calculated payoff; unsupported backdating → `422`
- Release requires cleared balance or recorded authorized waiver, packet check, permission, and acknowledgment
- After settlement without release, status is `settled` and collateral remains `in_custody`
- After release, collateral is `released` and still not inventory
- Concurrent repayments cannot allocate the same funds twice

## User Flows & Interactions

### Statement

1. Staff open an active account Statement tab.
2. The API calculates from terms + events as of a business date.
3. Principal and interest are labeled separately.

### Record repayment

1. Staff enter amount, method, and business date (default today).
2. Confirmation: Record repayment, showing proposed principal vs interest split from the server.
3. Client sends idempotency key.
4. API locks account, allocates, writes events, receipt-like acknowledgment, audit, outbox.

### Settle

1. Staff request a settlement quote for a business date.
2. They collect the payoff (or record an authorized waiver).
3. Status becomes `settled`. Packets stay in custody.

### Release

1. Staff with `girvi.release` start Release collateral.
2. They verify packet numbers, collect staff and customer acknowledgment.
3. Confirmation uses Release collateral, not a generic OK.
4. Custody event `released` is written. Account status `released`.

## Data Models & Schema Changes

### `girvi_calculation_policies`

Analogous to invoice policies. `status = approved` required for live use. Fields only populated when confirmed: rate period, simple/compound, day count, minimum period, allocation order, rounding, principal-reduction effective date rule.

### Additional `girvi_financial_events` types

`repayment`, `interest_recognized` (only if the approved method requires posting, not from reminders), `settlement`, `waiver`.

Each event: effective business date, principal portion, interest portion, unique event key, actor.

### `girvi_release_events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `girvi_account_id` | `uuid` not null | |
| `settlement_event_id` | `uuid` | required unless waiver path |
| `packet_numbers_verified` | `text[]` not null | |
| `staff_acknowledged_by` | `uuid` not null | |
| `customer_acknowledged` | `boolean` not null | |
| `waiver_reason` | `text` | required if balance not cleared |
| `created_at` | `timestamptz` not null | |

### Projections

Optional `principal_outstanding_inr` and `interest_outstanding_inr` updated in the same transaction; rebuildable from events.

## API Contracts

| Method | Path | Permission | Idempotent |
| --- | --- | --- | --- |
| `GET` | `/api/v1/girvi/accounts/:id/statement` | `girvi.write` or read | as-of date query |
| `POST` | `/api/v1/girvi/accounts/:id/repayments` | `girvi.write` | **required** |
| `POST` | `/api/v1/girvi/accounts/:id/settlement-quote` | `girvi.write` | |
| `POST` | `/api/v1/girvi/accounts/:id/settle` | `girvi.write` | **required** |
| `POST` | `/api/v1/girvi/accounts/:id/release` | `girvi.release` | **required** |

Thin handlers; all math in domain; orchestration in application.

## UI/UX Requirements

- Statement columns right-aligned, explicit Principal / Interest labels
- Record repayment and Release collateral visible text
- Settled-but-in-custody vs Released are different badges with words
- Never imply overdue → stock
- Date picker for as-of quotes; reject dates the policy forbids with a readable error
- Payments tab lists principal vs interest portions

## Edge Cases & Error Handling

- Unapproved method: all payoff APIs return `CALCULATION_RULE_UNSUPPORTED`
- Backdated repayment that would rewrite later events: reject
- Overpayment of payoff: reject (same credit policy as sales)
- Release while principal or interest remains and no waiver: `422`
- Waiver without owner/admin: `403`
- Reminder worker calling domain interest: read-only; no event insert
- Lost settle response: retry same key
- Packet mismatch on release: `409`

## Open Questions

- Rate period, simple/compound, day/month, minimum period
- Grace/extra charges
- Allocation order
- Principal-reduction effective date
- Settlement rounding
- Correction/backdating policy
- Proposed simple-interest method is **not** owner-approved

## Step-by-Step Implementation Sub-tasks

1. Define Girvi domain function signatures and unsupported-method errors.
2. Encode fixtures only from real shop examples.
3. Implement repayment/settle transactions with account locks.
4. Implement release as a second transaction/permission.
5. Build statement, repayment, settle, and release UI.
6. PostgreSQL tests: concurrent repayments, reminder does not post interest, release blocked when due, snapshot isolation from default changes.
7. Do not ship live Girvi math without passing fixtures.

## Verification

Match approved examples for partial repayment, date boundaries, opening balances, and settlement. Verify settlement and release are two rows, not one flag.
