# Progress Tracker

Update this file after every meaningful implementation change. Record completed work only when supported by an artifact or verification result. Keep proposed decisions separate from owner-confirmed business rules.

## Current Phase

Feature specifications drafted; implementation not started.

**Last updated:** 20 September 2026.

No application repository, running build, database migration, provider integration, or production deployment has been inspected or verified for this MVP. Any work performed elsewhere must be checked before updating its status here. Feature specs are implementation-ready documentation, not evidence that the corresponding code exists.

## Current Goal

- Implement the first authorized unit from `context/feature-specs/01-workspace-foundation.md` when implementation is requested.
- Reconcile older UI references with the settled choice of free-only Untitled UI and default styling before those documents guide implementation.
- Collect the shop's invoice and Girvi examples alongside foundation work so financial calculations can be implemented against confirmed rules.

## Completed

- Defined the MVP modules: inventory and per-article tagging, barcode invoicing, payments, customers, dashboard/reports, and Girvi with interest calculations and WhatsApp reminders.
- Created `aabhooshad-mvp-architecture.md` covering system boundaries, module behavior, conceptual entities, API design, transactions, background jobs, deployment, recovery, and implementation sequence.
- Created `project-overview.md` using the supplied template, including goals, flows, scope, and success criteria.
- Created `architecture.md` using the supplied template, including stack, boundaries, storage, access control, and invariants.
- Created `code-standards.md` using the supplied template, including TypeScript, API, data, financial arithmetic, and organization conventions.
- Created and revised `ui-context.md`: the current direction uses Untitled UI's default styling and only verified free source components. Paid-template dependencies have been removed; required pages are original compositions built from free primitives.
- Created `ai-workflow-rules.md` using the supplied template, covering incremental work, missing requirements, protected files, documentation updates, and completion checks.
- Created this initial project progress tracker in the supplied format.
- Checked template heading order and document structure during artifact creation. This is documentation verification, not application testing or business-owner approval of every proposed rule.
- Created 16 implementation-ready feature specs in `context/feature-specs/` covering the MVP end to end. Schema fields, endpoints, and permission names in those specs are proposed for implementation and are not owner-approved business rules. Invoice and Girvi calculators remain blocked on shop examples.

## Feature Specifications

Specs are listed in intended implementation order. Feed them one by one; do not start application code until a spec is explicitly requested.

| Spec | File | Notes |
| --- | --- | --- |
| 01 | `context/feature-specs/01-workspace-foundation.md` | Next implementation unit |
| 02 | `context/feature-specs/02-staff-authentication-and-access.md` | Invite-only staff Auth |
| 03 | `context/feature-specs/03-shop-settings-and-organization.md` | Org, branch, permissions, rates |
| 04 | `context/feature-specs/04-inventory-and-article-receiving.md` | Saleable articles only |
| 05 | `context/feature-specs/05-barcode-tagging-and-hardware.md` | Hardware drill still required |
| 06 | `context/feature-specs/06-customers-and-consent.md` | No customer Auth |
| 07 | `context/feature-specs/07-invoice-calculation-engine.md` | Blocked on invoice examples |
| 08 | `context/feature-specs/08-pos-billing-and-finalization.md` | Staff POS, not cart/checkout |
| 09 | `context/feature-specs/09-payments-and-outstanding-balances.md` | Manual collections |
| 10 | `context/feature-specs/10-returns-refunds-and-reversals.md` | Inspection before restock |
| 11 | `context/feature-specs/11-girvi-accounts-and-collateral.md` | Separate from inventory |
| 12 | `context/feature-specs/12-girvi-interest-settlement-and-release.md` | Blocked on Girvi examples |
| 13 | `context/feature-specs/13-documents-storage-and-print.md` | Private files and PDFs |
| 14 | `context/feature-specs/14-notifications-and-whatsapp.md` | Official provider required |
| 15 | `context/feature-specs/15-dashboard-reports-and-exports.md` | Reconciled measures only |
| 16 | `context/feature-specs/16-opening-imports-and-pilot-readiness.md` | Imports, backups, launch |

Customer cart/checkout and offline synchronization were not specified as product features: they are out of MVP scope. Connectivity failures are retryable/unresolved online states only.

## In Progress

