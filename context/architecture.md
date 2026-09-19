# Architecture Context

## Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Frontend framework | Next.js App Router + React + TypeScript | Staff web application, navigation, authenticated page rendering, and print views |
| UI | Tailwind CSS + Untitled UI React (free, default purple) | Consistent responsive forms, tables, dialogs, and dashboards |
| Server state | TanStack Query | API fetching, mutation handling, query invalidation, and bounded polling |
| Forms and validation | React Hook Form + Zod | Form state and shared input contracts; backend validation remains mandatory |
| Local state | React state; Zustand only where needed for POS drafts | Temporary UI state, never authoritative inventory or financial balances |
| Backend | Node.js 24 LTS + Express 5 + TypeScript | Independent, versioned REST API for web and future mobile clients |
| API contracts | OpenAPI + Zod | Documented endpoints, validated DTOs, and generated client contracts |
| Authentication | Supabase Auth + `@supabase/ssr` for web | Staff authentication, web session integration, and tokens accepted by the backend |
| Database | Supabase PostgreSQL Free initially | Transactional business data, audit records, outbox events, and job storage |
| Database access | Drizzle ORM + node-postgres | Typed repositories, explicit SQL, transactions, and migrations |
| Financial arithmetic | decimal.js + PostgreSQL `NUMERIC` | Precise invoice, payment, weight, rate, and Girvi calculations |
| Background processing | pg-boss + separate Node.js worker | Durable PostgreSQL-backed jobs, reminder evaluation, document generation, and notification retries; no Redis |
| File storage | Private Supabase Storage buckets | Article images, collateral evidence, restricted identity documents, invoices, and receipts |
| Documents and tags | PDFKit + bwip-js + HTML print views | Generated PDFs, Code 128 article barcodes, and hardware-validated printing |
| Messaging | Official WhatsApp Business provider behind an adapter | Transactional messages and reminders, subject to account/template eligibility |
| Auth email | Custom SMTP provider configured in Supabase | Staff invitations and password recovery |
| Logging | Pino | Structured logs with request correlation and sensitive-data redaction |
| Repository | pnpm workspace | Shared contracts, domain code, and coordinated web/API/worker development |
| Deployment | Docker Compose + TLS reverse proxy on an always-on host | Independently restartable web, API, and worker processes; managed Supabase services remain separate |

## System Boundaries

- **`apps/web`** — Owns the Next.js frontend, web authentication integration, inventory screens, POS, customer views, Girvi screens, dashboard, scanner input, and print previews. Calls the Express API for business data and mutations. Route Handlers or Server Actions may support web-specific integration but must not become a separate implementation of business rules.
- **`apps/api`** — Owns Express startup, `/api/v1` routes, request validation, verified authentication, authorization, idempotency, provider webhooks, and HTTP error mapping. Delegates business operations to application services. The same API supports future mobile clients without depending on Next.js cookies or rendering.
- **`apps/worker`** — Owns pg-boss consumers, outbox dispatch, recurring reminder evaluation, PDF jobs, notification retries, and operational cleanup. Reuses the same application/domain packages as the API. Runs independently of browser sessions and HTTP request lifetimes.
- **`packages/contracts`** — Owns Zod request/response schemas, API DTOs, OpenAPI definitions, and generated API client types. Contains no secrets or privileged database access.
- **`packages/domain`** — Owns pure invoice and Girvi calculations, explicit decimal/rounding policies, state-transition rules, and domain invariants. Calculation behavior is versioned without HTTP or external providers.
- **`packages/application`** — Owns business use cases and transaction orchestration across inventory, invoices, payments, customers, and Girvi. Coordinates repositories, audit records, and outbox writes within a single unit of work where atomicity is required.
- **`packages/db`** — Owns Drizzle schemas, repositories, migrations, indexes, database roles, organization-scoped RLS, and transaction-local access context. Only server-side applications import this package.
- **`packages/integrations`** — Owns adapters for WhatsApp, private storage, PDF rendering, and barcode generation. Keeps provider-specific formats and credentials outside domain logic.
- **`packages/config`** — Owns validated environment configuration and explicit separation of public frontend settings from backend secrets.
- **`docs`** — Owns architecture decisions, API contracts, owner-approved calculation examples, setup instructions, and backup/recovery runbooks.

