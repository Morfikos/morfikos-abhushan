# Progress Tracker

Update this file after every meaningful implementation change. Record completed work only when supported by an artifact or verification result. Keep proposed decisions separate from owner-confirmed business rules.

## Current Phase

Spec 04 inventory and article receiving is implemented and verified. Specs 01–03 remain implemented and verified.

**Last updated:** 20 September 2026 (Untitled UI brand ramp set to Aabhushan burgundy `#7e143a`).

SQL `0001`, `0002`, `0003`, and `0004` are applied on project `nhfmcosxqogxqvhdhzfz`. First owner `shikhar.nitsri@gmail.com` has an active membership. Custom SMTP and Auth dashboard settings (signup disable, redirects) are still outstanding.

## Current Goal

- Collect the shop's invoice and Girvi examples alongside foundation work so financial calculations can be implemented against confirmed rules.
- Configure custom SMTP and remaining Auth dashboard settings as separate environment work (`docs/supabase-auth-and-smtp.md`).
- Resume with `context/feature-specs/05-barcode-tagging-and-hardware.md` when requested.

## Completed

- Defined the MVP modules: inventory and per-article tagging, barcode invoicing, payments, customers, dashboard/reports, and Girvi with interest calculations and WhatsApp reminders.
- Created `aabhushan-mvp-architecture.md` covering system boundaries, module behavior, conceptual entities, API design, transactions, background jobs, deployment, recovery, and implementation sequence.
- Created `project-overview.md` using the supplied template, including goals, flows, scope, and success criteria.
- Created `architecture.md` using the supplied template, including stack, boundaries, storage, access control, and invariants.
- Created `code-standards.md` using the supplied template, including TypeScript, API, data, financial arithmetic, and organization conventions.
- Created and revised `ui-context.md`: Untitled UI free components with Aabhushan burgundy brand tokens (`#7e143a` as `brand-600`). Paid-template dependencies have been removed; required pages are original compositions built from free primitives.
- Created `ai-workflow-rules.md` using the supplied template, covering incremental work, missing requirements, protected files, documentation updates, and completion checks.
- Created this initial project progress tracker in the supplied format.
- Checked template heading order and document structure during artifact creation. This is documentation verification, not application testing or business-owner approval of every proposed rule.
- Created 16 implementation-ready feature specs in `context/feature-specs/` covering the MVP end to end. Schema fields, endpoints, and permission names in those specs are proposed for implementation and are not owner-approved business rules. Invoice and Girvi calculators remain blocked on shop examples.
- Implemented spec 01 workspace foundation: pnpm workspace (`apps/web`, `apps/api`, `apps/worker`, shared packages), typed config, Express health/version routes, Next.js placeholder with free Untitled UI (commit `c981a73bcd6b6c68d2a54070f20f020191212828`), worker lifecycle without jobs, Compose skeleton, empty `app` schema SQL, and `.env.example` files. Reconciled the architecture/code-standards UI row from shadcn/ui to free Untitled UI.
- Renamed the product from Aabhooshad to Aabhushan across docs, UI copy, env defaults, workspace package scope (`@aabhushan/*`), and the example database name `aabhushan_dev`. The local folder name was left unchanged.
- Loaded API CJS packages (`cors`, `express`, `pino`) through `createRequire` so ESM + `verbatimModuleSyntax` no longer treat their `export =` typings as missing default exports.
- Configured the Untitled UI React MCP in `.cursor/mcp.json` (unauthenticated, free components only) and recorded how later specs should use it.
- Fixed `isForwardRefComponent` to compare `$$typeof` with `Symbol.for("react.forward_ref")` instead of `Symbol.prototype.toString()`. The string match is not a stable identity check and threw on objects without `$$typeof`, so `Button` could skip `forwardRef()` icon components.
- Replaced default `React` imports in copied Untitled UI files with named/`import type * as React` imports so `@types/react`'s `export =` typings type-check.
- Linked `@aabhushan/application` into the workspace (`pnpm install`) so the API can resolve `StaffAccessRepository` after the package was declared in `package.json` without lockfile/symlink entries.
- Annotated Untitled UI `Input` RAC `className` callbacks with `GroupRenderProps` / `TextFieldRenderProps` so `isDisabled` and related render-prop fields are not implicit `any`.
- Implemented spec 02 staff authentication and access: invite-only screens, `@supabase/ssr` sessions, Express JWT verification (signature, expiry, issuer, and audience via the project JWKS / ES256), membership resolution for `GET /api/v1/me` and session introspect, suspended/missing membership `403`, logout query-cache clear, and original login/invite/recovery/expired/access-denied pages from free Input and Button. SMTP and public-signup disable remain documented configuration, not simulated success.
- Set `compilerOptions.typeRoots` to `./node_modules/@types` in API, worker, and config tsconfigs so `"types": ["node"]` resolves `@types/node` from each package instead of the workspace root.
- Mapped `pino` in API and worker `compilerOptions.paths` so the language service loads the package’s bundled `pino.d.ts` instead of looking for `@types/pino`.
- Mapped `@untitledui/icons` in `apps/web/tsconfig.json` `paths` to the package in `apps/web/node_modules` so the language service resolves the icon barrel.
- Mapped `next` and `next/*` in `apps/web/tsconfig.json` `paths` to `apps/web/node_modules/next` so the language service resolves App Router modules such as `next/navigation`.
- Removed the Vitest/Supertest unit and integration harness: all `*.test.ts` files, `vitest.config.ts` files, `test` scripts, `vitest`/`supertest` dependencies, and API `createApp` test injection (`staffAccessRepository`, `loggerDestination`). Verification is lint, typecheck, and build.
- Installed `@types/node` at the workspace root. API, worker, and config tsconfigs set `"types": ["node"]` and `typeRoots` to the root then package `@types` folders so `node:crypto` / `node:module` resolve without TS2688.
- Implemented spec 04 inventory and article receiving: `0004` categories/locations/articles/stones/files/movements/counts, decimal weight checks, unique article numbers from the shop sequence, barcode lookup with `sellable` only for `available`, adjustments with required reason, inspection release, reviewed stock counts, and Inventory list/detail/receive/count screens from free table, empty-state, loading-indicator, and file-upload primitives. Photograph bytes remain metadata-only until spec 13.
- Replaced standalone `NativeSelect` fields with app-owned `SelectField` (`apps/web/components/shared/select-field.tsx`) wrapping Untitled UI React Aria `Select`: themed popover below the trigger, trailing checkmark on the selected item, empty-value sentinel for “All …” options, and a client-mount placeholder to avoid RAC SSR hydration mismatches. Applied on inventory list/receive/detail/stock-count and settings selects. Vendor `NativeSelect` left in place for possible InputGroup use.
- Polished inventory list and receive UI (shop-floor pass): scan vs search with icons, More filters for purity/weight, distinct empty-catalogue vs filtered-empty states, whole-row article links, computed read-only net metal via `@aabhushan/domain`, collapsed optional receive sections, `InputDate` defaulted to Kolkata business date, field-level errors, sticky submit. Category/location create UI remains deferred.
- Restated Untitled UI `Input`/`Table` props (`value`, `onChange`, `children`, `id`, `href`, `selectionMode`, `className`) on the wrapper interfaces so the language service no longer drops React Aria fields on `inventory-list.tsx`. Scan Enter lookup is a void fire-and-forget from a sync `onKeyDown` handler. Mapped `react-aria-components` in `apps/web/tsconfig.json` `paths`.
- Rebuilt article detail as a three-column staff workspace (photograph + tag slot | specification grid | movement timeline) using only spec 04 fields; adjustment/inspection form kept in a card. No indicative pricing, fake tag print, or photo URLs.
- Inventory list tables: shared `ListTableFooter` (Page X of Y, N per page, Previous/Next), free modal + `ConfirmDialog`, row/bulk delete for mistaken receipts only (`available` + receipt-only movements + no stock-count lines), `DELETE /api/v1/articles/:id` and `POST /api/v1/articles/bulk-delete`, `deletable` on list items, footer also applied to settings staff/rates/audit tables. Inventory list table selection uses a local `"all" | Set<string | number>` type instead of importing `Selection` from `react-aria-components` (editor could not resolve that module in the feature file).
- Replaced Untitled UI default purple `--color-brand-50`–`--color-brand-950` with Aabhushan burgundy. `brand-600` is `#7e143a`; remaining steps are OKLab tints/shades of that hue. Semantic tokens (`bg-brand-solid`, focus ring, brand text) still consume the ramp. Vendor Untitled UI logo source was left unchanged.