- Project preparation: documenting the baseline and identifying business decisions needed before financial implementation.
- Feature specs are ready for sequential implementation. No coding, migration, automated test run, provider setup, or deployment is currently recorded as in progress.

## Next Up

- **Implementation — spec 01:** establish the pnpm workspace, apps, packages, Untitled UI free baseline, health endpoints, and verified lint/typecheck/test/build scripts when coding is requested.
- **Documentation consistency:** update the UI-library and component-location references in `architecture.md`, `code-standards.md`, and the detailed architecture document to match the latest `ui-context.md`. Their earlier shadcn/ui references remain outdated; the latest explicit free-only Untitled UI choice governs implementation meanwhile.
- **Business examples:** obtain representative invoices, pricing calculations, active/settled Girvi examples, and opening-data samples. Record approved rules and expected results before implementing calculators.
- **Foundation — workspace:** establish a pnpm TypeScript workspace with `apps/web`, `apps/api`, `apps/worker`, and the agreed shared packages. Configure actual lint, type-check, test, and build scripts; validate the initial build.
- **Foundation — data and identity:** configure development Supabase, migrations, organization/branch records, staff memberships, restricted runtime database roles, transaction-local organization context, and access policies. Verify permitted and denied access with real database tests.
- **Foundation — staff flow:** implement invitation-based Supabase Auth, custom SMTP, Next.js session integration, Express token verification, and active-membership/permission checks. Build the login and invited-account screens from approved free controls.
- **Inventory and tagging:** deliver article receipt, weights/purity/location, movement history, unique barcode generation, tag print/reprint, lookup, and reviewed stock checks. Validate scanner and printer output.
- **Billing:** implement the approved decimal calculation engine, drafts/quotes, stale-quote handling, atomic finalization, invoice numbering, stock locking, and idempotency. Verify that two counters cannot sell the same article.
- **Customers and payments:** deliver customer records and consent, split/partial collections, allocations, receipts, dues, and controlled returns/refunds/reversals with traceable history.
- **Girvi:** implement confirmed loan terms, separate collateral custody, effective-dated interest, repayment allocation, settlement, and physical release. Verify against approved examples and concurrent-payment scenarios.
- **Documents and automation:** implement private file access, invoice/receipt PDFs, transactional outbox, pg-boss jobs, official WhatsApp integration, consent checks, scheduled reminders, and retry/reconciliation states.
- **Dashboard and imports:** implement reconciled stock/sales/collection/Girvi reports, exports, and reviewed opening imports. Keep sales dues separate from loan principal and interest.
- **Pilot readiness:** complete authorization/concurrency tests, relevant end-to-end flows, actual hardware checks, quota/worker monitoring, independent backups, a restore drill, staff training, and supervised launch.

## Open Questions

- **Shop operation:** confirm that launch is one branch, how many staff/counters will use it, and which people can override prices, adjust stock, refund money, or release collateral. One branch is the documented working assumption, not a confirmed staffing survey.
- **Invoice rules:** obtain approved invoice samples and confirm purity/rate handling, making-charge methods, wastage conventions, stones, discounts, tax treatment, required fields, and rounding. These block final calculator and document approval, not workspace setup.
- **Girvi terms:** confirm rate period, simple/compound method, day/month convention, minimum period, grace/extra charges if any, allocation order, principal-reduction effective date, settlement rounding, and correction/backdating policy. The proposed simple-interest method is not yet owner-approved.
- **Credit policy:** confirm due dates, permitted credit sales, payment corrections, and whether customer advances/overpayments are essential. The current MVP default rejects overpayments unless a separate credit workflow is implemented.
- **Returns:** confirm inspection, re-entry into available stock, credit-note behavior, and who approves refunds. Returned pieces must not become available automatically before inspection.
- **Opening records:** identify existing stock, sales dues, active Girvi accounts, collateral packets, opening interest balances, and accrual dates. Confirm import format and who reviews totals.
- **Hardware:** confirm barcode reader model, scan suffix, tag printer, label dimensions, invoice paper size, and any required bilingual output.
- **WhatsApp:** choose the official provider, confirm account ownership/readiness, permitted Girvi messaging, templates, consent records, language, reminder timing, and messaging budget. Automated delivery has not been configured.
- **Infrastructure:** choose the always-on application host, deployment region, domain/subdomain, SMTP provider, independent backup destination, and monitoring/alert destination. Supabase Free does not settle these choices or their costs.
- **Recovery:** confirm acceptable downtime and data loss. The proposed pilot recovery targets in the architecture require business acceptance and a successful restore drill.
- **Scope checks:** determine whether old-gold exchange, supplier dues, karigar accounting, partial collateral release, or Girvi renewal/top-up is essential for launch. They remain deferred unless explicitly added to scope.
- **Repository and ownership:** identify the implementation repository and deployment owners before coding or configuring live services. No repository location has been supplied in this work.
- **Detailed specifications:** proposed field-level tables and `/api/v1` contracts now live in `context/feature-specs/`. They still need review against shop examples and must not be treated as owner-approved calculation or credit policy. Earlier Jewellery OS LLDs must not be assumed compatible without review against the current Aabhooshad scope.

