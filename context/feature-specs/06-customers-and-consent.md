# 06 — Customers and Consent

**Status:** Specification only — not implemented  
**Depends on:** `03-shop-settings-and-organization`  
**Enables:** POS, payments, Girvi, WhatsApp  
**Blocked by:** none for customer records; WhatsApp templates and reminder timing remain open  

## Feature Overview & Objectives

Create a single customer directory for sales and Girvi without giving customers Auth accounts or a self-service portal. Staff need normalized contact details, consent for transactional messaging, and separate views of sales dues versus Girvi accounts.

This unit does not send WhatsApp messages and does not invent a credit-account product. Overpayments remain rejected until a credit workflow is explicitly approved.

## Scope

### In this unit

- Customer create, search, and profile
- Normalized phone/email
- Communication consent and language preference
- Profile tabs for sales activity and Girvi activity (read models may be empty until later specs)
- Staff-only notes
- Optional identity-document metadata with restricted permission (file bytes in spec 13)

### Explicitly out of this unit

- Customer self-registration, portal, or Auth
- Promotional messaging or loyalty schemes
- Payment recording (spec 09)
- Assuming WhatsApp delivery works
- Merging customers automatically without an explicit later task

## Acceptance Conditions

- Customers are organization-scoped business records
- Duplicate normalized phone within an organization is rejected or flagged as a conflict; do not silently merge
- Consent is stored per channel/purpose and is checked later before send
- Customer detail keeps sales dues and Girvi as separate sections even when one side is empty
- Identity documents are not readable by billing-only staff
- No customer PII in URLs or logs

## User Flows & Interactions

### Create during idle time

1. Staff open Customers → New customer (full page).
2. They enter name, phone, optional email/address, and WhatsApp consent.
3. Save validates and returns the profile.

### Create during POS / Girvi

1. From the customer combobox, staff choose Create customer.
2. After save, the new customer is selected in the parent flow.
3. An unsent POS draft remains unsent; creating a customer is not a sale.

### Review profile

1. Staff search the directory by name or phone.
2. Profile shows contacts, consent, sales tab, Girvi tab, receipts (later), and notification history (later).
3. Revoking consent is immediate for future sends; it does not delete history.

## Data Models & Schema Changes

### `customers`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `display_name` | `text` not null | |
| `phone_normalized` | `text` | E.164 or shop-normalized digits |
| `phone_display` | `text` | |
| `email` | `text` | |
| `address_line` | `text` | |
| `notes` | `text` | staff only |
| `created_at` / `updated_at` | `timestamptz` | |

Unique `(organization_id, phone_normalized)` where phone is not null.

### `customer_consents`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `customer_id` | `uuid` not null | |
| `channel` | `text` not null | `whatsapp` for MVP |
| `purpose` | `text` not null | `transactional_invoice`, `transactional_receipt`, `due_reminder`, `girvi_reminder` |
| `status` | `text` not null | `granted`, `revoked` |
| `granted_at` / `revoked_at` | `timestamptz` | |
| `language` | `text` | default from shop; Hindi fallback later if confirmed |

### `customer_identity_files`

Restricted metadata only: object key, checksum, uploaded_by, purpose. Access: `identity_documents.read`.

Do not cache sales or Girvi balances on the customer row as an independent ledger. Later specs may add reconcilable projection columns.

## API Contracts

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/customers` | `customers.write` or role-limited read |
| `GET` | `/api/v1/customers/:id` | same |
| `POST` | `/api/v1/customers` | `customers.write` |
| `PATCH` | `/api/v1/customers/:id` | `customers.write` |
| `GET/PUT` | `/api/v1/customers/:id/consents` | `customers.write` |
| `GET` | `/api/v1/customers/:id/identity-files` | `identity_documents.read` |

Search is bounded and parameterized. Sort allowlist: name, created_at, phone.

## UI/UX Requirements

- Directory: local header, filters, free table, avatars, pagination
- Create/edit: free inputs, checkbox/toggle for consent, visible help text
- Profile tabs via `tabs/tabs.tsx`: Profile, Sales, Girvi, Notifications
- Empty tabs use free empty-state, not fake activity
- Combobox for POS/Girvi customer select from approved Base components
- No public Create account language

## Edge Cases & Error Handling

- Empty phone: allowed only if the shop later requires it; default is phone required for WhatsApp-capable customers. If phone is missing, consent for WhatsApp cannot be granted.
- Duplicate phone: `409` with the existing customer id only if the caller may see that customer
- Consent granted without phone: `422`
- Network failure: retryable; do not imply the customer exists
- Billing staff requesting identity files: `403`
- Deleted/merged customer: not supported in MVP; deactivate via a `is_active` flag if needed rather than hard delete

## Open Questions

- Phone required for every customer or only for messaging
- Whether customer advances/overpayments will exist (currently rejected)
- Hindi as a customer language at launch

## Step-by-Step Implementation Sub-tasks

1. Migrate customers, consents, and identity file metadata.
2. Implement normalization and uniqueness.
3. Build customer APIs and DTOs.
4. Build directory, profile, and create flows.
5. Expose a search endpoint suitable for the POS combobox.
6. Add tests for duplicate phone, consent without phone, and identity-file permission.

## Verification

Confirm Sales and Girvi tabs stay separate with zero records. Confirm WhatsApp consent cannot be stored without a normalized phone.