## Feature Specifications

Specs are listed in intended implementation order. Feed them one by one; do not start application code until a spec is explicitly requested.

| Spec | File | Notes |
| --- | --- | --- |
| 01 | `context/feature-specs/01-workspace-foundation.md` | Implemented and verified |
| 02 | `context/feature-specs/02-staff-authentication-and-access.md` | Implemented and verified; live SMTP still configuration |
| 03 | `context/feature-specs/03-shop-settings-and-organization.md` | Implemented and verified; SMTP still configuration |
| 04 | `context/feature-specs/04-inventory-and-article-receiving.md` | Implemented and verified; saleable articles only |
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

- None. Spec 05 barcode tagging and hardware is next when requested.

## Verification — burgundy brand palette

Recorded 20 September 2026.

- `--color-brand-50`–`--color-brand-950` in `apps/web/styles/theme.css` now use Aabhushan burgundy. `brand-600` is `#7e143a` (`rgb(126 20 58)`). Semantic tokens still map primary actions, hover, focus, and subtle surfaces onto that ramp.
- Running `pnpm dev` at `http://localhost:3000`: computed `Sign in` button background is `rgb(126, 20, 58)`; wordmark and `text-brand-secondary` links are `rgb(109, 16, 49)` (`brand-700`). Confirmed on `/` and `/login`. `/auth/recovery` loaded the same primary button/link tokens. `/inventory` redirected to `/login` without a staff session, so signed-in nav selection was not visually rechecked.
- Vendor Untitled UI logo source under `components/foundations/logo/` still has hardcoded purple stops and is not rendered.

