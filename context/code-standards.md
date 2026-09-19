# Code Standards

## General

- Keep modules small and focused on one responsibility. Separate HTTP handling, application workflows, domain calculations, database access, and external integrations.
- Follow the Aabhushan architecture: Next.js web frontend, independent Express API, Supabase Auth/PostgreSQL, and a separate pg-boss worker. Do not introduce Redis or a second business backend.
- Fix root causes rather than adding compensating workarounds. Keep changes scoped to the feature or defect being addressed.
- Treat inventory, invoices, payments, and Girvi as distinct domains. Share explicit services and contracts rather than reaching into another module's internal implementation.
- Keep invoice and Girvi calculations pure, deterministic, versioned, and independent of HTTP, React, database queries, and provider SDKs. Pass required rates, terms, and effective dates as inputs.
- Implement only confirmed business rules. Do not invent tax treatment, wastage conventions, interest periods, backdating behavior, or collateral-release rules to fill a missing requirement.
- Use names that describe business meaning and units, such as `netWeightGrams`, `ratePerGram`, `principalOutstanding`, and `interestReceived`. Distinguish sales from collections and principal repayment from interest income.
- Handle failures explicitly. Never hide a failed financial operation, silently change a quoted total, or report a transaction as successful before the server confirms it.
- Use structured Pino logs with request/event identifiers and redaction. Do not log access tokens, passwords, identity documents, or complete customer/payment payloads.
- Await promises or deliberately hand work to the durable queue. Do not start untracked background tasks from request handlers.
- Pin dependency versions through the lockfile, validate configuration at startup, and keep secrets out of source control. Document changes to architecture or calculation policies alongside the code.
- Use ESLint, Prettier, and TypeScript checks consistently. Test business outcomes and failure modes rather than mirroring implementation details; avoid brittle tests for trivial presentation changes.
- Require owner-approved fixtures for financial-rule changes and real-PostgreSQL verification for changes to locking, idempotency, isolation, or financial transactions. Use synthetic customer data in tests.

## TypeScript

