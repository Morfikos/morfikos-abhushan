# 03 — Shop Settings and Organization

**Status:** Specification only — not implemented  
**Depends on:** `01-workspace-foundation`, `02-staff-authentication-and-access`  
**Enables:** inventory, billing, Girvi, notifications, dashboard  
**Blocked by:** none for the single-shop data model; printer dimensions and reminder timing remain open  

## Feature Overview & Objectives

Give the single Aabhushan business a durable organization, one branch, staff permissions, shop profile, daily metal rates, document numbering, printer defaults, and reminder preferences.

This unit solves the problem of later features having nowhere to attach rates, invoice numbers, or role checks. It does not implement invoicing or messaging. Creating these screens does not configure SMTP, WhatsApp, backups, or production hosting.

## Scope

### In this unit

- `organizations` and `branches` for one business and one branch
- Role-to-permission mapping enforced by the API
- Staff directory and invite/suspend actions for owner/admin
- Shop profile fields used on invoices later
- Daily metal rate entry with effective business dates
- Document sequence configuration
- Printer and scanner defaults (values may be placeholders until hardware is confirmed)
- Reminder preference storage (no send pipeline yet)
- Application shell with permission-filtered navigation
- Transaction-local organization context and organization-scoped RLS for runtime roles
- Audit records for staff changes and rate updates

### Explicitly out of this unit

- Multi-branch transfers, SaaS onboarding, or organization billing
- Invoice, Girvi, or WhatsApp execution
- Automatic market-rate feeds
- Claiming printer/scanner values are hardware-validated

## Acceptance Conditions

- All business reads/writes require verified membership and organization scope
- Request-supplied `organization_id` never grants access
- Missing transaction-local organization context denies data access
- Runtime DB roles cannot read `app` tables through the browser Data API
- Rate changes are dated and do not rewrite historical rate rows
- Navigation hides unauthorized modules; direct API calls still return `403`
- Sensitive actions (staff changes, rate updates) write audit rows

## User Flows & Interactions

### First boot / seed

1. A controlled seed creates the single organization, single branch, and first owner membership.
2. The owner signs in and reaches the application shell.

### Staff management

1. Owner/admin opens Settings → Staff.
2. They invite a user with one of `admin`, `billing`, `inventory`, `girvi`.
3. They can suspend a membership. The staff member is blocked on the next API call.

### Shop profile and numbering

1. Owner/admin edits legal name, address, phone, and invoice footer.
2. They set document prefixes and padding for invoices, receipts, Girvi accounts, and article numbers.
3. Sequences increment only when later specs issue documents.

### Daily rates

1. Authorized staff enter today’s metal rates per metal and purity.
2. The API stores an effective business date in `Asia/Kolkata`.
3. Later invoices snapshot the rate used; changing tomorrow’s rate does not alter issued invoices.

### Printer and reminder defaults

1. Staff save scan terminator, tag size, and invoice paper as configuration.
2. Staff save reminder hours/language preferences. Nothing is sent in this unit.

## Data Models & Schema Changes

### `organizations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `name` | `text` not null | |
| `time_zone` | `text` not null default `'Asia/Kolkata'` | |
| `created_at` | `timestamptz` not null | |

### `branches`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `name` | `text` not null | |
| `address_line` | `text` | |
| `is_active` | `boolean` not null default true | |
| `created_at` | `timestamptz` not null | |

MVP unique: one active branch per organization.

### `role_permissions`

Static table or code map is acceptable if versioned. Proposed permissions:

| Permission | owner | admin | billing | inventory | girvi |
| --- | --- | --- | --- | --- | --- |
| `staff.manage` | yes | yes | no | no | no |
| `settings.write` | yes | yes | no | no | no |
| `rates.write` | yes | yes | read daily | no | no |
| `inventory.read/write` | yes | yes | read | yes | no |
| `billing.write` | yes | yes | yes | no | no |
| `payments.write` | yes | yes | yes | no | no |
| `refunds.approve` | yes | yes | no | no | no |
| `customers.write` | yes | yes | yes | read | yes |
| `girvi.write` | yes | yes | no | no | yes |
| `girvi.release` | yes | yes | no | no | no |
| `identity_documents.read` | yes | yes | no | no | no |
| `reports.read` | yes | yes | limited | limited | limited |
| `audit.read` | yes | yes | no | no | no |