## Verification — inventory list `react-aria-components` import

Recorded 20 September 2026.

- Editor diagnostic on `inventory-list.tsx`: `Cannot find module 'react-aria-components'`. CLI `tsc` already resolved the package; the feature file did not need the RAC type import.
- Replaced `import type { Selection } from "react-aria-components"` with local `TableSelection = "all" | Set<string | number>` (React Aria selection shape; `string | number` not React `Key`, which includes `bigint`).
- `pnpm --filter @aabhushan/web typecheck` — passed.
- IDE lints on `inventory-list.tsx` — none.
- No browser pass: type-only change, no UI behavior change.

## Verification — inventory list footer, selection, and delete

Recorded 20 September 2026.

- Decision: hard-delete only mistaken receipts (`available`, receipt-only movements, no stock-count reference). Sold/under-review/unavailable/adjusted articles stay; UI disables delete with a reason.
- Domain helpers `articleIsMistakenReceiptDeletable` / `articleDeleteBlockedReason`; contracts include `deletable`, bulk-delete request/result; API routes wired; audit action `article.delete`.
- Shared `ListTableFooter` and `ConfirmDialog`; free Untitled UI `modal.tsx` pinned from public source (CLI returned no components).
- `pnpm --filter @aabhushan/web exec tsc --noEmit` — passed.
- `pnpm --filter @aabhushan/db verify:inventory` — passed (includes mistaken-receipt delete and sold/adjusted retention).
- Running `pnpm dev`: inventory list `GET /api/v1/articles` 200; row delete exercised as `DELETE /api/v1/articles/3038ce41-…` 204 followed by list refresh 200. IDE browser automation hit `/login` without staff credentials for a separate signed-in pass.

## Verification — article detail three-column layout

Recorded 20 September 2026.

- UI-only rewrite of `article-detail.tsx` plus helpers in `inventory-shared.ts` (`ageingDaysFromReceipt`, movement type label/dot). No API/schema/pricing changes.
- `npx tsc --noEmit -p tsconfig.json --incremental false` in `apps/web` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Signed-in staff session in the running `pnpm dev` browser reloaded `/inventory/4a2f1490-…` after Fast Refresh and received article, locations, and movements `200` responses. IDE-browser automation could not complete a signed-in visual pass (redirected to `/login` without credentials).

## Verification — inventory list language-service types

Recorded 20 September 2026.

- Editor diagnostics on `inventory-list.tsx` reported missing `Input` `value` and `Table` `id`/`children`/`selectionMode` even though CLI `tsc` passed. Cause: wrapper interfaces intersecting React Aria props with native HTML attributes, so those fields vanished in the language service.
- `npx tsc --noEmit -p tsconfig.json --incremental false` in `apps/web` — passed.
- IDE lints on `inventory-list.tsx`, `input.tsx`, `table.tsx`, settings, stock-count, login, and article-detail — none.
- No browser pass: types and a non-visual scan-handler split only.

## Verification — inventory list/receive UI polish

Recorded 20 September 2026.

- UI-only pass on `inventory-list.tsx` and `receive-article-form.tsx` (no API/schema/invariant changes). Category/location create UI deferred.
- Web depends on `@aabhushan/domain` for `netMetalWeightGrams` / `netMetalWeightIsPositive` / `kolkataBusinessDate`. `SelectField` accepts `tooltip` and `isInvalid`.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Browser E2E of empty/filtered/receive flows was not completed in this agent session: a prior `pnpm install` left the user's `pnpm dev` and an API listener on `:3001` in a stuck state the agent could not kill (`EPERM`), and the API process reported `NOT_READY` (database ping failed from the sandboxed agent network). Unauthenticated `/inventory` still redirects to `/login`.
- Workaround recorded: root `pnpm.overrides` pins `thread-stream` to `3.1.0` because `3.2.0` ships a `.claude/` path that Cursor's agent sandbox cannot create during install.
- Language-service fix for `@tanstack/react-query` (and related web deps): `apps/web/tsconfig.json` maps the package under `paths` with `baseUrl: "."`, and `.npmrc` `public-hoist-pattern` hoists `@tanstack/*`, `@types/*`, `next`, `react`, `react-dom`, and `@untitledui/*` to the workspace root so the IDE resolves them. `pnpm --filter @aabhushan/web typecheck` — passed; TypeScript program diagnostics on `inventory-list.tsx` — none.
- Seeded five sample saleable articles (`ART00001`–`ART00005`) with receipt movements for UI testing; article sequence advanced to `6`. Re-run locally with `pnpm seed:sample-articles` (script at `packages/db/scripts/seed-sample-articles.ts`).