## Storage Model

**Business database:** Store organization, branch, membership, customer, catalogue, article, inventory movement, invoice, payment, return, Girvi, notification, document metadata, and audit records in a non-exposed `app` schema. The initial deployment serves one business and one branch. Organization/branch identifiers prepare the data model for expansion without claiming that a multi-tenant product is already implemented.

**Ownership and relationships:** Every business record carries `organization_id`; location-bound records also carry `branch_id`. Use UUID primary keys, organization-aware foreign keys, unique barcodes/document numbers, and constraints for valid weights and amounts. Cross-organization references must be rejected.

**Financial values:** Store posted INR amounts as `NUMERIC(18,2)`, weights as `NUMERIC(14,4)`, and rates/percentages as `NUMERIC(18,6)`, subject to confirmed business precision. Use decimal arithmetic for intermediate results. API monetary and weight values travel as decimal strings rather than binary floating-point numbers.

**Historical evidence:** Finalized invoice lines preserve customer/article details needed for the document, rates, calculation policy/version, charges, discounts, tax breakdown, and round-off. Girvi accounts preserve agreed terms, effective-dated financial events, and payment/settlement breakdowns. New defaults do not rewrite historical transactions.

**Inventory and collateral:** Saleable articles and customer-owned Girvi collateral use separate entities and lifecycles. Inventory movements track receipts, sales, returns, and adjustments. Collateral custody events track packets, locations, and physical release.

**Payments and balances:** Store payments, allocations, refunds, and linked reversals explicitly. Derive or transactionally maintain balances from these records. Keep sales receivables separate from Girvi principal and interest; cached summary fields are reconcilable projections, not independent ledgers.

**Background jobs:** pg-boss owns its separate `pgboss` schema. Business transactions write durable outbox events; a dispatcher enqueues jobs after commit. Notification records retain business delivery history independently of short-lived queue records. Bound queue concurrency and operational retention to protect the shared database.

**Private file storage:** Store article photos, collateral evidence, necessary identity documents, and generated PDFs in private Supabase Storage buckets. PostgreSQL stores object keys, ownership, checksums, and template versions rather than file blobs or permanent public URLs. File access requires backend authorization and short-lived signed access or controlled provider delivery.

**Client state:** Keep form state, scan input, and draft presentation in the browser. A locally retained draft is unsent and must be revalidated online. Do not treat cached stock, totals, customer balances, or offline writes as authoritative.

**Dates and time:** Store event instants as UTC `TIMESTAMPTZ`; store business dates as `DATE` and interpret them in `Asia/Kolkata`. Girvi day-count conventions and reminder schedules must use explicit business-date rules.

**Connections and privileges:** Use small, explicitly bounded API and worker connection pools over verified TLS. Prefer direct connections where supported or Supabase session pooling for the persistent processes. Use separate migration and restricted runtime roles; validate queue startup permissions and pooling compatibility against pinned package versions.

**Backups and capacity:** Supabase Free is the initial budget choice, not a recovery guarantee. Schedule independent encrypted database exports and separate object-file backups, verify restoration, and monitor database/storage consumption and worker health. Application hosting, messaging, SMTP, and backup storage remain separate operational dependencies.

## Auth and Access Model

- Staff sign in through Supabase Auth using invitation-based accounts; public self-signup is disabled. Customers are business records and do not receive Auth accounts in the MVP.
- The web application uses Supabase’s SSR session integration. Calls to Express carry a bearer access token. Future mobile clients use the same API authentication contract and platform-secure credential storage.
- Express verifies token signature, expiry, issuer, and audience against the project's JWKS (ES256). Decoding a token or trusting a locally loaded session is insufficient authentication.
- After verification, the backend resolves the user's active application membership and permitted organization/branch. Request-supplied roles, organization identifiers, and editable user metadata never grant access.
- Owner/admin, billing, inventory, and Girvi roles map to explicit permissions. Sensitive actions such as refunds, rate overrides, staff changes, identity-document access, and collateral release require appropriate server-side permission checks and audit records.
- Suspend access through the application membership check so a disabled staff member is blocked even while a previously issued access token remains valid. Page visibility alone is not authorization.
- Business tables are inaccessible to browser anon and authenticated database roles. All business reads and writes go through the API. Supabase Auth does not automatically authorize direct SQL connections.
- Non-owner runtime database roles use organization-scoped RLS as defense in depth. Set verified organization context transaction-locally for each unit of work; deny missing context and never reuse connection-global organization state across requests.
- Worker jobs load and validate their organization and target resource explicitly. Outbox dispatch and queue access use narrowly granted operational permissions. A job payload is not authorization to access arbitrary customer records.
- Database credentials, Supabase administrative keys, SMTP credentials, and WhatsApp secrets remain server-side. Public frontend configuration contains only intended public identifiers/keys. Private documents are authorized per request.
- WhatsApp callbacks use provider signature verification and durable deduplication, not staff bearer authentication. Custom SMTP supports staff invitations and recovery without granting staff access to the Supabase infrastructure dashboard.