- Enable strict mode throughout the workspace. Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` to make absent values explicit.
- Avoid `any`, broad type assertions, and non-null assertions that bypass validation. Accept unknown external input as `unknown` and narrow it before use.
- Validate request bodies, route/query parameters, environment variables, job payloads, and provider callbacks with runtime schemas. TypeScript types alone do not validate external data.
- Define API schemas and DTOs in `packages/contracts`; infer types from schemas where practical. Do not expose raw database rows as public API contracts.
- Represent money, rates, percentages, and weights as validated decimal strings at API boundaries. Use decimal.js for calculations and preserve PostgreSQL `NUMERIC` precision in the driver configuration.
- Never use `parseFloat`, `Number`, binary floating-point arithmetic, or `toFixed` as the financial calculation engine. Define rounding mode, scale, and calculation stage explicitly in domain policies.
- Use explicit units and rate periods. A field called `interestRate` without a monthly/annual period and calculation convention is insufficient for a Girvi contract.
- Use discriminated unions for supported pricing modes, payment methods, and job types. Check state transitions explicitly and make unsupported cases fail visibly.
- Distinguish business dates from timestamps. Use validated date-only values for accrual dates and UTC instants for events; apply `Asia/Kolkata` explicitly at business-date boundaries. Do not calculate calendar days by dividing elapsed milliseconds by a fixed day length.
- Define typed domain errors and translate them at the API boundary. Keep HTTP response objects and provider-specific exceptions out of pure domain functions.
- Pass typed transaction and authorization context explicitly to repositories and application services. Do not rely on mutable global state for the current user, organization, or branch.
- Keep browser-safe contracts separate from server-only modules. Prevent frontend imports of database clients, privileged SDKs, secrets, and worker implementations through package exports and lint rules.

## Next.js

- Default to Server Components for the page shell and non-interactive composition. Add `"use client"` at the smallest practical boundary for POS input, scanners, forms, dialogs, and browser APIs.
- Keep billing, payments, inventory mutations, and Girvi rules in the Express backend. Next.js Route Handlers and Server Actions may support web-specific integration but must not become alternate implementations of those workflows.
- Use the Supabase SSR integration for web sessions. Route protection improves navigation, but every API operation still requires independent backend authentication and authorization.
- Do not share-cache authenticated customer, invoice, Girvi, or staff data. Configure caching deliberately rather than relying on framework defaults, and ensure session-bearing responses cannot be served to another user.
- Use TanStack Query for client-side server state. Scope query keys by organization and relevant filters; clear sensitive cached data on logout or access-context changes.
- Keep React or Zustand state limited to UI concerns and unsent drafts. Do not duplicate authoritative stock, balances, or invoice status in a local store.
- Render server-provided quote breakdowns and finalized totals. Any local preview must use the shared calculation policy and remain subject to server validation.
- After a successful mutation, invalidate the specific affected queries. Do not optimistically mark an invoice paid, an article sold, or collateral released before server confirmation.
- Generate an idempotency key once for a financial submission and reuse it for retries of the same payload. A new intended operation receives a new key. Disabling a submit button is not duplicate-payment protection.
- Keep scanner input separate from ordinary text fields. Support the configured scan terminator, duplicate-scan feedback, unavailable-article errors, and manual lookup without globally swallowing keyboard events.
- Provide explicit loading, empty, validation, permission, conflict, and retry states. Preserve an unsent draft when safe, but do not queue offline financial posting.
- Poll only active operational views when necessary. Stop or reduce polling when the view is hidden; do not add WebSockets or Supabase Realtime without a demonstrated requirement.
- Keep private credentials out of `NEXT_PUBLIC_*` variables and rendered HTML. Do not put access tokens or sensitive customer data in URLs.

## Styling

- Use Tailwind CSS and the shared free Untitled UI component system. Extend existing components before creating inconsistent local alternatives.
- Define colors, typography, spacing, borders, and radii through shared tokens. Use CSS custom properties rather than repeated hardcoded brand colors; align tokens with `ui-context.md` when that document is established.
- Keep status colors semantic and pair them with readable labels or icons. Color alone must not distinguish paid, overdue, failed, or unavailable states.
- Right-align monetary and weight columns, use consistent decimal formatting and tabular numerals, and always show meaningful currency/unit labels.
- Keep financial precision intact underneath display formatting. A rounded visual label must never become the source of a later calculation.
- Make POS controls efficient for keyboard and scanner use, with clear focus states, labeled inputs, accessible dialogs, and adequately sized actions.
- Adapt screens to desktop and tablet use without hiding essential totals, balances, or confirmation details. Contain wide tables rather than allowing the whole page to overflow.
- Use shared print styles and approved page/label dimensions for invoices, receipts, and tags. Validate fonts, margins, barcode quiet zones, and readability on the actual printer.
- Do not assume browser printing is silent or that a correct preview proves a physical barcode is scannable. Keep print/reprint actions explicit and show failures clearly.

## API Routes

- Expose business operations through Express under `/api/v1`, with documented OpenAPI contracts. Keep routes thin: validate input, establish verified context, call an application service, and map its result to HTTP.
- Verify Supabase token signature, expiry, issuer, and audience. Resolve active staff membership and required permission before accessing protected resources. Never authorize from decoded claims alone or editable user metadata.
- Derive organization and branch access from verified membership. Treat supplied resource IDs as untrusted and verify their ownership on every read and write.
- Return only explicit DTO fields. Use consistent errors containing `code`, `message`, optional field errors, and `request_id`; exclude SQL, stack traces, and secrets from client responses.
- Use predictable status codes: `401` for invalid/missing authentication, `403` for denied permission, `404` for unavailable resources without leaking unauthorized existence, `409` for conflicts, and `422` for validly encoded but invalid business input. Use `400` for malformed input.
- Bound pagination, body sizes, upload sizes, filtering, and sorting. Allowlist sort fields and parameterize all database values; never interpolate client input into SQL identifiers or expressions.
- Require `Idempotency-Key` for financial operations, including invoice finalization, payments, refunds, Girvi activation/repayment, and collateral release. Bind the key to organization, operation, and canonical request hash; reject reuse with different input.
- Use record versions for editable drafts. Revalidate article availability and quote versions during finalization; return a conflict and refreshed quote when confirmation is required.
- Run financial workflows through one application-level transaction. Lock affected articles in a deterministic order, lock balances/accounts before allocation, and write the corresponding audit/outbox records in that same transaction.
- Do not call WhatsApp, render PDFs, or perform long-running external work while holding financial transaction locks. Return the committed result independently of document or notification processing status.
- Use bounded timeouts for external calls. Retry only operations with known safe retry semantics; an ambiguous provider send must not trigger uncontrolled duplicate messages.
- Verify WhatsApp webhook signatures against the raw body before normal parsing. Durably deduplicate accepted events, handle out-of-order statuses, and acknowledge promptly after durable receipt.
- Authorize document access before generating a short-lived signed URL. Restrict CORS to known web origins where cross-origin access is needed; CORS is not authentication for web or mobile clients.
- Keep liveness and readiness endpoints small and free of credentials or customer data. Apply request limits and operational rate limits appropriate to the deployment without introducing Redis by default.

## Data and Storage

- Store business records and metadata in the non-exposed `app` PostgreSQL schema; keep pg-boss-managed tables in their own schema. Browser clients must not read or mutate business tables directly through Supabase's Data API.
- Use separate migration, API, and worker database roles. Runtime roles must not own business tables, run as superusers, or bypass RLS; grant only necessary permissions.
- Set verified organization context transaction-locally for every business unit of work. Missing context must deny access, and pooled connections must never retain another request's organization scope.
- Include organization-aware foreign keys and database constraints for relationships, barcodes, document numbering, positive payment amounts, and valid weight relationships. Enforce aggregate allocation limits under locks, not with an unlocked read followed by a write.
- Store posted INR money as `NUMERIC(18,2)`, weights as `NUMERIC(14,4)`, and rates/percentages as `NUMERIC(18,6)` unless an approved requirement changes precision. Reject unsupported precision rather than silently truncating it.
- Preserve issued invoice snapshots and Girvi term/calculation versions. Rate or policy changes apply prospectively; they do not alter previously issued documents or active contractual terms.
- Keep financial and stock histories append-only at the business-operation level. Use linked compensating events for corrections rather than destructive edits. Record actor, timestamp, reason, and affected entity for sensitive changes.
- Keep saleable articles separate from Girvi collateral. Financial settlement and physical release are distinct records and authorization steps.
- Derive customer dues and Girvi balances from their respective ledgers or reconcile transactionally maintained projections. Keep sales, collections, refunds, principal, and interest measures separate.
- Write business events into the transactional outbox with unique event keys. Consumers must tolerate duplicate dispatch and worker restarts through business-level idempotency; do not rely only on queue deduplication.
- Keep job payloads small: identifiers and event versions rather than full customer documents. Validate jobs, scope database work explicitly, and recheck consent and balances before sending reminders.
- Bound worker concurrency and connection pools. Use tested direct/session-pooled TLS connections and explicit timeouts; do not assume transaction pooling supports every queue feature.
- Apply retention policies to successful jobs, failures, and operational attempts independently from financial/audit retention. Never prune permanent financial identity records just because cached HTTP responses expire.
- Store images, PDFs, and necessary identity files in private object storage. Persist object keys, checksums, ownership, and template versions in PostgreSQL; do not store large base64 payloads in rows.
- Validate upload size, content type, ownership, and destination path. Use deterministic generated-document keys, safe retry behavior, and scheduled cleanup for abandoned uploads. Avoid permanent public invoice or identity-document links.
- Add indexes for actual lookup/filter patterns, including barcode, unpaid due dates, active Girvi accounts, and pending outbox events. Review query plans and paginate before introducing caching infrastructure.
- Change schemas through reviewed migrations. Do not edit already-applied migration history or use automatic destructive schema synchronization in production. Use expand/backfill/contract changes when needed to keep deployments compatible.
- Test migrations and critical transactions against PostgreSQL, including concurrent sales/payments, rollback, scoped RLS, and retries after a lost response. Mocks alone do not prove database safety.
- Keep independent encrypted database and file backups, track freshness, and test restoration before launch. A database backup alone does not restore private object bytes; Supabase Free is not a substitute for a recovery plan.

## File Organization

| Path | Responsibility |
| --- | --- |
| `apps/web/` | Next.js pages, layouts, web auth integration, feature UI, client query hooks, scanner handling, and print views |
| `apps/api/` | Express bootstrap, versioned routers, HTTP validation/middleware, webhook endpoints, error mapping, and health endpoints |
| `apps/worker/` | pg-boss bootstrap, outbox dispatcher, recurring evaluators, job handlers, and graceful shutdown handling |
| `packages/contracts/` | Shared Zod schemas, DTOs, OpenAPI contracts, and generated API clients; browser-safe only |
| `packages/domain/` | Pure invoice/Girvi arithmetic, pricing policies, supported state transitions, and focused domain tests |
| `packages/application/` | Business services, permission-aware use cases, transaction orchestration, and repository interfaces where useful |
| `packages/db/` | Drizzle schema, repositories, reviewed migrations, database roles/RLS policies, and transaction helpers |
| `packages/integrations/` | WhatsApp, storage, PDF, and barcode adapters, with provider-specific error normalization |
| `packages/config/` | Typed environment parsing, shared configuration, and explicit public/server configuration boundaries |
| `tests/integration/` | Database-backed transaction, isolation, idempotency, concurrency, and job-recovery scenarios |
| `tests/e2e/` | Browser coverage for inventory-to-sale, collections/returns, and Girvi-to-release workflows |
| `docs/` | Project overview, architecture, code standards, approved calculation examples, API documentation, and operational runbooks |

- Use feature folders within applications, such as inventory, billing, payments, customers, and girvi. Keep shared components in deliberate shared locations rather than an unstructured utilities folder.
- Use kebab-case filenames, PascalCase React component/type names, camelCase functions/variables, and snake_case database identifiers. Follow Next.js reserved filenames and established conventions within each package.
- Keep generated files identifiable and regenerate them from their source definitions. Do not manually patch generated API clients or commit secrets, customer exports, backup archives, or production document files.