## Verification — select dropdown UI (post spec 04)

Recorded 20 September 2026.

- Root cause: inventory Status/Category used `NativeSelect` (native `<select>`), so macOS drew an unthemed overlay on top of the trigger.
- Fix: `SelectField` over Untitled UI `Select` + `Select.Item` + `Popover` (`placement="bottom"`, `offset={4}`, light `bg-primary` / `shadow-lg`, default trailing checkmark).
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` — passed.
- Browser (temporary public `/select-preview`, removed after check): open Status — listbox `gapPx` ≈ 6 below trigger, `overlaps: false`, popover background `rgb(255, 255, 255)`, selected row trailing `svg` check; choose Sold — trigger label updates; no Next.js hydration issue badge after client-mount gate. Authenticated `/inventory` pass was blocked without a signed-in IDE-browser session.

## Verification — spec 04

Recorded 20 September 2026.

- Applied `0004_inventory_and_article_receiving` on project `nhfmcosxqogxqvhdhzfz`. `app` tables now include `catalogue_categories`, `storage_locations`, `articles`, `article_stones`, `article_files`, `inventory_movements`, `stock_counts`, and `stock_count_lines`. Seeded six categories and three locations.
- `anon` and `authenticated` have no `SELECT` on `app.articles`.
- `pnpm verify:inventory` — passed: missing organization context denied, wrong organization id denied, net-weight CHECK held, unique article number held, unavailable and `return_inspection` rows are not stored as available, adjustment without reason rejected. The verify transaction rolls back so it does not leave sample stock.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm build` — passed (packages, API, worker, Next.js). Inventory routes are dynamic staff routes: `/inventory`, `/inventory/receive`, `/inventory/[articleId]`, `/inventory/stock-counts/new`.
- `GET /health/live` — `200`. `GET /health/ready` — `200`.
- `GET /api/v1` — OpenAPI includes `/articles`, `/articles/lookup`, `/articles/{id}`, `/articles/{id}/adjustments`, `/articles/{id}/inspection-release`, `/articles/{id}/movements`, `/stock-counts`, `/catalogue-categories`, `/storage-locations`.
- Unauthenticated `GET /api/v1/articles`, `GET /api/v1/articles/lookup?barcode=TEST`, `POST /api/v1/articles` — `401 AUTH_INVALID` with `Cache-Control: private, no-store`.
- Browser: `/inventory` and `/inventory/receive` redirect unauthenticated users to `/login` (invitation-only, no create-account control).
- Lockfile scan: no `untitledui-pro`, `@untitledui/pro`, `shadcn`, or `lucide-react`.

Limitations still true: no custom SMTP; authenticated receive → search → detail was not exercised with an owner session in this browser pass (login required). Photograph object bytes are not stored in a private bucket yet (spec 13). Barcodes are not generated here (spec 05). Printer/scanner hardware remains unvalidated.

## Verification — spec 03

Recorded 20 September 2026.

