# 13 — Documents, Storage, and Print

**Status:** Specification only — not implemented  
**Depends on:** `08-pos-billing-and-finalization`, `09-payments-and-outstanding-balances`, `05-barcode-tagging-and-hardware`  
**Enables:** WhatsApp attachments, authorized reprints, backup of object bytes  
**Blocked by:** invoice/receipt paper size and bilingual output confirmation  

## Feature Overview & Objectives

Store article photos, collateral evidence, necessary identity files, invoices, and receipts in private buckets, and produce PDFs/print views after financial commits.

Staff need documents without public links. PDF or print failure must not undo a sale or repayment. A correct on-screen preview is not proof a physical invoice is usable.

## Scope

### In this unit

- Private Supabase Storage buckets
- PostgreSQL document metadata: object key, checksum, template version, ownership
- Authorized short-lived signed URLs
- PDFKit invoice and receipt generation on the worker
- HTML print views for invoices, receipts, and tags
- Outbox-driven document jobs
- Upload validation and abandoned-upload cleanup
- Reprint of issued documents from snapshots

### Explicitly out of this unit

- Public invoice URLs
- Generating PDFs inside financial transactions
- WhatsApp send (spec 14)
- Permanent identity-document links
- Paid templates or dashboard-styled printouts

## Acceptance Conditions

- Browser clients never read buckets with long-lived public policies
- Every file row has organization ownership and checksum
- Signed URL issuance requires the same permission as the parent entity
- Worker generates PDFs from invoice/payment snapshots, not live rates
- Outbox dispatcher enqueues after commit; retries are idempotent on document key
- Failed PDF leaves the financial record finalized with an actionable document status
- Print CSS is white paper, dark text, no navigation/shadows
- Identity files require `identity_documents.read`

## User Flows & Interactions

### After a sale

1. Finalize commits an `invoice.finalized` outbox event.
2. Worker renders PDF to a deterministic key and stores metadata `status = ready` or `failed`.
3. Staff open the invoice and choose Print or Download. API authorizes and returns a short-lived URL or the print route.
4. If generation failed, the sale remains complete and staff see Retry document.

### Upload a photo

1. Staff use the free uploader on article, customer ID, or collateral forms.
2. Client requests an upload grant; API validates size, type, and path.
3. Object lands in a private prefix `{organization_id}/...`.
4. Metadata is saved; the UI displays via a signed URL.

### Print

1. Staff open the dedicated print view.
2. Browser print is explicit. Failures are shown.
3. Hardware validation for invoices is tracked separately, like tags.

## Data Models & Schema Changes

### `stored_objects`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `bucket` | `text` not null | |
| `object_key` | `text` not null | unique per bucket |
| `checksum_sha256` | `text` not null | |
| `content_type` | `text` not null | allowlist |
| `byte_size` | `integer` not null | |
| `owner_type` / `owner_id` | `text` / `uuid` | article, customer, girvi, invoice, receipt |
| `visibility` | `text` not null | `private` |
| `created_by_staff_user_id` | `uuid` | |
| `created_at` | `timestamptz` not null | |

### `documents`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `document_type` | `text` not null | `invoice_pdf`, `receipt_pdf`, `girvi_ack_pdf` |
| `template_version` | `text` not null | |
| `status` | `text` not null | `pending`, `ready`, `failed` |
| `stored_object_id` | `uuid` | |
| `source_event_key` | `text` not null unique | idempotent generation |
| `last_error_code` | `text` | no stack traces to clients |

Abandoned uploads: objects without a confirming metadata row after a TTL are cleaned by a worker job.

## API Contracts

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/api/v1/files/upload-grants` | parent write permission |
| `GET` | `/api/v1/files/:id/access` | parent read / identity permission |
| `GET` | `/api/v1/documents/:id` | parent read |
| `POST` | `/api/v1/documents/:id/retry` | parent write |
| `GET` | `/api/v1/invoices/:id/print` | billing | print DTO |

CORS is not authorization. Signed URLs are short-lived.

## UI/UX Requirements

- Dedicated print routes without the app chrome
- Invoice/receipt use snapshot figures with tabular numerals and ₹
- Document status badges: Pending, Ready, Failed — words, not color only
- Retry only when the job is safely idempotent
- File uploader: public `file-upload-base.tsx`
- No dashboard colors on print

## Edge Cases & Error Handling

- Worker crash mid-upload: retry uses the same object key; checksum mismatch replaces safely
- Provider timeout: document `failed`, finance untouched
- Staff downloads after permission loss: `403`
- Object backup missing: database restore alone is insufficient (called out in spec 16)
- Huge files: reject at grant time
- Hindi/₹ missing in PDF font: treat as a document defect; embed fonts when bilingual output is required

## Open Questions

- Invoice paper size
- Bilingual printed output
- Whether identity documents are required at launch

## Step-by-Step Implementation Sub-tasks

1. Provision private buckets and deny public access.
2. Migrate `stored_objects` and `documents`.
3. Implement storage adapter and upload grants.
4. Implement PDF adapter with deterministic keys.
5. Add outbox consumer for invoice/receipt PDFs.
6. Build print views and document status on invoice/payment pages.
7. Add cleanup for abandoned uploads.
8. Test authorization, idempotent retry, and “sale survives PDF failure.”

## Verification

Prove a finalized invoice remains finalized when PDF generation throws. Prove signed URLs are not logged in full.
