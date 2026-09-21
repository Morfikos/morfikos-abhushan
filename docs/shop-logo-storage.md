# Shop logo storage (shop-assets)

The shop logo is stored in a **private** Supabase Storage bucket. PostgreSQL keeps only the object key, content type, byte size, and SHA-256 checksum on `app.shop_profiles`. Clients receive short-lived signed URLs or embedded data URIs — never permanent public links.

Girvi collateral photos reuse the same bucket and signing path (`{organization_id}/girvi/{accountId}/{itemId}/{uuid}.{ext}`). Application validation allows up to 5 MB per collateral photo; the shop logo remains capped at 1 MB.

## Create the bucket (one-time)

In the Supabase dashboard → Storage → New bucket:

| Setting | Value |
| --- | --- |
| Name | `shop-assets` |
| Public | **No** |
| File size limit | 5 MB (5242880 bytes) — raised so packet photos fit; logo uploads still reject above 1 MB in the API |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |

Do not add browser `anon` / `authenticated` policies that grant read or write. The API uploads and signs URLs with `SUPABASE_SECRET_KEY` (service role).

## Environment

`SUPABASE_SECRET_KEY` must be set for the API process (already used for staff invitations). Without it, logo upload returns `CONFIGURATION_ERROR` and profile responses have `logo_url: null`.

## Object key shape

- Logo: `{organization_id}/logo/{uuid}.{jpg|png|webp}`
- Girvi collateral: `{organization_id}/girvi/{accountId}/{itemId}/{uuid}.{jpg|png|webp}`

## SQL

Apply `packages/db/sql/0006_shop_logo_metadata.sql` after `0005`.

## Later reuse (spec 13)

Spec 13 reuses this private-bucket + signed-URL adapter for article/identity/Girvi uploads and generated PDFs via `stored_objects` / `documents` (`0017`, types widened in `0018`). Do not create a second public bucket for branding or PDFs.

Object key shapes (in addition to logo / Girvi multipart fallback):

- Staff uploads (grant → PUT → confirm): `{organization_id}/{owner_type}/{owner_id}/{uuid}.{ext}`
- Generated PDFs: `{organization_id}/documents/{document_type}/{owner_id}.pdf`
  - Types: `invoice_pdf`, `receipt_pdf`, `girvi_ack_pdf`, `credit_note_pdf`, `refund_pdf`

Template versions: `invoice.pdf.v2`, `receipt.pdf.v2`, `girvi_ack.pdf.v2`, `credit_note.pdf.v2`, `refund.pdf.v2` (bilingual EN+HI; page size from `device_settings.invoice_paper_size`).

Signed `upload_url` / `download_url` / `signed_url` values must never appear in API or worker logs (pino redact paths). Request access logs omit response bodies.