- Applied `0003_shop_settings_and_organization` on project `nhfmcosxqogxqvhdhzfz`. `app` tables now include `shop_profiles`, `metal_rates`, `document_sequences`, `device_settings`, `reminder_settings`, and `audit_events`. Seeded profile, four sequences, device placeholders (`Enter` / 50×25mm / A5), and disabled reminders `10:00`–`18:00` `en`.
- RLS is enabled and forced on all `app` tables. Runtime roles `app_api` and `app_worker` are `NOBYPASSRLS`. `anon` and `authenticated` have no schema `USAGE` or `SELECT` on `app.shop_profiles`.
- `pnpm verify:org-context` — passed: missing organization context denied, wrong organization id denied, pooled connection isolation held, second organization insert rejected.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm build` — passed (packages, API, worker, Next.js). `/settings` is a dynamic staff route.
- `GET /health/live` — `200`. `GET /health/ready` — `200`.
- `GET /api/v1` — OpenAPI includes `/shop/profile`, `/shop/rates`, `/shop/sequences`, `/shop/devices`, `/shop/reminders`, `/staff`, `/staff/{id}/suspend`, `/audit`.
- Unauthenticated `GET /api/v1/shop/profile`, `/staff`, `/audit` — `401 AUTH_INVALID` with `Cache-Control: private, no-store`. Invalid bearer on `/shop/rates` and `/shop/sequences` — `401`.
- Browser: `/settings`, `/dashboard`, and `/inventory` redirect unauthenticated users to `/login` (invitation-only, no create-account control). `/signup` — `404`.
- Lockfile scan: no `untitledui-pro`, `@untitledui/pro`, `shadcn`, or `lucide-react`.

Limitations still true: no custom SMTP; authenticated Settings screens were not exercised with an owner session in this browser pass (login required). Staff invitations need the configured `SUPABASE_SECRET_KEY` and working Auth email. Printer values remain unvalidated placeholders. Billing daily rate *read* uses `rates.read`; writing rates stays `rates.write`.

## Verification — `node:crypto` with workspace `@types/node`

Recorded 20 September 2026.

- Removing `"types": ["node"]` cleared TS2688 on the tsconfig but left `import { randomUUID } from "node:crypto"` as TS2591 in the language service.
- Restored `"types": ["node"]` and listed workspace-root `../../node_modules/@types` first in `typeRoots` (API, worker, config). `@types/node` remains a root and API/worker/config dependency.
- `pnpm --filter @aabhushan/api typecheck` — passed.
- `pnpm --filter @aabhushan/worker typecheck` — passed.
- `pnpm --filter @aabhushan/config typecheck` — passed.
- Language-service diagnostics on `app.ts` and `apps/api/tsconfig.json` — none.

## Verification — API Node types without `types: ["node"]`

Recorded 20 September 2026.

- `"types": ["node"]` made the language service look for `@types/node` from the workspace root and report TS2688 on `apps/api/tsconfig.json` (and config).
- Added workspace-root `@types/node`, pointed `typeRoots` at both package and root `@types`, and removed the `types` pin so Node types load through `typeRoots` instead of a required type-library entry.
- `pnpm --filter @aabhushan/api typecheck` — passed.
- `pnpm --filter @aabhushan/worker typecheck` — passed.
- `pnpm --filter @aabhushan/config typecheck` — passed.
- Language-service diagnostics on those tsconfigs — none.

## Verification — removed unit/integration tests

Recorded 20 September 2026.

- Deleted all `*.test.ts` files and `vitest.config.ts` files under apps and packages.
- Removed `test` scripts and `vitest`/`supertest`/`@types/supertest` from workspace `package.json` files; removed `pnpm test` from the root scripts and README.
- Removed API `CreateAppOptions` (`staffAccessRepository`, `loggerDestination`) used only by tests.
- Updated architecture, code-standards, and AI workflow docs so they no longer prescribe a Vitest/Supertest harness.
- `pnpm install` — lockfile no longer lists `vitest` or `supertest`.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm build` — passed (packages, API, worker, Next.js).

## Verification — web `next/navigation` module resolution

Recorded 20 September 2026.

- `next` is installed in `@aabhushan/web` and `pnpm --filter @aabhushan/web typecheck` already passed, but the language service reported TS2307 on `import { useRouter } from "next/navigation"` because pnpm does not hoist `next` to the workspace root.
- Added `paths` entries for `next` and `next/*` in `apps/web/tsconfig.json` pointing at `./node_modules/next`.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- Language-service diagnostics on `recovery-confirm-form.tsx` and `apps/web/tsconfig.json` — none.

## Verification — web `@untitledui/icons` module resolution

Recorded 20 September 2026.

- `@untitledui/icons` was installed and typecheck passed, but the language service did not resolve the barrel from `input.tsx`.
- Added a `paths` entry in `apps/web/tsconfig.json` pointing `@untitledui/icons` at `./node_modules/@untitledui/icons`.
- `pnpm --filter @aabhushan/web exec tsc --noEmit -p tsconfig.json` — passed.
- `pnpm --filter @aabhushan/web test` — passed (7 tests).
- Language-service diagnostics on `input.tsx` and `tsconfig.json` — none.

## Verification — API/worker pino paths

Recorded 20 September 2026.

- `typeRoots` is `./node_modules/@types`, so the language service did not pick up `pino`’s bundled types (`export =` in `pino.d.ts`, not `@types/pino`) and reported TS2307 on `import type { DestinationStream } from "pino"`.
- Set `paths.pino` to `./node_modules/pino` in `apps/api` and `apps/worker`.
- `pnpm --filter @aabhushan/api typecheck` — passed.
- `pnpm --filter @aabhushan/worker typecheck` — passed.
- `pnpm --filter @aabhushan/api test` — passed (11 tests).
- `pnpm --filter @aabhushan/worker test` — passed (1 test).
- Language-service diagnostics on `app.ts`, `logger.ts`, `main.ts`, and worker pino imports — none.

