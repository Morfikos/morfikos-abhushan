# Database roles (spec 03–10)

`packages/db/sql/0001_init_schemas.sql` creates the empty `app` schema. `0002_staff_authentication.sql` adds staff identity tables and seeds the single organization and branch. `0003_shop_settings_and_organization.sql` adds shop profile, rates, sequences, device/reminder defaults, audit events, runtime roles, and organization-scoped RLS. `0004_inventory_and_article_receiving.sql` adds saleable inventory. `0005_barcode_tagging_and_hardware.sql` adds `device_settings.hardware_validated_at` (kept null until a physical drill) and append-only `tag_print_events`. Canonical article barcodes stay on `app.articles.barcode`. `0006_shop_logo_metadata.sql` adds logo content-type / byte-size / checksum columns on `shop_profiles` (object bytes stay in private Storage bucket `shop-assets`; see `docs/shop-logo-storage.md`). `0007_customers_and_consent.sql` adds organization-scoped `customers`, `customer_consents`, and `customer_identity_files` metadata (object bytes remain spec 13). `0008_calculation_policies.sql` adds versioned `calculation_policies`. Owner-approved `invoice.v1` methods are seeded with `pnpm seed:calculation-policy` (not guessed in the migration). `0009_pos_billing_and_finalization.sql` adds `invoices` (draft/finalized), `invoice_lines`, `payments`, `payment_allocations`, `idempotency_keys`, and `outbox_events`, plus the `inventory_movements.related_invoice_id` FK. `0010_invoice_line_pricing_inputs.sql` adds `invoice_lines.pricing_input` and `invoices.invoice_discount_input` for POS making/wastage/stones/discounts. `0011_walk_in_customer.sql` adds `customers.is_walk_in`. `0012_making_charge_defaults.sql` adds metal+purity making defaults. `0013_payments_and_outstanding_balances.sql` adds `receipts` and collection indexes. `0014_returns_refunds_and_reversals.sql` adds `invoice_returns`, `credit_notes`, `payments.kind` / `reverses_payment_id`, CN/RFD sequences, and the `inventory_movements.related_return_id` FK. Live finalization requires approved `invoice.v1` plus an applicable metal rate for the business date.

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
psql "$DATABASE_URL" -f packages/db/sql/0007_customers_and_consent.sql
psql "$DATABASE_URL" -f packages/db/sql/0008_calculation_policies.sql
psql "$DATABASE_URL" -f packages/db/sql/0009_pos_billing_and_finalization.sql
psql "$DATABASE_URL" -f packages/db/sql/0010_invoice_line_pricing_inputs.sql
psql "$DATABASE_URL" -f packages/db/sql/0011_walk_in_customer.sql
psql "$DATABASE_URL" -f packages/db/sql/0012_making_charge_defaults.sql
psql "$DATABASE_URL" -f packages/db/sql/0013_payments_and_outstanding_balances.sql
psql "$DATABASE_URL" -f packages/db/sql/0014_returns_refunds_and_reversals.sql
pnpm verify:org-context
pnpm verify:inventory
pnpm verify:barcodes
pnpm verify:customers
pnpm verify:invoice-calculation
pnpm seed:calculation-policy
pnpm verify:pos-billing
pnpm verify:payments
pnpm verify:returns
```
