# Database roles (spec 03–06)

`packages/db/sql/0001_init_schemas.sql` creates the empty `app` schema. `0002_staff_authentication.sql` adds staff identity tables and seeds the single organization and branch. `0003_shop_settings_and_organization.sql` adds shop profile, rates, sequences, device/reminder defaults, audit events, runtime roles, and organization-scoped RLS. `0004_inventory_and_article_receiving.sql` adds saleable inventory. `0005_barcode_tagging_and_hardware.sql` adds `device_settings.hardware_validated_at` (kept null until a physical drill) and append-only `tag_print_events`. Canonical article barcodes stay on `app.articles.barcode`. `0006_shop_logo_metadata.sql` adds logo content-type / byte-size / checksum columns on `shop_profiles` (object bytes stay in private Storage bucket `shop-assets`; see `docs/shop-logo-storage.md`).

| Role | Purpose |
| --- | --- |
| Migration / table owner | Owns schema objects and applies reviewed SQL files. May bypass RLS. |
| `app_api` | Non-owner, `NOBYPASSRLS` runtime role used by Express via `SET LOCAL ROLE` for each unit of work |
| `app_worker` | Non-owner, `NOBYPASSRLS` runtime role reserved for background jobs |

Each business transaction sets `SET LOCAL ROLE app_api` and `set_config('app.organization_id', …, true)`. Missing context returns no `app` rows. Pooled connections cannot keep another request's organization id after `COMMIT`.

Browser `anon` and `authenticated` Supabase roles must not receive grants on `app`. Membership lookup for `/api/v1/me` still runs as the connecting role before organization context is known.

The `pgboss` schema is not created here because the worker does not start job consumers yet.

Supabase remains an external managed service. Compose does not run Postgres.

Apply:

```bash
psql "$DATABASE_URL" -f packages/db/sql/0001_init_schemas.sql
psql "$DATABASE_URL" -f packages/db/sql/0002_staff_authentication.sql
psql "$DATABASE_URL" -f packages/db/sql/0003_shop_settings_and_organization.sql
psql "$DATABASE_URL" -f packages/db/sql/0004_inventory_and_article_receiving.sql
psql "$DATABASE_URL" -f packages/db/sql/0005_barcode_tagging_and_hardware.sql
psql "$DATABASE_URL" -f packages/db/sql/0006_shop_logo_metadata.sql
pnpm verify:org-context
pnpm verify:inventory
pnpm verify:barcodes
```