## Verification — API Node typeRoots

Recorded 20 September 2026.

- `apps/api/tsconfig.json` listed `"types": ["node"]` without `typeRoots`, so the language service looked for `@types/node` from the workspace root and reported TS2688.
- Set `typeRoots` to `./node_modules/@types` in `apps/api`, `apps/worker`, and `packages/config`.
- `pnpm --filter @aabhushan/api typecheck` — passed.
- `pnpm --filter @aabhushan/worker typecheck` — passed.
- `pnpm --filter @aabhushan/config typecheck` — passed.
- Language-service diagnostics on those tsconfigs — none.

## Verification — spec 02

Recorded 20 September 2026. Real workspace scripts and local HTTP checks:

- `pnpm lint` — passed
- `pnpm typecheck` — passed
- `pnpm test` — passed (35 tests across packages and apps), including valid token, expired token, unsigned token, wrong audience, suspended membership, missing membership, uninvited signup blocked, and log redaction of bearer tokens
- `pnpm build` — passed (packages, API, worker, Next.js)
- `GET /health/live` — `200 {"status":"live"}`
- `GET /api/v1/me` without a token — `401 AUTH_INVALID`, `Cache-Control: private, no-store`
- `GET /api/v1/me` with an unsigned token — `401`
- `GET /api/v1` — OpenAPI v1 includes `/me` and `/auth/session/introspect`; no signup path
- Browser: `/login` has email/password and no create-account link; `/auth/recovery` does not claim delivery; `/auth/check-email` is instructions only; `/invite/accept` and `/auth/recovery/confirm` without a session go to `/auth/expired`; `/access-denied` is distinct from `/does-not-exist` 404; `/signup` 404s; `/dashboard` redirects unauthenticated users to `/login`
- Lockfile scan: no `untitledui-pro`, `@untitledui/pro`, `shadcn`, or `lucide-react`

Limitations still true: no custom SMTP, Compose not run as a production deploy. Invitation-accept display name is stored on Auth user metadata and copied into `staff_users` only when an invited membership is activated. Staff invite/suspend UI is spec 03.

## Verification — Supabase ES256 JWKS

Recorded 20 September 2026.

- Replaced HS256 `SUPABASE_JWT_SECRET` verification with `jose` `createRemoteJWKSet` against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, algorithm `ES256`, issuer `${SUPABASE_URL}/auth/v1`, audience `authenticated`.
- API and worker load gitignored `../../.env` via `tsx --env-file`.
- Local `.env` uses the project's session pooler `DATABASE_URL` (gitignored). `apps/web/.env.local` has the publishable key only.
- `pnpm --filter @aabhushan/config typecheck` and `pnpm --filter @aabhushan/api typecheck` — passed.
- `pnpm --filter @aabhushan/config lint` and `pnpm --filter @aabhushan/api lint` — passed.
- Live JWKS at `https://nhfmcosxqogxqvhdhzfz.supabase.co/auth/v1/.well-known/jwks.json` returns kid `122745ee-9df6-400d-89cb-6b09a6cf0ea2` with `alg: ES256`.

## Verification — first owner membership

Recorded 20 September 2026.

- Auth user `b43b635f-b92d-4580-95ff-0bad2a991c4a` (`shikhar.nitsri@gmail.com`, confirmed) has `app.staff_users` display name `Shikhar` and an active `owner` membership on org `11111111-1111-4111-8111-111111111111` / branch `22222222-2222-4222-8222-222222222222`.
- Local `DATABASE_URL` points at the `aws-0-ap-south-1` session pooler with TLS. Database password and `sb_secret_` were pasted in chat and should be rotated.

## Verification — development console logs

Recorded 20 September 2026.

- API/worker use `pino-pretty` in development (single-line, no pid/hostname). Production stays JSON.
- Request logs skip CORS `OPTIONS`, health probes, and successful `GET /api/v1/me` at `info`. Failures still log. `LOG_LEVEL=debug` prints the quieted traffic.
- Next.js webpack infrastructure logs are errors-only in `next dev`.
- `pnpm --filter @aabhushan/api typecheck` / lint — passed.
- `pnpm --filter @aabhushan/worker typecheck` / lint — passed.
- `pnpm --filter @aabhushan/web typecheck` — passed.

## Verification — live Supabase schema (MCP)

Recorded 20 September 2026 on project `nhfmcosxqogxqvhdhzfz`.

- Applied migrations `0001_init_schemas` and `0002_staff_authentication`.
- `app` tables: `organizations`, `branches`, `staff_users`, `staff_memberships`, `staff_invitations`.
- Seeded organization `11111111-1111-4111-8111-111111111111` (Aabhushan, Asia/Kolkata) and branch `22222222-2222-4222-8222-222222222222` (Main, active).
- `anon` and `authenticated` have no USAGE on schema `app` and no table grants. Organization-scoped RLS remains spec 03; tables currently have RLS disabled. PostgREST should keep exposing `public` only.
- `auth.users` is empty, so first-owner `staff_users` / `staff_memberships` rows were not inserted.

