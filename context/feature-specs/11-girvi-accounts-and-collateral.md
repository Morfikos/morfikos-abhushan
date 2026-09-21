# 11 — Girvi Accounts and Collateral

**Status:** Implemented and verified  
**Depends on:** `06-customers-and-consent`, `03-shop-settings-and-organization`  
**Enables:** `12-girvi-interest-settlement-and-release`  
**Blocked by:** owner-approved Girvi examples for interest (spec 12); opening packets list for migration (spec 16)  

## Feature Overview & Objectives

Open a Girvi account by recording customer-owned collateral and agreed loan terms, then activate it with a disbursement. Staff need custody that is completely separate from saleable inventory.

An overdue account never becomes shop stock. This unit does not calculate live interest beyond storing a terms snapshot, and it does not release packets.

## Scope

### In this unit

- Girvi account draft and activation
- Collateral item records: photos, weights, purity, assessed value, packet number, custody location
- Terms snapshot at activation
- Disbursement record (principal out)
- Account list/detail with Collateral and Terms tabs
- Unique account numbers
- Custody events for receive-into-packet

### Explicitly out of this unit

- Interest engine details that are still unapproved (interface only)
- Repayment, settlement, physical release
- Top-up, renewal, partial packet release, auction/disposal
- Showing collateral in Inventory or POS
- Automatic ownership transfer on overdue

## Acceptance Conditions

- Collateral rows are not `articles` and cannot be returned by article lookup
- Activation is transactional: account, frozen terms, disbursement, custody event, audit, outbox
- Idempotent activation
- Terms used later are the frozen snapshot, not current shop defaults
- Status `overdue` is derived or marked without changing custody ownership
- Identity/collateral photos use private object keys only
- `girvi.write` required; activation is not a sale

## User Flows & Interactions

### Open an account

1. Girvi staff select a customer and start New Girvi (full page).
2. They add one or more collateral items with weights, purity, assessed value, photos, packet number, and location.
3. They enter principal, start date, maturity date, and the shop’s agreed term fields that are confirmed. Unconfirmed fields remain disabled with an explicit blocked message.
4. Staff save a draft, then Activate account with disbursement confirmation: customer, principal, packet ids.
5. The system issues the account number and records disbursement. Interest starts according to spec 12 once rules are approved.

### Review

1. List shows active accounts, maturity, and customer.
2. Detail tabs: Collateral, Terms, Statement (empty/calculated later), Payments, History.
3. Overdue presentation is a labeled status. Copy must not say the jewellery is now shop stock.

## Data Models & Schema Changes

### `girvi_accounts`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` / `branch_id` | `uuid` not null | |
| `account_number` | `text` not null unique per org | |
| `customer_id` | `uuid` not null | |
| `status` | `text` not null | `draft`, `active`, `settled`, `released` |
| `principal_inr` | `numeric(18,2)` not null | |
| `start_business_date` | `date` not null | |
| `maturity_business_date` | `date` not null | |
| `terms_snapshot` | `jsonb` not null | frozen agreed terms |
| `calculation_policy_version` | `text` | set when approved |
| `activated_at` | `timestamptz` | |
| `activated_by_staff_user_id` | `uuid` | |
| `row_version` | `integer` not null | |

Do not add `sold_to_shop` status.

### `girvi_collateral_items`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `girvi_account_id` | `uuid` not null | |
| `description` | `text` not null | |
| `metal` / `purity` | `text` | |
| `gross_weight_grams` / `net_metal_weight_grams` | `numeric(14,4)` | |
| `assessed_value_inr` | `numeric(18,2)` | |
| `packet_number` | `text` not null | |
| `custody_location` | `text` not null | |
| `status` | `text` not null | `in_custody`, `released` |

### `girvi_collateral_files`

Private object keys, checksums, ownership.

### `girvi_custody_events`

`received`, `location_changed`, `released` (release written in spec 12). Actor, timestamp, packet number.

### `girvi_financial_events`

This unit writes `disbursement` only:

- `event_type`, `effective_business_date`, `principal_delta_inr`, `interest_delta_inr`, `amount_inr`, `actor`, unique event key

## API Contracts

| Method | Path | Permission | Idempotent |
| --- | --- | --- | --- |
| `POST` | `/api/v1/girvi/accounts` | `girvi.write` | drafts |
| `GET/PATCH` | `/api/v1/girvi/accounts/:id` | `girvi.write` | drafts only for patch |
| `POST` | `/api/v1/girvi/accounts/:id/activate` | `girvi.write` | **required** |
| `GET` | `/api/v1/girvi/accounts` | girvi/admin | filters: status, maturity, customer |

Activation must not call WhatsApp or render PDFs inside the transaction.

## UI/UX Requirements

- Full-page forms; free date pickers, uploader, table, modal
- Pair the word Girvi with any icon
- Tabs: Collateral, Terms, Statement, Payments, History
- Principal shown with ₹ and tabular numerals
- Activate account confirmation lists principal and packet numbers
- Inventory navigation must not list these packets

## Edge Cases & Error Handling

- Activate without collateral: `422`
- Activate with unapproved interest method if the shop requires interest from day one: block rather than approximate
- Packet number collision in-custody: `409`
- Adding collateral after activation: rejected in MVP (no top-up/partial add)
- Photo upload failure: account draft can exist; activation may require at least the shop-required evidence
- Lookup of packet barcode in POS: not found as article

## Open Questions

- Rate period, simple vs compound, day/month convention, minimum period
- Grace/extra charges
- Assessed value method
- Required photos/ID at opening
- Opening active accounts import (spec 16)

## Step-by-Step Implementation Sub-tasks

1. Migrate Girvi account, collateral, custody, and financial event tables.
2. Enforce separation from `articles` at the schema and lookup layers.
3. Implement draft and activate services with numbering and disbursement.
4. Build Girvi list/detail/create UI.
5. Add tests: cannot sell collateral, activation atomicity, default-term changes do not mutate snapshots.
6. Leave interest calculation function as an explicit unsupported stub until examples arrive.

## Verification

Prove POS article lookup never returns collateral. Prove changing shop default terms does not change an activated snapshot.