## Invariants

- The Express backend is the authority for business rules and state changes. Next.js and future mobile clients use the same services; frontend calculations are previews only.
- Monetary, weight, and interest calculations use decimal arithmetic with explicit units, precision, and rounding. Do not convert database `NUMERIC` values to JavaScript `Number` for financial computation.
- An invoice uses the shop's approved calculation policy. Purity adjustments, wastage, making-charge bases, discounts, and taxes must be explicit; unsupported or unconfirmed rules must not be silently assumed.
- A physical article has one permanent unique identifier/barcode and cannot be sold twice concurrently. Finalization locks and revalidates article availability; scanning or saving a draft alone does not reserve stock.
- Invoice finalization atomically commits the invoice snapshot, stock changes, initial payment allocations, audit records, and outbox events. A failure before commit leaves none of those business changes partially applied.
- Finalized invoices, receipts, and posted financial history are not silently edited or deleted. Corrections use linked credits, returns, refunds, reversals, or controlled adjustments with retained evidence.
- Financial mutation endpoints require durable idempotency. Repeating the same operation returns its original result; reusing a key for different input is rejected. Concurrent payment allocation cannot overpay an invoice or allocate the same funds twice.
- Financial record identity and required audit evidence outlive operational queue retention. Cleanup of jobs must never remove the evidence needed to explain an invoice, payment, or loan.
- Girvi collateral remains separate from saleable inventory. An overdue account never automatically transfers ownership or makes pledged jewellery available for billing.
- Girvi interest follows the account's frozen agreed terms and effective-dated principal history. Reminder execution does not create interest charges, and changing defaults does not change existing agreements.
- Girvi repayment and settlement operations lock the account and preserve principal/interest allocation. Unsupported backdating is rejected rather than silently recalculating later posted history.
- Financial settlement and physical collateral release are separate events. Release requires a cleared balance or recorded authorized waiver, packet verification, staff permission, and acknowledgment.
- Long-running work and external provider calls do not run inside financial transactions. PDF generation or WhatsApp failure cannot invalidate an already committed sale or repayment.
- Outbox dispatch and worker execution tolerate retries and crashes. Consumers deduplicate business effects; queue delivery claims do not guarantee exactly-once external messaging. Ambiguous send outcomes are recorded for reconciliation rather than blindly resent.
- Reminder jobs recheck consent, outstanding balance, and account state immediately before sending. Provider acceptance and actual delivery are distinct statuses; duplicate or out-of-order callbacks cannot corrupt notification history.
- Access control applies to every API operation, file, repository query, and worker action. Organization scope comes from verified context, and pooled connections cannot leak context between operations.
- Sales, cash collections, customer dues, Girvi principal recoveries, and interest income remain distinct report measures. Refunds and credits cannot reduce a balance twice.
- Final financial writes require online server confirmation. On connectivity failure, show a retryable or unresolved state and use idempotent recovery; never present an unconfirmed payment or sale as successful.
- Private customer and identity data must not appear in public object URLs, frontend secrets, unredacted logs, or unnecessarily detailed reminder text.
- Deployments keep web, API, and worker independently restartable, with bounded database connections and monitored job backlog. PostgreSQL queues require running worker compute and do not make reminders available while the host is stopped.
- Exact dependency versions are pinned and compatibility-tested. Supabase Free quotas, backup limitations, and availability constraints are monitored; an independent restore drill is required before live use.
- Changes to financial calculation behavior require owner-approved fixtures and regression checks. Changes to transaction workflows require database-backed failure/concurrency verification before release.