## Verification — input `className` render-prop types

Recorded 20 September 2026.

- `AriaGroup`/`AriaTextField` `className` callbacks in `apps/web/components/base/input/input.tsx` did not receive contextual types, so destructured `isDisabled` / `isFocusWithin` / `isInvalid` were implicit `any`.
- Annotated those callbacks with RAC `GroupRenderProps` and `TextFieldRenderProps & { defaultClassName }`.
- `pnpm --filter @aabhushan/web exec tsc --noEmit -p tsconfig.json` — passed.
- `pnpm --filter @aabhushan/web test` — passed (7 tests).

## Verification — `@aabhushan/application` module resolution

Recorded 20 September 2026.

- `apps/api` and `packages/db` declared `@aabhushan/application` in `package.json`, but `pnpm-lock.yaml` had no importer links, so `apps/api/node_modules/@aabhushan/application` was missing.
- Ran `pnpm install`. Lockfile now links the workspace package; API typecheck resolves `StaffAccessRepository`.
- `pnpm --filter @aabhushan/api typecheck` — passed.
- `pnpm --filter @aabhushan/application typecheck` — passed.
- `pnpm --filter @aabhushan/db typecheck` — passed.

## Verification — React default-import type fix

Recorded 20 September 2026.

- Confirmed `@types/react@19.3.0` uses `export = React` and has no ESM default export, so `import React from "react"` reports “has no default export”.
- `apps/web/components/base/buttons/button.tsx` now uses named `isValidElement` plus type-only `FC`/`ReactElement`/`ReactNode` imports.
- `apps/web/utils/is-react-component.ts` now uses `import type * as React from "react"`.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web test` — passed (5 tests).
- Language-service diagnostics on `button.tsx` and `is-react-component.ts` — none.

## Verification — forward-ref helper

Recorded 20 September 2026.

- Confirmed `apps/web/utils/is-react-component.ts` compared `component.$$typeof.toString()` to `"Symbol(react.forward_ref)"`.
- Confirmed React 19 `forwardRef()` uses `Symbol.for("react.forward_ref")`. A unique `Symbol("react.forward_ref")` stringifies the same way but is not a forward-ref component; missing `$$typeof` threw `TypeError`.
- `pnpm --filter @aabhushan/web test` — passed (5 tests, including 4 new forward-ref helper cases).

## Verification — spec 01

Recorded 20 September 2026. Real workspace scripts:

- `pnpm lint` — passed
- `pnpm typecheck` — passed
- `pnpm test` — passed (16 tests across packages and apps)
- `pnpm build` — passed (packages, API, worker, Next.js)
- `pnpm generate:client` — placeholder only, as specified
- `GET /health/live` — `200 {"status":"live"}`
- `GET /health/ready` — `503` with shared error shape when the database is unreachable
- `GET /api/v1` — OpenAPI v1 document, no business data
- Web `/`, `/login`, and unknown route — placeholder, login stub, and 404 with free Untitled UI button
- Lockfile scan: no `untitledui-pro`, `@untitledui/pro`, `shadcn`, or `lucide-react`

Limitations still true: no Supabase project, no SMTP, no live DB schema applied, no auth, Compose not run as a production deploy. `apps/web` leaves `exactOptionalPropertyTypes` off because the copied Untitled UI button is incompatible; packages/API/worker keep the workspace-strict flags.

## Next Up

- **Implementation — spec 05:** unique barcode generation, tag print/reprint, and hardware-validated lookup. Read `05-barcode-tagging-and-hardware.md` when requested.
- **Configuration — Auth/SMTP:** disable public signup, set site/redirect URLs, and configure custom SMTP. First Auth user and owner membership are already in place.
- **Business examples:** obtain representative invoices, pricing calculations, active/settled Girvi examples, and opening-data samples. Record approved rules and expected results before implementing calculators.
- **Foundation — workspace:** done in spec 01. Use `pnpm install` and the root scripts; copy `.env.example` before starting API/worker.
- **Foundation — data and identity:** `0001`/`0002`/`0003`/`0004` and the first owner membership are applied on the live project. Organization-scoped RLS is in place for runtime roles, including inventory tables.
- **Foundation — staff flow:** application code, schema, settings UI, and first owner membership are done. Remaining: disable public signup and configure custom SMTP in the dashboard.
- **Inventory and tagging:** article receipt, weights/purity/location, and movement history are done in spec 04. Remaining: unique barcode generation, tag print/reprint, lookup with printed tags, and reviewed stock checks against the shop's scanner and printer.
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
- **Detailed specifications:** proposed field-level tables and `/api/v1` contracts now live in `context/feature-specs/`. They still need review against shop examples and must not be treated as owner-approved calculation or credit policy. Earlier Jewellery OS LLDs must not be assumed compatible without review against the current Aabhushan scope.

## Architecture Decisions

- **Next.js frontend and independent Node.js/Express API:** explicitly requested so a future mobile client can reuse the same backend. Business rules stay outside web-only handlers/actions.
- **Supabase Auth and PostgreSQL Free initially:** explicitly requested. Keep quota/availability monitoring and independent recovery in the plan; separate hosting and integration costs still apply.
- **No Redis:** explicitly requested. The documented queue choice is pg-boss with a separate Node.js worker using PostgreSQL; this is a design selection, not an installed integration.
- **Modular monolith:** maintain clear inventory, billing, payments, customers, Girvi, and notification boundaries while allowing local database transactions and a small deployment footprint.
- **Initial single-business/single-branch operation:** use organization-aware records and permissions as preparation for growth; full multi-tenant onboarding and branch transfers are deferred.
- **Free-only Untitled UI:** explicitly confirmed. Use Untitled UI tokens and approved public Base/Application UI components, with Aabhushan burgundy (`#7e143a` as `brand-600` and generated 50–950 shades) instead of the library default purple. Inter, original page compositions, no PRO purchase or paid-template dependency. This supersedes the earlier Morfikos/shadcn direction.
- **Decimal arithmetic and historical snapshots:** preserve reproducible invoice and Girvi results. Exact commercial calculation policies remain open until confirmed with the shop.
- **Transactional posting and idempotency:** invoice, stock, initial payment, audit, and outbox writes commit together; repeat submissions cannot create duplicate financial operations.
- **Outbox and asynchronous side effects:** PDFs and WhatsApp messages run after commit, so provider failures do not undo valid sales or repayments. Consumers handle retries and ambiguous external outcomes explicitly.
- **Separate Girvi collateral:** pledged jewellery is not saleable inventory. Financial settlement and physical release are distinct recorded actions.
- **Manual payment verification:** cash/UPI/card/bank receipts are recorded by staff; payment gateways and automatic bank confirmation are deferred.
- **Private storage and backend authorization:** protect customer records and documents through verified staff permissions, scoped database access, and controlled file delivery.
- **Online financial operations:** no offline posting or automatic conflict reconciliation in v1. Polling and query invalidation are sufficient initially; realtime infrastructure is not required.
- **Managed database plus separately hosted processes:** web, API, and worker can share an always-on host with independent restarts. The exact provider and budget remain unresolved.

