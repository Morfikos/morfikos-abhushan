# Shop logo storage (shop-assets)

The shop logo is stored in a **private** Supabase Storage bucket. PostgreSQL keeps only the object key, content type, byte size, and SHA-256 checksum on `app.shop_profiles`. Clients receive short-lived signed URLs or embedded data URIs — never permanent public links.

## Create the bucket (one-time)

In the Supabase dashboard → Storage → New bucket:

| Setting | Value |
| --- | --- |
| Name | `shop-assets` |
| Public | **No** |
| File size limit | 1 MB (1048576 bytes) |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |

Do not add browser `anon` / `authenticated` policies that grant read or write. The API uploads and signs URLs with `SUPABASE_SECRET_KEY` (service role).

## Environment

`SUPABASE_SECRET_KEY` must be set for the API process (already used for staff invitations). Without it, logo upload returns `CONFIGURATION_ERROR` and profile responses have `logo_url: null`.

## Object key shape

`{organization_id}/logo/{uuid}.{jpg|png|webp}`

## SQL

Apply `packages/db/sql/0006_shop_logo_metadata.sql` after `0005`.

## Later reuse (spec 13)

Article photos, collateral, and invoice PDFs should reuse this private-bucket + signed-URL pattern (or a shared `stored_objects` table). Do not create a second public bucket for branding.
