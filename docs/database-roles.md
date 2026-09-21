# Database roles (spec 03–12)

`packages/db/sql/0001_init_schemas.sql` creates the empty `app` schema. `0002_staff_authentication.sql` adds staff identity tables and seeds the single organization and branch. `0003_shop_settings_and_organization.sql` adds shop profile, rates, sequences, device/reminder defaults, audit events, runtime roles, and organization-scoped RLS. `0004_inventory_and_article_receiving.sql` adds saleable inventory. `0005_barcode_tagging_and_hardware.sql` adds `device_settings.hardware_validated_at` (kept null until a physical drill) and append-only `tag_print_events`. Canonical article barcodes stay on `app.articles.barcode`. `0006_shop_logo_metadata.sql` adds logo content-type / byte-size / checksum columns on `shop_profiles` (object bytes stay in private Storage bucket `shop-assets`; see `docs/shop-logo-storage.md`). `0007_customers_and_consent.sql` adds organization-scoped `customers`, `customer_consents`, and `customer_identity_files` metadata (object bytes remain spec 13). `0008_calculation_policies.sql` adds versioned `calculation_policies`. Owner-approved `invoice.v1` methods are seeded with `pnpm seed:calculation-policy` (not guessed in the migration). `0009_pos_billing_and_finalization.sql` adds `invoices` (draft/finalized), `invoice_lines`, `payments`, `payment_allocations`, `idempotency_keys`, and `outbox_events`, plus the `inventory_movements.related_invoice_id` FK. `0010_invoice_line_pricing_inputs.sql` adds `invoice_lines.pricing_input` and `invoices.invoice_discount_input` for POS making/wastage/stones/discounts. `0011_walk_in_customer.sql` adds `customers.is_walk_in`. `0012_making_charge_defaults.sql` adds metal+purity making defaults. `0013_payments_and_outstanding_balances.sql` adds `receipts` and collection indexes. `0014_returns_refunds_and_reversals.sql` adds `invoice_returns`, `credit_notes`, `payments.kind` / `reverses_payment_id`, CN/RFD sequences, and the `inventory_movements.related_return_id` FK. `0015_girvi_accounts_and_collateral.sql` adds Girvi accounts, collateral items/files, custody events, and financial events (disbursement in this unit). Collateral has no FK to `articles`. `0016_girvi_interest_settlement_and_release.sql` adds versioned `girvi_calculation_policies`, the `repayment` / `settlement` / `waiver` / `opening_balance` event types with `method`, `notes`, and `posting_sequence`, rebuildable `principal_outstanding_inr` / `interest_outstanding_inr` projections, settled/released stamps, and `girvi_release_events` (one physical handover per account, `app_api` insert only). Owner-approved `girvi.v1` methods are seeded with `pnpm seed:girvi-calculation-policy`; until that row exists every Girvi payoff API fails closed with `CALCULATION_RULE_UNSUPPORTED`. Live finalization requires approved `invoice.v1` plus an applicable metal rate for the business date. `0017_documents_storage_and_print.sql` adds `stored_objects` and `documents` for private file catalog and async PDF metadata (bytes stay in private `shop-assets`). `0018_credit_note_and_refund_document_types.sql` widens `documents.document_type` with `credit_note_pdf` and `refund_pdf` (keeps invoice/receipt/girvi ack). `0019_notifications_outbox_and_whatsapp.sql` adds `notifications`, `notification_webhook_events`, and the `pgboss` schema grants for the worker. `0020_reporting_views_and_exports.sql` adds reconcilable reporting views (`v_sales_by_business_date`, `v_collections_by_method`, `v_sales_dues`, `v_inventory_available`, `v_girvi_balances`), `export_jobs`, and the `stored_objects.owner_type` value `export`.

| Role | Purpose |
| --- | --- |
| Migration / table owner | Owns schema objects and applies reviewed SQL files. May bypass RLS. |
| `app_api` | Non-owner, `NOBYPASSRLS` runtime role used by Express via `SET LOCAL ROLE` for each unit of work |
| `app_worker` | Non-owner, `NOBYPASSRLS` runtime role reserved for background jobs |

Each business transaction sets `SET LOCAL ROLE app_api` and `set_config('app.organization_id', …, true)`. Missing context returns no `app` rows. Pooled connections cannot keep another request's organization id after `COMMIT`.

Browser `anon` and `authenticated` Supabase roles must not receive grants on `app`. Membership lookup for `/api/v1/me` still runs as the connecting role before organization context is known.

The `pgboss` schema is created in `0019` with `USAGE`/`CREATE` for `app_worker`. The worker starts pg-boss on boot and creates job tables under that schema. Successful job retention is operational and independent of `app.notifications`.

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
psql "$DATABASE_URL" -f packages/db/sql/0015_girvi_accounts_and_collateral.sql
psql "$DATABASE_URL" -f packages/db/sql/0016_girvi_interest_settlement_and_release.sql
psql "$DATABASE_URL" -f packages/db/sql/0017_documents_storage_and_print.sql
psql "$DATABASE_URL" -f packages/db/sql/0018_credit_note_and_refund_document_types.sql
psql "$DATABASE_URL" -f packages/db/sql/0019_notifications_outbox_and_whatsapp.sql
psql "$DATABASE_URL" -f packages/db/sql/0020_reporting_views_and_exports.sql
psql "$DATABASE_URL" -f packages/db/sql/0021_sales_dues_as_of.sql
psql "$DATABASE_URL" -f packages/db/sql/0022_export_type_collections.sql
pnpm verify:org-context
pnpm verify:inventory
pnpm verify:barcodes
pnpm verify:customers
pnpm verify:invoice-calculation
pnpm seed:calculation-policy
pnpm verify:pos-billing
pnpm verify:payments
pnpm verify:returns
pnpm verify:girvi
pnpm seed:girvi-calculation-policy
pnpm verify:girvi-settlement
pnpm verify:documents
pnpm verify:notifications
pnpm verify:reports
```