## Session Notes

- Spec 04 is implemented in this repository. Later specs from 05 onward are still documentation only until requested.
- Auth setup and SMTP remain configuration: `docs/supabase-auth-and-smtp.md`. Staff invite UI calls the API; missing SMTP still cannot be treated as a successful send.
- Untitled UI MCP is project-configured in `.cursor/mcp.json` without auth. Reload Cursor / enable the `untitledui` server in Settings → MCP if tools are missing. Free-only; no PRO login.
- `apps/web/utils/is-react-component.ts` has documented vendor patches: detect `forwardRef` via `Symbol.for("react.forward_ref")`, not `$$typeof.toString()`; import React types with `import type * as React from "react"`.
- Vendor `Button` uses named React imports (`isValidElement` and type-only `FC`/`ReactElement`/`ReactNode`), not a default `React` export. `@types/react` is `export =` and has no ESM default.
- Product name is Aabhushan (`@aabhushan/*`). The workspace directory may still use the older folder name.
- Resume with `05-barcode-tagging-and-hardware.md` when requested. Read the latest `ui-context.md` and `ai-workflow-rules.md` first.
- Read the latest `ui-context.md` and `ai-workflow-rules.md` before UI work. Free-only Untitled UI is a settled constraint and is not an open licensing question.
- Do not confuse Aabhushan's current MVP with the earlier broader Jewellery OS plan. Current choices include Next.js, Express, Supabase Auth/PostgreSQL, pg-boss, and no Redis; older Clerk/BullMQ/multi-branch assumptions do not carry over automatically.
- Keep undefined financial behavior out of implementation. Record pending rules here and proceed with independent foundation work while awaiting examples or decisions.
- For every meaningful implementation update, record the actual files/features changed, checks run and results, known limitations, and next unit. Move entries to Completed only after their acceptance conditions are evidenced.
- Preserve user changes and inspect existing code before scaffolding if a repository is later supplied. Do not overwrite an existing implementation based on this initial status record.
- No calendar deadline or delivery estimate has been confirmed. The Next Up list is dependency order, not a promised schedule.