## Architecture Decisions

- **Next.js frontend and independent Node.js/Express API:** explicitly requested so a future mobile client can reuse the same backend. Business rules stay outside web-only handlers/actions.
- **Supabase Auth and PostgreSQL Free initially:** explicitly requested. Keep quota/availability monitoring and independent recovery in the plan; separate hosting and integration costs still apply.
- **No Redis:** explicitly requested. The documented queue choice is pg-boss with a separate Node.js worker using PostgreSQL; this is a design selection, not an installed integration.
- **Modular monolith:** maintain clear inventory, billing, payments, customers, Girvi, and notification boundaries while allowing local database transactions and a small deployment footprint.
- **Initial single-business/single-branch operation:** use organization-aware records and permissions as preparation for growth; full multi-tenant onboarding and branch transfers are deferred.
- **Free-only Untitled UI:** explicitly confirmed. Use default purple styling, Inter, approved public Base/Application UI components, and original page compositions. No PRO purchase or paid-template dependency. This supersedes the earlier Morfikos/shadcn direction.
- **Decimal arithmetic and historical snapshots:** preserve reproducible invoice and Girvi results. Exact commercial calculation policies remain open until confirmed with the shop.
- **Transactional posting and idempotency:** invoice, stock, initial payment, audit, and outbox writes commit together; repeat submissions cannot create duplicate financial operations.
- **Outbox and asynchronous side effects:** PDFs and WhatsApp messages run after commit, so provider failures do not undo valid sales or repayments. Consumers handle retries and ambiguous external outcomes explicitly.
- **Separate Girvi collateral:** pledged jewellery is not saleable inventory. Financial settlement and physical release are distinct recorded actions.
- **Manual payment verification:** cash/UPI/card/bank receipts are recorded by staff; payment gateways and automatic bank confirmation are deferred.
- **Private storage and backend authorization:** protect customer records and documents through verified staff permissions, scoped database access, and controlled file delivery.
- **Online financial operations:** no offline posting or automatic conflict reconciliation in v1. Polling and query invalidation are sufficient initially; realtime infrastructure is not required.
- **Managed database plus separately hosted processes:** web, API, and worker can share an always-on host with independent restarts. The exact provider and budget remain unresolved.

## Session Notes

- All completed work recorded here is planning/document creation. No application implementation or production readiness is claimed.
- Resume by implementing `01-workspace-foundation.md` when requested, after reading the latest `ui-context.md` and `ai-workflow-rules.md`. Keep document consistency work available in parallel.
- Read the latest `ui-context.md` and `ai-workflow-rules.md` before UI work. Free-only Untitled UI is a settled constraint and is not an open licensing question.
- Do not confuse Aabhooshad's current MVP with the earlier broader Jewellery OS plan. Current choices include Next.js, Express, Supabase Auth/PostgreSQL, pg-boss, and no Redis; older Clerk/BullMQ/multi-branch assumptions do not carry over automatically.
- Keep undefined financial behavior out of implementation. Record pending rules here and proceed with independent foundation work while awaiting examples or decisions.
- For every meaningful implementation update, record the actual files/features changed, checks run and results, known limitations, and next unit. Move entries to Completed only after their acceptance conditions are evidenced.
- Preserve user changes and inspect existing code before scaffolding if a repository is later supplied. Do not overwrite an existing implementation based on this initial status record.
- No calendar deadline or delivery estimate has been confirmed. The Next Up list is dependency order, not a promised schedule.