This matrix is a working proposal until the shop confirms who may override prices, adjust stock, refund, or release collateral.

### `shop_profiles`

Shop legal identity, contacts, footer, optional logo object key (file bytes arrive in spec 13).

### `metal_rates`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `metal` | `text` not null | e.g. `gold`, `silver` |
| `purity` | `text` not null | store as confirmed labels later |
| `rate_per_gram` | `numeric(18,6)` not null | |
| `effective_business_date` | `date` not null | Asia/Kolkata business date |
| `created_by_staff_user_id` | `uuid` not null | |
| `created_at` | `timestamptz` not null | |

Unique `(organization_id, metal, purity, effective_business_date)`.

### `document_sequences`

`(organization_id, branch_id, document_type)` with `prefix`, `padding`, `next_value`. Increment only inside later issuing transactions.

### `device_settings`

Scan terminator, expected suffix, tag width/height mm, invoice paper size. Values remain unverified until spec 05 hardware evidence.

### `reminder_settings`

Enabled flags, local send window, language preference. No templates sent here.

### `audit_events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `actor_staff_user_id` | `uuid` | |
| `action` | `text` not null | |
| `entity_type` | `text` not null | |
| `entity_id` | `uuid` | |
| `reason` | `text` | |
| `payload` | `jsonb` | redacted; no secrets |
| `created_at` | `timestamptz` not null | |

### RLS and roles

- Migration role owns tables.
- API and worker roles are non-owners, subject to organization RLS.
- `set_config` / transaction-local `app.organization_id` required per unit of work.
- Browser anon/authenticated roles have no grants on `app`.

## API Contracts

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `GET/PATCH` | `/api/v1/shop/profile` | `settings.write` for patch | |
| `GET/POST` | `/api/v1/shop/rates` | `rates.write` for post | |
| `GET/PATCH` | `/api/v1/shop/sequences` | `settings.write` | |
| `GET/PATCH` | `/api/v1/shop/devices` | `settings.write` | |
| `GET/PATCH` | `/api/v1/shop/reminders` | `settings.write` | |
| `GET/POST` | `/api/v1/staff` | `staff.manage` | invite |
| `POST` | `/api/v1/staff/:id/suspend` | `staff.manage` | |
| `GET` | `/api/v1/audit` | `audit.read` | paginated |

All list endpoints are paginated with allowlisted sort fields.

## UI/UX Requirements

Application shell around public `sidebar-simple.tsx` or header navigation. Default styling. Navigation: Dashboard, Inventory, Invoices/POS, Payments, Customers, Girvi, Notifications, Settings — filtered by permission.

Settings is a local composition of free form controls, headings, and validation/status feedback. No paid settings template.

- Staff table uses `table/table.tsx` + pagination
- Rate entry uses free inputs and date picker; right-align `rate_per_gram` with tabular numerals and ₹/g
- Status badges include readable labels
- Help text states that printer values are unvalidated until hardware checks

## Edge Cases & Error Handling

- Second organization/branch create attempt in MVP: reject rather than building SaaS onboarding
- Duplicate rate for the same business date: `409` or supersede only by inserting a new row if the product later allows corrections; do not silently edit the old row
- Sequence edit that would collide with issued numbers: `422` once issuing exists; until then, prevent decreasing `next_value` below 1
- Pooled connection reuse: integration test must prove organization context does not leak
- Unauthorized settings URL: hide nav and return `403` from API

## Open Questions

- Staffing: who may write rates, adjust stock, refund, or release collateral
- GSTIN / statutory fields needed on the invoice face
- Exact purity labels used by the shop
- Hardware dimensions (tracked again in spec 05)

## Step-by-Step Implementation Sub-tasks

1. Add organization, branch, shop, rate, sequence, device, reminder, permission, and audit migrations.
2. Implement transaction helpers that set and clear organization context.
3. Apply RLS and verify denied cross-organization access with real PostgreSQL tests.
4. Implement settings and staff APIs with permission checks and audit writes.
5. Build the authenticated shell and Settings screens from free primitives.
6. Seed the single organization, branch, and owner.
7. Add tests for permission denial, rate dating, and connection-context isolation.

## Verification

Real database tests for RLS and missing context are mandatory. UI review only is insufficient.
