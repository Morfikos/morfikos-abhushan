# Progress Tracker

Update this file after every meaningful implementation change. Record completed work only when supported by an artifact or verification result. Keep proposed decisions separate from owner-confirmed business rules.

## Current Phase

Spec 15 (dashboard, reports, and exports) is implemented: `0021` reconstructs sales dues as of the range end, collections ignore non-posted outflows, and dashboard drill-through carries the selected range. Spec 14 notifications remain implemented in code; official WhatsApp credentials/templates stay configuration. Specs 01–13 remain implemented; spec 05 hardware drill remains incomplete. Staff screens use structure-matched skeleton loaders for data fetch (mutations keep Button isLoading). Counter-facing UX polish is in place: success toasts, daily metal-rates shell banner, two-way list URL filters with chips, notification nav attention badges, dirty leave guards, dashboard role/as-of copy, and staff-shell remount survival (session staff cache + QueryClient singleton + shell skeleton + `next/link` soft nav).

**Last updated:** 21 September 2026 (staff sidebar polish — blue theme).

SQL `0001`–`0021` are the current migration set (`0021` applied on the project database). Approved `girvi.v1` is seeded on `nhfmcosxqogxqvhdhzfz`. First owner `shikhar.nitsri@gmail.com` has an active membership.

## Owner-approved Girvi calculation policy — `girvi.v1`

Approved 21 September 2026 by the shop owner. This replaces the earlier "blocked on Girvi examples" state for calculation rules only; operational inputs (opening balances, identity records, WhatsApp) remain separate work.

| Decision | Approved rule |
| --- | --- |
| Rate period | Percentage **per 30 days**, labelled per 30 days on screens and the agreement. "Monthly" is not used. |
| Method | Simple interest on outstanding principal. Unpaid interest never becomes principal and never earns interest. |
| Day convention | Actual calendar days ÷ 30. Count the start date; exclude the repayment/settlement date from the preceding balance. |
| Minimum period | None. Same-day open and settle accrues ₹0. |
| Grace period | None for calculation. Reminder delays do not change the amount owed. |
| Extra charges | None in MVP. No late fee, penalty, storage charge, or overdue rate increase. |
| Allocation order | Outstanding interest first, remainder to principal. |
| Principal reduction | Effective on the repayment's business date; the reduced principal accrues from that date onward. |
| Rounding | Payable interest HALF_UP to ₹0.01. Settlement stays in paise; no automatic whole-rupee rounding. |
| Corrections | Posted financial events are immutable; corrections need an audited reversal/replacement workflow (deferred). |
| Backdating | Ordinary backdated and future-dated posting is disabled. Historical positions use the spec 16 opening-balance workflow. |
| Rate changes | The approved rate and policy version are frozen per account. Legacy accounts are not converted; their payoff APIs stay blocked until their terms are approved. |

Consequence the owner accepted explicitly: a 31-day period costs more than a 30-day period, and February costs less. Calendar months are not equal-cost.

## Current Goal

- Enter daily metal rates under Settings so POS drafts quote and finalize successfully.
- Configure custom SMTP and remaining Auth dashboard settings as separate environment work (`docs/supabase-auth-and-smtp.md`).
- Confirm scanner model, suffix, tag printer, and label millimetres, then run the spec 05 hardware drill.

## In Progress

- Spec 05 hardware drill: confirm scanner model, suffix, tag printer, and label size against physical tags.
- Spec 14 WhatsApp provider setup: credentials + local webhook registered. New Utility templates `aabhushan_*_v2` are PENDING (old Marketing names left stuck). Need approval, long-lived token, consent, and a pilot send (`docs/whatsapp-provider-setup.md`).

## Spec 15 assumptions (open questions — not owner-confirmed)

| Question | Implementation assumption until confirmed |
| --- | --- |
| Which staff roles see which tiles | `reports.read` is limited: owner/admin all tiles; billing sales+collections+dues+operations; inventory inventory+operations; girvi girvi+operations. Unauthorized sections are omitted from JSON. |
| Preferred export file layout | One CSV per type (sales by date, dues invoices, inventory availability, Girvi activity + accounts). |
| Opening balances on dashboard | Not a separate line. Disbursed is `disbursement` events only. |

## Spec 13 print decisions (owner-confirmed)

| Topic | Decision |
| --- | --- |
| Invoice/receipt paper size | From Settings `device_settings.invoice_paper_size` (`A4` / `A5` / `80mm`); separate from tag mm. Seeded default **A5**. |
| Bilingual printed output | Always **English + Hindi** labels; Noto Sans Devanagari embedded in PDFKit; HTML print uses Noto Sans Devanagari. |
| Identity documents at launch | Upload supported; **not required** to create/activate customers or Girvi |

Document PDF templates are `*.pdf.v2`. Ready docs with an older `template_version` show **Regenerate**. HTML print always uses the live paper setting.

## Completed

- Staff sidebar polish (blue theme): removed dead Search; `--color-bg-sidebar` tracks `bg-secondary`; brand-subtle selected nav; `isStaffNavActive` longest-prefix matching; collapsed Notifications badge + `next/link` on icon rail; collapse preference in `localStorage` (`aabhushan.staff.sidebarCollapsed`). `pnpm --filter @aabhushan/web typecheck` passed.
- Skeleton / shimmer structure alignment: Phase 0 shared recipes (`FormSkeleton` SectionCard tokens + sticky actions, `StaffDetailPageSkeleton` tabs/panels/`split3`, `StaffDirectoryLoading`, `StaffShellSkeleton` 280px/`lg`, `MetricTilesSkeleton` tone, `SettingsPageSkeleton`, `PrintDocumentSkeleton`); directory Suspense and features share `*FilterSkeleton` / `*DirectoryLoading` (customers, inventory, invoices, Girvi, payments metrics+list, notifications `StaffPageHeader`); forms/details/settings/stock-count/POS/dashboard/print aligned. Settings Suspense no longer `null`. `pnpm --filter @aabhushan/web typecheck` passed. Manual signed-in structure checklist still needs a staff session.
- Staff auth-gate navigation UX: `sessionStorage` staff snapshot + browser QueryClient singleton so layout remounts keep chrome; cold load uses `StaffShellSkeleton` instead of centered “Checking staff access…”; background `/api/v1/me` revalidate; same-origin `next/link` on sidebar nav and `Button` hrefs; print gate reuses the session cache when `inventory.write` is present. `pnpm --filter @aabhushan/web typecheck` passed.
- Extracted shared staff page recipes under `apps/web/components/shared/` (`StaffPageHeader`, `SectionCard`, `StickyFormActions` bar/inset, `DirectoryEmptyState` / `FilteredEmptyState` / `DirectoryTableSkeleton`) and documented them in `ui-context.md` Layout Patterns. Extended status helpers (`girviStatusBadgeColor`, `whatsappConsentBadgeColor`, `membershipStatusLabel`/`Color`). Migrated Customers/Invoices/Girvi/Inventory/Payments lists and receive/edit/detail article, customer create/profile, Girvi create/detail, and settings onto the recipes (Inventory scan toolbar and Payments metrics card kept as allowed divergences). Deleted local FormCard/SettingsCard/CardShell/StickySave; Girvi create left viewport-fixed sticky for in-flow `bar`. `pnpm --filter @aabhushan/web typecheck` and eslint on migrated files passed. POS/dashboard/documents unchanged.
- Staff UX counter polish: local `StaffToastProvider` on money/stock outcomes; `GET /api/v1/shop/rates/coverage` + dismissible shell banner; `useSyncedListFilters` + Active filters chips on invoices/payments/Girvi/inventory/notifications; `GET /api/v1/notifications/attention` sidebar badge; dirty leave guards on article edit, POS, and settings tabs; dashboard role-subset and as-of dues copy; tablet chart scroll / POS totals density. Deferred: hardware drill, Hindi UI, command palette, dark mode, WhatsApp template config. `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` passed.
- Added local structure-matched skeleton foundation (`apps/web/components/application/skeleton/skeleton.tsx`) and replaced fetch-time circular `LoadingIndicator`s across inventory, customers, invoices/POS, payments, Girvi, dashboard, settings, and notifications. Suspense list fallbacks use `StaffListPageSkeleton`. Dashboard uses `keepPreviousData` so period changes keep prior tiles. Mutations still use `Button isLoading`. `pnpm --filter @aabhushan/web typecheck` passed. Auth and print mutation paths unchanged beyond print-block skeletons.
- Replaced invoice/POS fetch `LoadingIndicator`s with structure-matched skeletons from `@/components/application/skeleton/skeleton` (list, detail, corrections, collections, POS draft shell, browse dialog, print). Button `isLoading` left unchanged. Page Suspense uses `StaffListPageSkeleton` columns=7.
- Tightened spec 15 reporting: `0021_sales_dues_as_of.sql` reconstructs open dues from invoices, credits, and allocations as of the range end; collections subtract only posted refunds and reversals. Dashboard drill-through passes the selected range and status into invoices, payments, Girvi, inventory, and notifications. Week and month center on the chosen day. `pnpm verify:reports` passed (range dues 300.00 while the same invoice’s cached due is 150.00; collections stayed 550.00 with a reversed refund excluded). Signed-in dashboard click-through still needs a staff session.
- Implemented spec 15 dashboard, reports, and exports: `0020` reporting views + `export_jobs`, role-limited tiles, Kolkata-range sales/collections/dues/Girvi/operations, small CSV inline / large queued export, and `pnpm verify:reports` (passed). Profit and statutory reporting remain out of scope.
- Added shared `StaffBackLink` (`link-gray` + `ArrowLeft`) and wired it above titles on article, customer, invoice, Girvi detail, POS, and matching create/edit forms; removed competing action-row “Back to list/directory” buttons. Error-state secondary recovery buttons kept. IDE browser signed-in visual pass still needs a staff session.
- Fixed article detail **Movement history** half-clipped timeline dots: `overflow-y-auto` moved off the bordered `<ol>` onto a wrapper with `ml-2` so full circles remain visible. CSS fixture verified before=`fullVisible:false` / after=`fullVisible:true`. Signed-in `/inventory/[id]` visual pass still needs a staff session in the IDE browser.
- Defined the MVP modules: inventory and per-article tagging, barcode invoicing, payments, customers, dashboard/reports, and Girvi with interest calculations and WhatsApp reminders.
- Created `aabhushan-mvp-architecture.md` covering system boundaries, module behavior, conceptual entities, API design, transactions, background jobs, deployment, recovery, and implementation sequence.
- Created `project-overview.md` using the supplied template, including goals, flows, scope, and success criteria.
- Created `architecture.md` using the supplied template, including stack, boundaries, storage, access control, and invariants.
- Created `code-standards.md` using the supplied template, including TypeScript, API, data, financial arithmetic, and organization conventions.
- Created and revised `ui-context.md`: Untitled UI free components with Aabhushan burgundy brand tokens (`#7e143a` as `brand-600`). Paid-template dependencies have been removed; required pages are original compositions built from free primitives.
- Created `ai-workflow-rules.md` using the supplied template, covering incremental work, missing requirements, protected files, documentation updates, and completion checks.
- Created this initial project progress tracker in the supplied format.
- Checked template heading order and document structure during artifact creation. This is documentation verification, not application testing or business-owner approval of every proposed rule.
- Created 16 implementation-ready feature specs in `context/feature-specs/` covering the MVP end to end. Schema fields, endpoints, and permission names in those specs are proposed for implementation unless marked owner-approved. Invoice `invoice.v1` rules are owner-approved; Girvi calculators remain blocked on shop examples.
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
- Implemented spec 05 barcode tagging: permanent unique Code 128 on `articles.barcode` (idempotent assign, no generation-history table), `tag_print_events` print/reprint audit, bwip-js SVG adapter in `packages/integrations`, dedicated `ScanField` with device terminator/suffix, chrome-less `/print/tags` HTML tag view at configured millimetres, batch print from list selection, reprint with required reason, lookup errors Unknown barcode / Unavailable / sold POS rejection. Preview does not record a print; `hardware_validated_at` stays null.
- Fixed tag print overflow so one article stays on one `@page` (smaller Code 128 bars, CSS-scaled SVG, print-only zero gaps/margins, `break-inside: avoid`). Batch chrome shows configured millimetres as unvalidated and asks for physical confirm after `afterprint`.
- Polished `/print/tags` screen chrome: sticky toolbar (title, count, size chip, warning), compact physical-confirm step, grey stage with screen-only 2/3-column stamp grid and captions. Printed output stays black/white one-per-page at configured millimetres.
- Implemented spec 06 customers and consent: `0007` customers/consents/identity-file metadata, E.164 phone uniqueness per organization, WhatsApp consent per purpose (grant requires a phone), identity-file GET behind `identity_documents.read`, directory/profile/create UI from free table/avatar/tabs/empty-state, and a POS-style customer combobox. No customer Auth, no WhatsApp send, no sales/Girvi balances on the customer row.
- Polished customers directory UX: removed the POS combobox from `/customers`, hide the name/phone search card when the directory is empty (inventory-style empty vs filtered-empty), and fixed Create customer supporting text to “Add a customer for billing or Girvi.” Combobox remains for POS/Girvi.
- Polished New customer form: Contact and WhatsApp cards, per-purpose consent toggles (matching profile), live E.164 phone hint, collapsed optional email/address/notes, sticky Save/Cancel, discard confirm on dirty Cancel/Back, Toggle `w-full` so hints wrap. Combobox create modal scrolls.
- Added `pnpm seed:sample-customers` to insert five idempotent demo customers (varied WhatsApp consent) for local directory/UI testing.
- Added `pnpm seed:sample-unpaid-invoices` to create two finalized unpaid invoices (articles `SEEDDUE01` / `SEEDDUE02`) for Anjali Devi so Payments → Record payment can be exercised without manual POS credit sales. Idempotent; does not consume `ART0000N` sample stock.
- Fixed Record payment allocations sync: rebuild on `customerId` + `statement.dataUpdatedAt` + sync epoch so cache hits cannot leave an empty invoice list under a non-zero Sales due badge; honest empty vs due>0 messaging; Walk-in excluded from the collection combobox; tenders reset on customer change; statement invalidation awaited after a successful post.
- Payments period filters: All (default) / Today / Week / Month / Custom drive tiles and list together; API from/to bounds on payments list and collections; pinned Untitled UI date-range picker.
- Invoice list period + status filters: same All/Today/Week/Month/Custom on `business_date`, Draft/Finalized status, shared `period-bounds` + contracts `business-date-range` helpers.
- Inventory list metal filter: optional Gold/Silver on `GET /articles` and primary toolbar SelectField (All / Gold / Silver).
- Customer list directory filters: Active (default Active) / Type (All / Named / Walk-in) / WhatsApp (All / Granted / Revoked / None); `is_active` optional for All; `whatsapp_consent` list query; `is_walk_in=false` for named customers; POS/combobox pass `isActive: true` explicitly.
- Girvi list directory filters: Status default Active, Overdue (All / Overdue), Maturity period (All/Today/Week/Month/Custom with future week/month ends); `is_overdue` list query; existing `maturity_from`/`maturity_to`. Settled option labelled **Settled · awaiting release**.
- Girvi shop-floor polish: customer Girvi tab (`CustomerGirviPanel`, `girvi.write`-gated); draft edit (`PATCH` + `/girvi/:id/edit`) and discard (`DELETE` draft-only); packet **Move packet** → `POST /custody-moves` (`location_changed`); collateral photos via private `shop-assets` (`POST/GET …/collateral/:itemId/files`); activate requires ≥1 photo per item **and** a positive interest rate (% per 30 days); create requires the rate; bucket docs raised to 5 MB (logo still 1 MB).
- Implemented spec 07 invoice calculation engine with owner-approved `invoice.v1`: decimal helpers, `calculation_policies` migration `0008`, pure `quoteInvoice` (metal → making → wastage → stones → discounts → 3% GST → ₹1 round-off), fixtures under `packages/domain/fixtures/invoice-examples/`, `POST /api/v1/invoices/quote`, and `pnpm seed:calculation-policy`.
- Added desktop staff sidebar expand/collapse: session-only React state, icons-only 72px rail with tooltips, ChevronLeft/Right toggle; mobile drawer stays full labels.
- Staff sidebar rail uses `#fafafa` (`bg-sidebar`); active nav item uses `bg-quaternary` with darker hover so it stays visible on the rail.
- Replaced the brand ramp with Aabhushan blue: `brand-600` is `#2c5ce6` (`rgb(44 92 230)`); 50–950 are OKLab tints/shades of that hue in `apps/web/styles/theme.css`.
- Inventory list filter bar unified: flat `ScanField` (no brand callout), one toolbar row with Scan/Search/Status/Category and More filters/Clear aligned to field bottoms.
- Article detail visual polish: header secondary line (category · metal · purity · location), sectioned Specification with weight strip, unified photo+tag left rail, scrollable movement timeline, full-width Adjustment.
- Receive article form visual polish: Identification and Weights section cards, Gross/Non-metal 2-col with Net full-width strip, optional accordions with chevrons, sticky action bar.
- Customer directory list polish: search folded into Directory card (`max-w-md`), short WhatsApp badges (Granted/Revoked/None), mono phone, truncated email, row ChevronRight.
- Staff list pages chrome synced: shared `ListSearchToolbar`; Customers/Invoices/Inventory use Header+badge+in-card toolbar; invoice orphan search removed; inventory filters folded into Articles card.
- Customer profile visual polish: Customers breadcrumb, short WhatsApp badge, Contact/Details/WhatsApp/Identity section cards (`max-w-3xl`), 2-col consent toggles, sticky Save, compact identity empty.
- Settings pages visual polish: free Tabs nav; section cards + sticky saves on form tabs; Staff/Rates invite cards + TableCard badges; numbering header row; humanized audit actions.
- Implemented spec 08 POS billing and finalization: `0009` invoices/lines/payments/allocations/idempotency/outbox; `0010` line/invoice pricing inputs; draft CRUD + quote with making/wastage/stones/discounts; atomic finalize with article locks, stale `quote_version` 409, invoice numbering, sale movements, optional tenders, audit, outbox, Idempotency-Key; staff POS UI with Pricing modal and invoice discount controls. Live sale requires approved `invoice.v1` plus an applicable metal rate.
- POS billing UX speed: available-article search combobox (`PosArticleSearch`), scan autofocus/refocus after draft mutations, **Pay grand total** tender fill, missing-rate banner → `/settings?tab=rates` (Settings reads `tab` query), inline making Apply on line rows via existing `line_pricing` PATCH.
- POS UX wins: `0011` walk-in customer (`is_walk_in`) + POS Walk-in button; `0012` making_charge_defaults by metal+purity with Settings CRUD and apply on draft add; finalized **New sale**; explicit Finalize disabled reasons; Unknown/Sold/Unavailable scan copy; `STALE_QUOTE` refetch + reconfirm.
- POS quick receive & add: `POST /invoices/drafts/:id/quick-articles` (`billing.write`) creates minimal `available`+`receipt` article and adds it to the draft in one transaction; POS **Receive & add** dialog.
- POS billing visual polish: one Sale `TableCard` (header + count badge, in-card customer/scan/search toolbar, EmptyState); dense lines (article caption, horizontal making Apply, icon Pricing/Remove, No rate badge); totals rail with dominant grand total and tidy discount Apply; ScanField `hint={null}` on POS only.
- POS browse articles batch add: replaced article ComboBox with **Browse articles** modal (available-only checkboxes, search, Load more, Add N via batch `add_article_ids`, cap 50); Receive & add from toolbar and modal footer; scan remains primary.
- POS browse articles open-list fix: `useInfiniteQuery` (no wipeable local `items` mirror); IntersectionObserver auto-load; empty vs “More available — Load more” when draft exclusions hide the page.
- POS customer field polish: draft `customer_id` PATCH on select/Walk-in/New; combobox deferred search + infinite Load more + Walk-in pin + selected sync; toolbar **New customer** POS-light create; Walk-in badge; Create list row removed from combobox.
- POS customer clear: trailing `XClose` clears local selection/search (no null PATCH); scan/finalize blocked until re-select.
- POS making value polish: method switch resets value + unit labels; client validate (percent 0–100); Apply/Save gated; `percentSchema`/`assertPercent` capped at 100; Select/table debug ingest removed.
- Implemented spec 09 payments and outstanding balances: `0013` `app.receipts` (unique receipt number and one receipt per payment per org) plus collection/allocation indexes, RLS, and grants; `POST /api/v1/payments` with required Idempotency-Key, invoice locks in id order, overpayment rejection, split tender spread across allocations, receipt numbering from `document_sequences`, audit, and post-commit outbox `receipt.requested`; `invoices.amount_paid_inr` / `amount_due_inr` rewritten from the allocation sum in the same transaction; payment read/list, invoice payments, customer sales statement, and daily collections by method; POS finalize tenders now issue receipts through the same tables. Staff UI: Payments workspace (daily collections tiles + filtered list), Record payment dialog, payment detail, invoice **Collections** card, customer **Sales** tab. Overpayments and advances stay rejected; due dates are not modelled.
- Implemented spec 10 returns, refunds, and reversals: `0014` `invoice_returns` and `credit_notes` plus `payments.kind` / `reverses_payment_id`, CN and RFD sequences, and inspection-gated `return_in` restock. Accept-return, refund, and reversal require Idempotency-Key; finalized invoice amounts and line snapshots stay unchanged; credit reduces due; refunds and reversals are new compensating payments (`refunds.approve`); POS cannot sell `return_inspection` stock. Staff UI: invoice **Return article** + **Corrections**, payment **Refund** / **Reverse**, customer Sales credits vs refunds.
- Implemented spec 11 Girvi accounts and collateral: `0015` `girvi_accounts`, `girvi_collateral_items` / `_files`, `girvi_custody_events`, `girvi_financial_events` (disbursement only); draft create/patch; idempotent activate with GRV numbering, frozen terms snapshot, custody received events, audit, and outbox; unique in-custody packet numbers; overdue is presentation-only (never shop stock); `quoteGirviInterest` fails closed until spec 12; staff Girvi list/new/detail with Collateral/Terms/Statement/Payments/History tabs. Collateral is never an `articles` row.
- Implemented spec 12 Girvi interest, settlement, and release on owner-approved `girvi.v1`: `0016` `girvi_calculation_policies`, `repayment` / `settlement` / `waiver` / `opening_balance` event types with `method` / `notes` / `posting_sequence`, rebuildable `principal_outstanding_inr` and `interest_outstanding_inr` projections, and `girvi_release_events`; pure `computeGirviStatement` / `allocateGirviRepayment` using integer calendar-day counting (never `ms / 86400000`) with seven approved fixtures in `packages/domain/fixtures/girvi-examples/`; `GET /statement`, `POST /repayments`, `POST /settlement-quote`, `POST /settle`, `POST /release` with locks and required Idempotency-Key on the three posting routes; fail-closed `CALCULATION_RULE_UNSUPPORTED` without an approved policy; backdating, future dating, overpayment, and stale splits rejected; waivers limited to owner/admin with a recorded reason; release needs `girvi.release`, a cleared balance, a matching packet check, and both acknowledgements; staff Statement tab with an as-of date, Payments tab splitting interest from principal, and Record repayment / Settle account / Release collateral dialogs; `pnpm seed:girvi-calculation-policy` plus `pnpm verify:girvi-settlement`. Settlement and release stay two rows, and released collateral never becomes inventory.
- Implemented spec 13 documents, storage, and print: `0017` `stored_objects` / `documents`; reuse private `shop-assets` adapter with signed upload grants and short-lived access URLs; PDFKit invoice/receipt generation on the worker from outbox `invoice.finalized` / `receipt.requested` (sale survives PDF failure); abandoned-upload cleanup; `GET /invoices/:id/print` + chrome-less `/print/invoices/:id`; invoice document status badges with Retry; `pnpm verify:documents`.
- Spec 13 paper + bilingual follow-on: Settings `invoice_paper_size` drives PDF + HTML (A4/A5/80mm thermal layout); EN+HI labels; Noto Sans Devanagari in PDFKit (`packages/integrations/assets/fonts`) and print layout; templates `*.pdf.v2`; Regenerate for failed or outdated ready docs.
- Spec 13 improvements: shared `DocumentStatusCard`; receipt print DTO + `/print/receipts/:paymentId`; grant→PUT→confirm for article / identity / Girvi collateral (`0018` credit_note_pdf / refund_pdf); worker consumes `girvi.released` / `credit_note.requested` / `refund.requested`; signed-URL log redaction; extended `verify:documents`.
- Article edit, photo replace, and re-tag: `/inventory/:id/edit` dedicated form (`PATCH` identity/weights/source/location + optional `uploadStaffFile`); sold pieces have no Edit control and identity/weight patches stay rejected; `insertArticleFileLink` replaces (does not append) `article_files`; detail **Edit article** for unsold write staff; after stamp-field save offer Print tag / Reprint tag (same barcode). `pnpm verify:inventory` covers available PATCH, sold identity reject, and one-file photo replace.
- Article photograph UX: detail shows dropzone only when no photo; edit uses **Replace photograph** / **Cancel replace** to gate the dropzone; upload still commits on Save.
- Tag print / reprint UX: detail shows **Print tag** or **Reprint tag** (not both) gated on barcode; post-edit print prompt only when metal/purity/weights change; list Print vs Reprint by homogeneous selection with shared reprint reason; `/print/tags` titles and return path follow `kind`.
- Implemented spec 14 notifications and WhatsApp: `0019` `notifications` / `notification_webhook_events` + `pgboss` schema grants; finance writes companion `whatsapp.send.requested` outbox rows; worker pg-boss dispatches sends and evaluates reminders inside the Settings send window with consent/balance rechecks; Meta Cloud adapter never fakes delivery; `GET/POST` notifications + signed WhatsApp webhook; staff `/notifications` table with visibility polling and safe retry; `docs/whatsapp-provider-setup.md`; `pnpm verify:notifications`.

## Feature Specifications

Specs are listed in intended implementation order. Feed them one by one; do not start application code until a spec is explicitly requested.

| Spec | File | Notes |
| --- | --- | --- |
| 01 | `context/feature-specs/01-workspace-foundation.md` | Implemented and verified |
| 02 | `context/feature-specs/02-staff-authentication-and-access.md` | Implemented and verified; live SMTP still configuration |
| 03 | `context/feature-specs/03-shop-settings-and-organization.md` | Implemented and verified; SMTP still configuration |
| 04 | `context/feature-specs/04-inventory-and-article-receiving.md` | Implemented and verified; edit page + photo replace |
| 05 | `context/feature-specs/05-barcode-tagging-and-hardware.md` | Implemented; hardware drill still required |
| 06 | `context/feature-specs/06-customers-and-consent.md` | Implemented and verified; no customer Auth |
| 07 | `context/feature-specs/07-invoice-calculation-engine.md` | Implemented; owner-approved `invoice.v1` fixtures |
| 08 | `context/feature-specs/08-pos-billing-and-finalization.md` | Implemented; POS quick receive & add + prior UX wins |
| 09 | `context/feature-specs/09-payments-and-outstanding-balances.md` | Implemented and verified; overpayment rejected, no advances |
| 10 | `context/feature-specs/10-returns-refunds-and-reversals.md` | Implemented and verified; inspection before restock |
| 11 | `context/feature-specs/11-girvi-accounts-and-collateral.md` | Implemented and verified; interest stub only |
| 12 | `context/feature-specs/12-girvi-interest-settlement-and-release.md` | Implemented and verified on owner-approved `girvi.v1` |
| 13 | `context/feature-specs/13-documents-storage-and-print.md` | Implemented; paper size from Settings + bilingual EN+HI |
| 14 | `context/feature-specs/14-notifications-and-whatsapp.md` | Implemented; provider/templates still configuration |
| 15 | `context/feature-specs/15-dashboard-reports-and-exports.md` | Implemented and verified; no profit/statutory reporting |
| 16 | `context/feature-specs/16-opening-imports-and-pilot-readiness.md` | Imports, backups, launch |

Customer cart/checkout and offline synchronization were not specified as product features: they are out of MVP scope. Connectivity failures are retryable/unresolved online states only.

## Verification — Spec 15 dues as-of and drill-through

Recorded 21 September 2026.

- Migration: `packages/db/sql/0021_sales_dues_as_of.sql` applied on project `nhfmcosxqogxqvhdhzfz`.
- Dues tile and dues CSV use `app.sales_dues_as_of`. A payment or credit after the range end does not change that range’s due. As of Kolkata today, reconstructed dues matched cached open dues.
- Collections view counts refunds and reversals only when `status = 'posted'`.
- Dashboard links pass `from`/`to`, invoice `due=1`, Girvi `status`/`overdue`, notification status, and inventory `status=available`.
- `pnpm verify:reports` — passed: sales net 850.00, collections 550.00 (reversed refund excluded), dues 300.00 as of 1999-03-05 versus cached 150.00 after the later payment and credit.
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- Signed-in `/dashboard` click-through still needs a staff session in the IDE browser.

## Verification — Spec 15 dashboard, reports, and exports

Recorded 21 September 2026.

- Migration: `packages/db/sql/0020_reporting_views_and_exports.sql` applied on project `nhfmcosxqogxqvhdhzfz` (views, indexes, `export` owner type, `export_jobs`).
- API: `GET /api/v1/reports/dashboard` (and sales/collections/inventory/girvi/exports). Dashboard omits unauthorized sections. `Cache-Control: private, no-store`.
- UI: `/dashboard` period Today/Week/Month/Custom, role-limited tiles, drill-through, CSV export. Interest tile is Unavailable (not ₹0) when any active account policy is unapproved.
- Worker: polls pending `export_jobs` and writes a private CSV with a short-lived signed URL.
- `pnpm verify:reports` — passed (rolled back 1999-03 fixtures): sales net 850.00, collections 550.00, dues 400.00, Girvi disbursed 5000.00 / recovered 1000.00 / interest received 200.00. Billing omits girvi+inventory JSON.
- Signed-in `/dashboard` visual pass still needs a staff session in the IDE browser.

## Verification — Spec 13 documents, storage, and print

Recorded 21 September 2026.

- `0017_documents_storage_and_print.sql` applied on project `nhfmcosxqogxqvhdhzfz`.
- Reuses private `shop-assets` adapter; upload grants + confirm + signed access; worker polls outbox for invoice/receipt PDFs; abandoned unconfirmed uploads cleaned after 1h.
- Invoice detail shows Pending/Ready/Failed document badges with Print / Download / Retry; `/print/invoices/:id` is chrome-less A4.
- `pnpm verify:documents` — passed: finalized invoice stays finalized when document is `failed`; retry is idempotent on `source_event_key`.
- `pnpm --filter @aabhushan/{contracts,application,db,integrations,api,worker,web} typecheck` — passed.
- `pnpm --filter @aabhushan/{web,api,worker} lint` — passed.

Open product questions remain: identity-required-at-launch; physical printer drill for invoice/receipt paper stock.

## Verification — Spec 13 improvements

Recorded 21 September 2026.

- `0018_credit_note_and_refund_document_types.sql` applied (credit_note_pdf, refund_pdf).
- Receipt print: `GET /payments/:id/print`, `/print/receipts/:paymentId`, `ReceiptDocumentsCard` on payment detail.
- Grant uploads: `staff-file-upload.ts` for article / customer identity / Girvi collateral; confirm links `girvi_collateral_files`.
- Worker PDFs: `girvi.released` → girvi_ack_pdf; `credit_note.requested` / `refund.requested` → credit_note_pdf / refund_pdf; thin status cards on Girvi released / invoice credit notes / refund payments.
- Ops: API + worker redact `upload_url` / `download_url` / `signed_url`; `verify:documents` covers receipt retry + girvi.released pending insert.
- Typecheck packages passed after implementation.

Remaining open product questions unchanged (identity-required-at-launch; physical paper drill).

## Verification — Spec 13 paper size + bilingual print

Recorded 21 September 2026.

- PDFKit and HTML print read `device_settings.invoice_paper_size` (A4 / A5 / 80mm thermal layout); tags still use tag mm only.
- Bilingual EN+HI labels via `packages/contracts/src/document-labels.ts`; Noto Sans Devanagari OFL fonts under `packages/integrations/assets/fonts`; print layout uses `next/font` Noto Sans Devanagari.
- Templates bumped to `*.pdf.v2`; upsert conflict updates `template_version`; Regenerate allowed for failed or outdated ready docs.
- Settings Devices copy clarifies invoice paper vs tags.
- `pnpm --filter @aabhushan/{contracts,integrations,application,db,api,worker,web} typecheck` — passed.
- `pnpm --filter @aabhushan/db verify:documents` — passed.
- PDF smoke: bilingual A5 render produced valid `%PDF` with Noto fonts.

## Verification — Spec 14 local Meta webhook (21 Sep 2026)

- Root `.env` holds Cloud API token, phone number ID, app secret, verify token, app id, WABA id (gitignored).
- Local GET challenge verified; Cloudflare quick tunnel + Graph `/{app-id}/subscriptions` + `/{waba}/subscribed_apps` registered with `messages` field.
- Helper: `scripts/whatsapp-dev-tunnel.sh` (re-points webhook when the trycloudflare hostname changes).
- Templates `transactional_*` / `*_reminder` still PENDING as Marketing; sandbox test number `+1 555-175-8154`. Temporary user token expiry is short — replace before pilot.

## Verification — Spec 14 notifications and WhatsApp

Recorded 21 September 2026.

- Migration: `packages/db/sql/0019_notifications_outbox_and_whatsapp.sql` (apply with `psql "$DATABASE_URL" -f …` before verify).
- Adapter: Meta Cloud API behind `packages/integrations/src/whatsapp.ts`; missing env → `WHATSAPP_NOT_CONFIGURED` / failed + retry_safe — never simulated delivered.
- Worker: pg-boss queues `notification.outbox.dispatch`, `notification.send`, `notification.reminders.evaluate` (Asia/Kolkata schedules).
- API: `GET /api/v1/notifications`, `POST /api/v1/notifications/:id/retry`, `GET|POST /api/v1/webhooks/whatsapp` (raw body signature).
- UI: `/notifications` polls while visible; status labels distinguish Accepted by provider vs Delivered; Unknown shows Reconcile.
- Provider checklist: `docs/whatsapp-provider-setup.md` (separate from app code).
- `pnpm --filter @aabhushan/{contracts,integrations,application,db,api,worker,web} typecheck` — passed.
- `pnpm verify:notifications` — run after applying `0019` on the project database.

## Verification — Article edit, photo replace, and re-tag

Recorded 21 September 2026.

- Backend: `insertArticleFileLink` deletes prior `article_files` for the article then inserts; article file list orders by `created_at DESC` so the current photo is first.
- UI: `/inventory/:id/edit` (`EditArticleForm`); detail **Edit article** for `inventory.write` unsold; post-save Print/Reprint only when metal/purity/weights change; sold redirects away from edit.
- Tag print UX: detail Print vs Reprint gated on barcode; list homogeneous Print/Reprint; `/print/tags` kind-aware copy and single-article return.
- `pnpm verify:inventory` — passed: available PATCH updates weights, sold identity PATCH rejected, second photo link leaves one `article_files` row.
- `pnpm --filter @aabhushan/{web,db,application} typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Signed-in Cursor browser pass blocked (no staff session; `/inventory/.../edit` redirects to `/login`). Confirm locally while signed in: Edit → change purity/weight → save → reprint → same barcode; untagged Print tag; photo re-upload shows new image once.

## Verification — Girvi shop-floor polish

Recorded 21 September 2026.

- Customer Girvi tab: `girvi.write` shows account table; without it shows restricted copy and does not call the list API.
- Draft edit/discard: `PATCH` preserves collateral file rows on replace; `DELETE` draft-only with `row_version`; activated discard is 422.
- Custody moves: `POST /custody-moves` writes one `location_changed` and updates location; move after release is 422.
- Collateral photos: private `shop-assets` upload/view; activate without a file per item is 422.
- Interest rate: create requires `interest_rate_percent_per_30_days`; activate without a positive rate is 422; draft detail disables Activate until a rate is set. Already-active accounts without a rate stay unsupported (no silent rewrite).
- `pnpm verify:girvi` — passed: photo gate, rate gate, draft PATCH then activate with patched principal, discard draft, discard-active 422, overdue/settled list filters, location_changed, move-after-release 422, plus prior activation/RLS/idempotency invariants.
- `pnpm --filter @aabhushan/{domain,contracts,application,db,api,web} typecheck` — passed.
- `pnpm --filter @aabhushan/{domain,contracts,application,db,api,web} lint` — passed.

Not included: pledge/repayment PDFs (spec 13), opening-balance import (spec 16), assessed-value worksheet, interest reversals, top-up, renewal, partial release, WhatsApp.

## Verification — Girvi list directory filters

Recorded 21 September 2026.

- Status default Active; Overdue SelectField; Maturity period with `clampEndToToday: false` for Week/Month.
- List API `is_overdue=true` matches active + maturity before Kolkata today; maturity_from/to reused.
- `pnpm --filter @aabhushan/contracts --filter @aabhushan/application --filter @aabhushan/db --filter @aabhushan/api --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web --filter @aabhushan/api lint` — passed.

## Verification — Spec 12 Girvi interest, settlement, and release

Recorded 21 September 2026.

- `0016_girvi_interest_settlement_and_release.sql` applied on project `nhfmcosxqogxqvhdhzfz`.
- `pnpm seed:girvi-calculation-policy` — approved `girvi.v1` recorded against the first owner. Accounts activated before the approval keep `unsupported` terms and are not converted.
- `pnpm --filter @aabhushan/db verify:girvi-fixtures` — passed: 7 fixtures, 18 checks, day counting and fail-closed behaviour. Covers same-day ₹0, 1 day ₹6.67, 30 days ₹200, 31 days ₹206.67, February 28 days ₹186.67, leap-year 29 days ₹193.33, interest-only ₹100, insufficient ₹60 leaving ₹40 with no compounding, partial repayment to ₹8,181 payable, same-date posting order, and the opening-balance cutover to ₹10,700.
- `pnpm verify:girvi-settlement` — passed against live PostgreSQL: statements and quotes posted no interest events; repayment cleared interest before principal and reduced principal from its own business date; retried repayment, settlement, and release keys each posted once; backdated posting, overpayment, and stale splits/quotes were refused (`GIRVI_BACKDATED_EVENT`, `GIRVI_OVERPAYMENT`, `STALE_GIRVI_QUOTE`); two concurrent repayments allocated the same interest only once under the account lock; release was blocked while money was due, required `girvi.release` and a matching packet (`PACKET_MISMATCH` on a wrong packet); settlement and release wrote two separate rows with packets staying `in_custody` in between; released collateral never appeared as an article barcode; a waiver was refused for the girvi role and accepted for owner with a recorded reason.
- `pnpm verify:girvi` — still passed: unapproved terms fail closed, activation and custody behaviour from spec 11 unchanged.
- `pnpm -r typecheck` and `pnpm -r lint` — passed.

Not included: interest corrections/reversals, top-ups, renewals, partial collateral release, auction, and WhatsApp reminders. Reminder jobs have no Girvi code yet; when added they must read statements only.

## Verification — Spec 11 Girvi accounts and collateral

Recorded 21 September 2026.

- `0015_girvi_accounts_and_collateral.sql` applied on project `nhfmcosxqogxqvhdhzfz`.
- `pnpm verify:girvi` — passed: interest stub fails closed; RLS denied without org context; draft/activate wrote disbursement and custody received events; duplicate in-custody packet rejected (409); activation without collateral rejected (422); billing role denied (403); idempotent activate held; post-activation collateral add rejected; terms snapshot stayed frozen after simulated default-term change; POS article lookup never returned collateral packets; Girvi tables have no FK to `articles`.
- `pnpm --filter @aabhushan/{domain,contracts,application,db,api,web} typecheck` — passed.
- `pnpm --filter @aabhushan/{domain,contracts,application,db,api,web} lint` — passed.

## Verification — Customer list directory filters

Recorded 21 September 2026.

- Directory toolbar: Active / Type / WhatsApp SelectFields next to search; defaults Active + All + All; Clear restores defaults; empty copy mentions filter.
- List API: optional `is_active`, `is_walk_in` true/false, `whatsapp_consent` granted|revoked|none; POS/combobox keep explicit `isActive: true`.
- `pnpm --filter @aabhushan/contracts --filter @aabhushan/application --filter @aabhushan/db --filter @aabhushan/api --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web --filter @aabhushan/api lint` — passed.

## Verification — Inventory list metal filter

Recorded 21 September 2026.

- `articleListQuerySchema` / list repository accept optional `metal` (`gold` | `silver`).
- Inventory toolbar: Metal SelectField next to Status and Category; Clear resets to All metals.
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- `pnpm --filter @aabhushan/{web,api} lint` — passed.
- Signed-in checks: All / Gold / Silver; combines with status/category; Clear → All.

## Verification — Invoice list period and status filters

Recorded 21 September 2026.

- Shared `packages/contracts/src/business-date-range.ts` and `apps/web/lib/period-bounds.ts` reused by Payments and Invoices.
- `GET /invoices` accepts `business_date_from` / `business_date_to`; list sorts by `business_date` when a period is active, otherwise `updated_at`.
- Invoice list toolbar: period ButtonGroup + Today/Custom pickers, status SelectField, Clear resets to All.
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- `pnpm --filter @aabhushan/{web,api} lint` — passed.
- Signed-in checks: All history; Today/Week/Month/Custom by business date; Draft/Finalized; Clear → All.

## Verification — Payments period filters

Recorded 21 September 2026.

- Unified All / Today / Week / Month / Custom period drives both Collections received tiles and the Collections list (default All = no date bounds).
- API: `received_business_date_from` / `_to` on `GET /payments`; `business_date_from` / `_to` on `GET /collections/daily` (omit all dates for all-time). Max span 366 days; inverted ranges rejected.
- UI: pinned Untitled UI `date-range-picker` + `range-calendar`; Today uses `DatePicker` for any single business day; Custom uses the range picker.
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- `pnpm --filter @aabhushan/{web,api} lint` — passed.
- `pnpm verify:payments` — passed (all-time collections ≥ day total; list range includes fixture business date).
- Signed-in checks: default All shows history; Today / Week / Month / Custom update tiles and list together; Clear returns to All.

## Verification — seed sample unpaid invoices

Recorded 21 September 2026.

- `pnpm seed:sample-unpaid-invoices` created INV00001 (₹13,390.00 due) and INV00002 (₹6,695.00 due) for Anjali Devi (`9876500003`) via `createInvoiceDraft` + `finalizeInvoice` with no tenders; articles `SEEDDUE01` / `SEEDDUE02`.
- Second run reported `already_present` for both fixtures (idempotent; no duplicate articles).
- Next step for signed-in UI: Payments → Record payment → Anjali Devi.

## Verification — Record payment allocations sync

Recorded 21 September 2026.

- Bug: selecting or re-selecting a customer (or **Record another**) cleared `allocations` to `[]`, while the sync effect depended only on `statement.data`. A React Query cache hit kept the same data reference, so the badge still showed `sales_due_inr` while the list claimed no unpaid invoice.
- Fix: `allocationsFromOutstanding` helper; sync effect depends on `customer?.id`, `statement.dataUpdatedAt`, `initialInvoiceId`, and `allocationSyncEpoch`; **Record another** rebuilds immediately from the current statement; empty copy and `submitReason` key off statement outstanding + sales due (not local allocations alone).
- Hardening: `CustomerCombobox` `excludeWalkIn` on Record payment only; customer select/clear resets tenders and `tenderAmountsTouched`; mutation success awaits statement/`payments` invalidation before the success screen stays interactive.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Signed-in checks for the owner: (1) Record payment → Anjali → invoices with dues; (2) clear → re-select Anjali → list still appears; (3) partial payment → Record another → remaining dues; (4) Walk-in not offered.

## Verification — payments dialog polish

Recorded 21 September 2026.

- Shared `MoneyInput` and `MethodSelect` under `apps/web/components/shared/`; money arithmetic moved to `apps/web/lib/money.ts` (`subtractMoney`, `compareMoney`, …); method labels to `apps/web/lib/payment-methods.ts`.
- Record payment dialog: sticky header/footer, progressive disclosure (tender/totals only after allocation), 12-col grids, brand Collecting total + Difference row, footer `submitReason`, Allocate all dues / Full / leaves-X, structured confirmation, receipt copy on success, customer combobox `autoFocus` when no prefill.
- POS totals panel adopts `MethodSelect` and `MoneyInput` for tender and fixed-amount invoice discount.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Signed-in browser checks for the owner: several unpaid invoices (sticky footer), partial below due, amount above due with message, two-tender split. Cursor browser has no staff session.

## Verification — payments dialog render loop and money comparison

Recorded 21 September 2026.

- `/payments` threw "Maximum update depth exceeded" on load. `RecordPaymentDialog` is mounted unconditionally by `PaymentsWorkspace`, so its effects ran with `isOpen=false`. The tender-sync effect listed `tenders` in its own dependency array and wrote a new array on every pass; its guard compared `only.amount` against `allocationTotal` while the branch wrote `""` in the `"0.00"` case, so the comparison never converged. Instrumented logs showed `guardAmountEqualsTotal:false` with `writeIsNoOpByValue:true` and `renderCount` reaching 14 in 26 ms with no input.
- Fix: read `tenders` through the `setTenders` updater (dropping it from the dependency array), compare against the value actually being written, and return `current` unchanged so React bails out. Post-fix logs recorded only `setTenders bailed out` and `renderCount` 18 after 39 seconds.
- Second defect in the same file: `sumMoney` returns a decimal string, so `sumMoney([amount]) > sumMoney([dueInr])` compared money lexicographically. Evaluated cases: `9.00` vs `10000.00` wrongly over-allocated (blocking partial collections), `100.00` vs `20.00` wrongly allowed past the client guard. Added `compareMoney` in `payment-shared.ts` comparing paise as `bigint`; `moneyEquals` now uses it, and both the `overAllocated` filter and the allocation `isInvalid` check call it.
- Server behaviour was already correct and unchanged: `pnpm verify:payments` proves overpayment rejection independently of this client guard.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Signed-in confirmation by the owner: `/payments` loads without the overlay and the Record payment dialog opens.

## Verification — outside-click dismiss for modals

Recorded 21 September 2026.

- Cause: React Aria `ModalOverlay` defaults `isDismissable` to false, so backdrop clicks did nothing on Record payment, Payment detail, POS line pricing, and POS quick receive (and any other caller that omitted the prop).
- Fix: shared [`modal.tsx`](apps/web/components/application/modals/modal.tsx) defaults `isDismissable` before `{...props}` so callers can still force false while pending. Record payment / line pricing / quick receive pass `isDismissable={!pending}`. Payment detail uses the default. Confirm / Return / Refund / Browse / New customer already guarded.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Signed-in browser pass incomplete: Cursor browser redirected to `/login`. Confirm locally: backdrop closes idle modals; backdrop blocked while saving; Select/ComboBox/DatePicker still close on outside click; nested customer list + modal backdrop closes Record payment.

## Verification — Record payment customer dropdown on autofocus

Recorded 21 September 2026.

- Cause: Record payment autofocuses `CustomerCombobox` while the customer query is still empty. React Aria opens then closes the empty menu; when rows arrive the field is already focused so the list stays closed. A later blur + click opens it.
- Fix in `customer-combobox.tsx`: when `autoFocus` is set and real customer rows exist, blur then `requestAnimationFrame` focus once so `menuTrigger="focus"` opens a populated list. Controlled `isOpen` is not used — this ComboBox/react-stately build clears `isOpen`.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Signed-in browser pass incomplete: Cursor browser redirected `/payments` to `/login`. Confirm locally: Record payment with no prefilled customer shows the dropdown after load; select closes it; reopen works; prefilled open does not flash an empty list; POS click/type unchanged.

## Verification — spec 10

Recorded 21 September 2026.

- Applied `0014_returns_refunds_and_reversals` on project `nhfmcosxqogxqvhdhzfz`. `app.invoice_returns` and `app.credit_notes` have RLS enabled and forced. Browser `anon` / `authenticated` have no table grants. `payments.kind` is `collection` | `refund` | `reversal` with `reverses_payment_id`; document sequences `credit_note` (CN) and `refund` (RFD) were seeded from the invoice sequence.
- Finalized invoice amounts and line snapshots are never rewritten. Accept-return writes a linked return + credit note, `return_in` movement to `return_inspection`, audit, and `credit_note.requested` outbox. Due is `GREATEST(0, grand_total − credits − net collected)`; refunds subtract collected cash; reversals mark the original `reversed` so the same payment is not subtracted twice.
- `pnpm verify:returns` — passed: missing/wrong org context denied returns and credit notes; accepted return credited the grand total on a single-line paid invoice without editing issued amounts; article status `return_inspection`; POS add of the uninspected article was `ARTICLE_NOT_SELLABLE`; duplicate return 409; billing without `refunds.approve` 403; credit plus refund left paid and due at 0.00; refund larger than collected 422; refund then reverse 409 and reverse then refund 409; idempotent return and refund retries reused the original rows; customer statement reconstructed due from invoice + payments + credits + refunds.
- `pnpm verify:payments` — passed (due sync now subtracts credits; daily collections still count `kind='collection'` only).
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- Lint on contracts/application/db/api/web — passed.
- Live `GET /api/v1` includes `/invoices/{id}/returns`, `/invoices/{id}/corrections`, `/payments/{id}/refunds`, and `/payments/{id}/reversals`. No `DELETE /invoices/{id}`.
- Signed-in browser pass incomplete: the Cursor browser has no staff session and redirected `/invoices` to `/login`. Confirm locally while signed in: invoice **Return article** + **Corrections**, payment **Refund** / **Reverse**, customer Sales **Credits** vs payment history, inventory **Under review**, POS cannot add an uninspected return. Credit-note and refund PDFs sit in the outbox until spec 13.

## Verification — spec 09

Recorded 21 September 2026.

- Applied `0013_payments_and_outstanding_balances` on project `nhfmcosxqogxqvhdhzfz`. `app.receipts` has RLS enabled and forced, unique `(organization_id, receipt_number)` and `(organization_id, payment_id)`, and no `anon` / `authenticated` grants. Added `payments (organization_id, received_business_date, status, method)` and `payment_allocations (organization_id, payment_id)` indexes.
- No `customer_sales_balances` table. Customer sales due is derived from finalized invoices minus allocations on read; `invoices.amount_paid_inr` / `amount_due_inr` are rewritten from the allocation sum inside the locked transaction.
- `lockInvoicesAscending` takes `SELECT … FOR UPDATE` in id order first, then re-reads invoice totals and the allocation sum in a second statement, so a waiter under `READ COMMITTED` sees the winner's committed allocation instead of its pre-lock snapshot.
- `pnpm verify:payments` — passed: RLS denied payments and receipts without organization context; partial and split-tender collections posted with unique receipt numbers; paid/due projections reconciled with allocations; overpayment and tender/allocation mismatch rejected; draft-invoice and foreign-organization allocations rejected; missing `Idempotency-Key` rejected; idempotent retry returned the original payment without a second post; key reuse with a different payload rejected; two simultaneous full-due collections settled exactly once with the loser refused; statement sales due matched finalized invoice dues; daily collections stayed fully allocated to sales invoices with no Girvi reference from the collection tables.
- `pnpm verify:pos-billing` — passed (finalize tenders now write payments, allocations, and receipts through the spec 09 path).
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm build` — passed (packages, API, worker, Next.js; `/payments` is a dynamic staff route).
- OpenAPI document includes `/payments`, `/payments/{id}`, `/invoices/{id}/payments`, `/customers/{id}/sales-statement`, and `/collections/daily`.
- Signed-in browser pass incomplete: the Cursor browser has no staff session and redirected to `/login`. Confirm locally while signed in: `/payments` daily tiles and Collections list, Record payment split tender against an unpaid invoice, invoice **Collections** card, customer **Sales** tab. Receipt documents are queued to the outbox only; no consumer renders them until spec 13, and no WhatsApp is sent.

## Verification — sidebar surface colors

Recorded 20 September 2026.

- Theme: `--color-bg-sidebar: #fafafa` and `--background-color-sidebar`; aside uses `bg-sidebar`.
- Nav idle transparent + `hover:bg-tertiary`; selected `bg-quaternary hover:bg-neutral-300` on `nav-item.tsx` and `nav-button.tsx`.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — POS making value polish

Date: 21 September 2026

- Inline making: method change resets to method default; unit-specific aria-label/placeholder; `validateMakingValue` gates Apply and Enter; invalid hint under controls.
- Pricing dialog making field shares the same defaults/validation; Update quote disabled when invalid.
- `percentSchema` and `assertPercent` reject values above 100 (making, wastage, discount %).
- Removed leftover Select/table agent debug ingest fetches.
- `pnpm --filter @aabhushan/{contracts,domain,web} typecheck` — passed.

## Verification — POS customer clear icon

Date: 21 September 2026

- Combobox shows trailing `XClose` when selected; clears local customer + input; draft `customer_id` unchanged until next select.
- Wired from POS `onClear`; hidden when finalized.
- `ui-context.md` POS customer row notes clear X.
- `pnpm --filter @aabhushan/web typecheck` — passed.

## Verification — POS customer field polish

Date: 21 September 2026

- `selectCustomer` PATCHes draft `customer_id` when the draft exists; combobox, Walk-in, and New customer share that path and refocus scan.
- `CustomerCombobox`: `useDeferredValue` + `useInfiniteQuery` (pageSize 20, active-only), Load more row, Walk-in pinned, selected `inputValue` sync; Create list row removed.
- Toolbar **New customer** (`customers.write`) opens POS-light dialog (name, optional phone, WhatsApp invoice); scan autofocus paused while open; Walk-in badge beside label.
- Spec 08 and `ui-context.md` POS customer bullets updated.
- `pnpm --filter @aabhushan/web typecheck` — passed.

## Verification — POS browse articles open-list fix

Recorded 21 September 2026.

- Replaced mirrored `useQuery` + local `items` with `useInfiniteQuery`; list derived from pages so empty-search open always shows cached/fresh available stock.
- Scroll-root IntersectionObserver sentinel calls `fetchNextPage`; Load more fallback retained; “More available — Load more” when visible empty but `hasNextPage`.
- `pnpm --filter @aabhushan/web typecheck` — passed.

## Verification — POS browse articles batch add

Recorded 21 September 2026.

- `PosBrowseArticlesDialog`: available-only list (`status=available`), exclude draft lines, multi-check, **Add N to sale** one PATCH, Load more, 50-id cap, footer **Receive & add**.
- Toolbar: Scan + Browse articles + Receive & add (article ComboBox removed).
- Spec 08 and `ui-context.md` POS bullets updated.
- `pnpm --filter @aabhushan/web typecheck` — passed.

## Verification — POS billing visual polish

Recorded 21 September 2026.

- Sale `TableCard` with count badge, in-card customer/Walk-in + scan + search + Receive & add, EmptyState when no lines; dense line table and totals rail with dominant grand total.
- Extracted `pos-line-table.tsx` and `pos-totals-panel.tsx`; `ScanField` accepts `hint={null}` (POS hides terminator hint; inventory default unchanged).
- `ui-context.md` POS layout bullet updated.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- Browser signed-in pass incomplete: Cursor browser redirected to `/login` (no staff password in this session). Confirm locally while signed in: empty Sale EmptyState, compact making row, No rate badge, discount Apply hidden when Method is None, scan autofocus, inventory scan hint still visible.

## Verification — POS quick receive & add

Recorded 21 September 2026.

- `POST /api/v1/invoices/drafts/:id/quick-articles` under `billing.write`: insert available article + draft line + requote in one org transaction.
- POS **Receive & add** dialog (category, metal, purity, weights, optional location/HUID); no barcode assign.
- Specs 04/08 updated.
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- `pnpm verify:pos-billing` — passed (includes quick-receive onto draft + reject on finalized).

## Verification — spec 08 POS UX wins

Recorded 20 September 2026.

- Applied `0011_walk_in_customer` and `0012_making_charge_defaults` on project `nhfmcosxqogxqvhdhzfz`.
- Walk-in: `customers.is_walk_in` unique per org; seed ensures Walk-in; POS **Walk-in** selects via `is_walk_in=true` list filter.
- Making defaults: Settings Daily rates tab CRUD; new draft lines resolve making by metal+purity before `DEFAULT_INVOICE_LINE_PRICING`.
- Finalized invoice detail **New sale** → `/invoices/new`.
- Finalize disabled reason covers customer/lines/quote/pending; scan errors map Unknown/Sold/Unavailable; `STALE_QUOTE` refetches draft and re-opens confirm.
- Spec 08 flows updated.
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- `pnpm seed:sample-customers` — Walk-in created.
- `pnpm verify:pos-billing` — passed.
- `pnpm verify:customers` — passed.

## Verification — spec 08 POS billing UX speed

Recorded 20 September 2026.

- Manual available-article search (`PosArticleSearch` + `fetchArticles` `status=available`) shares `add_article_ids` with scan; duplicates blocked with the same message.
- ScanField autofocus/refocus after customer select and successful add/remove/pricing/discount; skipped while Pricing modal is open.
- Tender panel **Pay grand total** fills first tender amount with server `grand_total_inr` (does not finalize).
- Missing-rate quote banner links to `/settings?tab=rates`; Settings opens Daily rates from `tab` query.
- Inline making method+value Apply patches `line_pricing` and re-quotes; Pricing modal kept for wastage/stones/line discount.
- Spec 08 UI flow and UI/UX sections updated.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- `pnpm verify:pos-billing` — passed (backend path unchanged).

## Verification — spec 08

Recorded 20 September 2026 (updated with line pricing UI + `0010`).

- Applied `0009_pos_billing_and_finalization` and `0010_invoice_line_pricing_inputs` on project `nhfmcosxqogxqvhdhzfz`.
- POS draft lines persist `pricing_input`; invoices persist `invoice_discount_input`. Pricing modal and invoice discount controls re-quote via `PATCH /invoices/drafts/:id`.
- `pnpm verify:pos-billing` — passed: missing org context denied, draft create/patch, missing Idempotency-Key rejected, finalize fail-closed when metal rate missing, concurrent fail-closed held, article lock sold-once pattern held, live finalize with approved `invoice.v1` + rate marks article sold, idempotency same-hash replay and different-hash reject.
- `pnpm --filter @aabhushan/{contracts,application,db,api,web} typecheck` — passed.
- Lint on contracts/application/db/api/web — passed.
- Authenticated signed-in POS browser exercise of the Pricing modal was not run in this session.

## Verification — desktop sidebar collapse

Recorded 20 September 2026.

- UI-only: `sidebar-simple.tsx` (`collapsed` / `onCollapsedChange`, 280↔72 width + spacer), `nav-list.tsx` (`NavButton` when collapsed), `ShopMark` `showName`, `StaffShellChrome` session state and compact footer via `featureCard(collapsed)`.
- Mobile drawer always receives expanded content (`renderContent(false)`). Preference is not persisted.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — spec 07

Recorded 20 September 2026 (updated with owner-approved invoice.v1).

- Applied `0008_calculation_policies` on project `nhfmcosxqogxqvhdhzfz`. `app.calculation_policies` has RLS enabled and forced. Browser `anon` / `authenticated` have no table grants.
- Four owner fixtures under `packages/domain/fixtures/invoice-examples/` cover zero making, per-gram making + wastage + stones, percent making + line/invoice discounts, and IGST round-off.
- `pnpm verify:invoice-calculation` — passed: fixtures exact match, draft policy `CALCULATION_POLICY_UNAPPROVED`, approved-empty `CALCULATION_RULE_UNSUPPORTED`, weight/discount input rejects, RLS deny without org, approved `invoice.v1` sample quote totals.
- `pnpm seed:calculation-policy` — idempotent upsert of approved `invoice.v1` methods.
- `pnpm --filter @aabhushan/{domain,contracts,application,db,api} typecheck` — passed.
- Lint on domain/contracts/application/db/api — passed.
- OpenAPI document includes `/invoices/quote`.

## Verification — customer create form polish

Recorded 20 September 2026.

- UI-only: `customer-form.tsx`, `customer-create-page.tsx`, profile Toggle `className="w-full"`, combobox modal scroll. No API/schema changes.
- Create uses the same four WhatsApp purpose toggles as the profile; payload sends only granted purposes.
- Phone uses `type="tel"` (vendor Input does not forward `inputMode` to the inner control).
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- IDE browser: `/customers` and `/customers/new` redirect to `/login` without a staff session; signed-in create/directory exercise not completed in this pass.

## Verification — spec 06

Recorded 20 September 2026.

- Applied `0007_customers_and_consent` on project `nhfmcosxqogxqvhdhzfz`. `app.customers`, `app.customer_consents`, and `app.customer_identity_files` have RLS enabled and forced. Browser `anon` / `authenticated` have no table grants.
- `pnpm verify:customers` — passed: missing organization context denied, wrong organization id denied, unique phone held, duplicate create is `PHONE_CONFLICT` 409 with the existing customer id, WhatsApp consent without a phone is 422, billing role identity-file list is 403, created customer DTO keeps sales and Girvi totals at 0.
- `pnpm --filter @aabhushan/{domain,contracts,application,db,api,web} typecheck` — passed.
- Lint on domain/contracts/application/db/api/web — passed.
- `GET /health/live` — `200`. `GET /health/ready` — `200`.
- `GET /api/v1` — OpenAPI includes `/customers`, `/customers/{id}`, `/customers/{id}/consents`, `/customers/{id}/identity-files`.
- Unauthenticated `GET /api/v1/customers` and `GET /api/v1/customers/{id}/identity-files` — `401 AUTH_INVALID` with `Cache-Control: private, no-store`.
- Browser: `/customers` and `/customers/new` redirect unauthenticated users to `/login` (invitation-only, no create-account control). `/signup` — `404`.
- Lockfile scan: no `untitledui-pro`, `@untitledui/pro`, `shadcn`, or `lucide-react`.
- Free Untitled UI `tabs/tabs.tsx` pinned from public commit `c981a73bcd6b6c68d2a54070f20f020191212828`.

## Verification — customers directory UX

Recorded 20 September 2026.

- SQL: `app.customers` count is 0 (empty-directory precondition).
- Code: [`customer-list.tsx`](apps/web/features/customers/customer-list.tsx) gates the search card on `!directoryEmpty`, no longer imports `CustomerCombobox`. Combobox supporting text updated in [`customer-combobox.tsx`](apps/web/features/customers/customer-combobox.tsx).
- Spec 06 UI/UX line updated: single name/phone search on the directory; combobox is POS/Girvi only.
- Browser signed-in pass incomplete in this session: automation redirected to `/login` and no staff password was available. Confirm locally while signed in: empty state has no search card; after creating one customer, search appears and Find customer does not; filtered-empty keeps the search card.

Limitations still true: no custom SMTP; signed-in directory/create/profile was not exercised in this IDE-browser pass (login required). WhatsApp is not sent. Identity file bytes are not stored (spec 13). Phone-required-for-every-customer and Hindi-at-launch remain open questions; UI requires a phone only when granting WhatsApp consent, and stores language from shop reminder defaults.

## Verification — spec 05

Recorded 20 September 2026.

- Applied `0005_barcode_tagging_and_hardware` on project `nhfmcosxqogxqvhdhzfz`. `app.device_settings.hardware_validated_at` exists and is null. `app.tag_print_events` has RLS enabled and forced. Browser `anon` / `authenticated` have no `SELECT` on `tag_print_events`.
- Canonical barcode remains `app.articles.barcode` (unique per organization). Reprints copy that payload into `tag_print_events` and never rotate it.
- `GET /shop/devices` may be read with `settings.write`, `inventory.read`, or `billing.write` so inventory/POS scan fields can consume terminator and suffix. Writing devices stays `settings.write`.
- `pnpm verify:barcodes` — passed: unique barcode held, Code 128 CHECK held, assign is idempotent, reprint keeps the payload, sold POS add fails as `ARTICLE_SOLD`, unavailable POS add fails as `ARTICLE_NOT_SELLABLE`, unknown barcode 404s, `hardware_validated_at` stays null.
- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm build` — passed (packages, API, worker, Next.js). `/print/tags` is a dedicated print route outside the staff sidebar.
- `GET /health/live` — `200`. `GET /health/ready` — `200`.
- `GET /api/v1` — OpenAPI includes `/articles/barcodes/batch`, `/articles/{id}/barcode`, `/articles/{id}/tag-preview`, `/articles/{id}/tag-prints`, and `/articles/lookup`.
- Unauthenticated `GET /api/v1/articles/lookup?barcode=TEST` — `401 AUTH_INVALID` with `Cache-Control: private, no-store`.
- Browser: `/inventory` and `/print/tags` redirect unauthenticated users to `/login` (invitation-only, no create-account control).
- Lockfile scan: no `untitledui-pro`, `@untitledui/pro`, `shadcn`, or `lucide-react`.

Limitations still true: no custom SMTP; signed-in scan/print/reprint was not exercised in this IDE-browser pass (login required). Physical scanner and printer were not available. Lookup p95 was not measured. `hardware_validated_at` remains null and must stay null until a drill succeeds.

## Verification — tag print one page per article

Recorded 20 September 2026.

- On-screen `/print/tags` batch preview was splitting each 50×25 mm tag across pages (4 articles → 6 print pages) because the Code 128 SVG plus padding overflowed the label height.
- Shrink barcode bars in `packages/integrations/src/barcode.ts` (`height: 6`, lighter vertical pad) and CSS-scale the SVG (`max-height: 12mm` screen / `11mm` print) without `overflow: hidden` so the quiet zone is not clipped.
- Print CSS in `tag-print-view.tsx`: `@page` size from device millimetres with `margin: 0`, zero html/body print margin, no list gap in print, `break-inside: avoid` / `break-after: page` per card, ~1 mm tag padding. Screen keeps postage-stamp spacing.
- Chrome: size hint `N × M mm. Printer not confirmed`; **Print tag** vs **Print tags (N)**; physical confirm after `afterprint` (1s fallback). Cancel still asks; staff choose **No, print failed**. Preview still does not record a print.
- `pnpm --filter @aabhushan/integrations typecheck` / lint — passed.
- `pnpm --filter @aabhushan/web typecheck` / lint — passed.
- IDE browser could not open the signed-in print route (redirected to `/login`). Layout fix is ready for a signed-in refresh of the batch URL: expected print page count equals tag count with no footer split. Hardware drill still incomplete; do not set `hardware_validated_at`.

## Verification — shop logo and tag-v2

Recorded 20 September 2026.

- Applied `0006_shop_logo_metadata` on project `nhfmcosxqogxqvhdhzfz`. `shop_profiles` has logo content-type / byte-size / checksum columns with CHECK when a key is present.
- Created private Storage bucket `shop-assets` (1 MB, jpeg/png/webp, not public).
- API: `POST/DELETE /api/v1/shop/logo`, `GET /api/v1/public/shop-branding`, profile DTO exposes `logo_url` / `has_logo` (no object key). Tag preview embeds `logo_data_uri`, `legal_name`, `barcode_height_mm`, `logo_omitted_for_height`; template `tag-v2`.
- Sidebar / mobile / login use `ShopMark` with legal name; login shows fallback initial when no logo.
- `pnpm --filter @aabhushan/{domain,application,integrations,contracts,db,api,web} typecheck` — passed.
- Lint on api/web/application/integrations/domain/db — passed.
- Live: `GET /api/v1/public/shop-branding` → `{"legal_name":"Aabhushan","logo_url":null}`; OpenAPI lists `/shop/logo` and `/public/shop-branding`; `/login` 200 with ShopMark.
- `pnpm verify:barcodes` — passed (tag-v2 template strings).
- Signed-in Settings upload and `/print/tags` layout were not exercised in this IDE-browser pass (login required). Physical scanner/printer drill still incomplete; `hardware_validated_at` stays null.

## Verification — print tags screen chrome

Recorded 20 September 2026.

- `/print/tags` screen chrome in `tag-print-view.tsx`: sticky toolbar with title, count, size chip, and short unvalidated warning; Print / Back actions; compact physical-confirm step after `afterprint`; grey `bg-secondary` stage with screen-only `sm:grid-cols-2` / `xl:grid-cols-3` stamp frames and captions.
- Printed output unchanged in intent: chrome/frames/captions `print:hidden`, one stamp per `@page`, black/white, barcode max-height preserved. No hardware validation claimed.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — blue brand palette

Recorded 20 September 2026.

- `--color-brand-50`–`--color-brand-950` in `apps/web/styles/theme.css` use Aabhushan blue. `brand-600` is `#2c5ce6` (`rgb(44 92 230)`). Semantic tokens still map primary actions, hover, focus, and subtle surfaces onto that ramp.
- Docs updated: `ui-context.md`, `architecture.md`, `untitled-ui-import.md`, spec 01 foundation note.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Browser `/login`: Sign in button computed background `rgb(44, 92, 230)`.

## Verification — inventory filter bar unify

Recorded 20 September 2026.

- `ScanField` is flat (no `bg-brand-primary` callout); inventory toolbar is one `xl:grid-cols-5` row with More filters/Clear in an `items-end` actions cell; advanced purity/weight block stays below when expanded.
- Inventory passes `hint=""` so scan matches Search height; tooltip still explains scan behavior.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.
- Browser signed-in `/inventory` not rechecked (session redirected to `/login`).

## Verification — article detail visual polish

Recorded 20 September 2026.

- Header secondary line: category · metal · purity · location. Specification regrouped (Identity, Metal and weights with weight strip, Stones, Source and place, Cost); Status removed from grid. Photograph + Printed tag unified in one left rail with aspect-square well. Movement list `max-h-112` scrollable. Adjustment full width with `md:grid-cols-2` for status/location.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — receive article form visual polish

Recorded 20 September 2026.

- Identification and Weights are separate cards with `text-lg` headers; Gross/Non-metal `md:grid-cols-2`; Net metal full-width read-only strip; optional sections use ChevronDown + Optional label; sticky Receive/Cancel bar preserved.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — customer directory list polish

Recorded 20 September 2026.

- Search lives inside Directory `TableCard` under the header (`max-w-md`); orphan Search card removed. Filtered-empty empty state sits in the same card under the toolbar. Short WhatsApp badges via `whatsappConsentShortLabel`; mono phone; truncated email; ChevronRight open column.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — staff list pages chrome sync

Recorded 20 September 2026.

- Shared `ListSearchToolbar`; Customers and Invoices use it inside `TableCard` under Header+badge. Inventory filters live in the Articles card (minimal scan+search card only when catalogue empty). Filtered-empty inside card; ChevronRight on rows. `ui-context.md` staff list pages note updated.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — customer profile visual polish

Recorded 20 September 2026.

- Profile header: Customers breadcrumb, mono phone, short consent badge. Profile tab: Contact + Details + WhatsApp (2-col toggles) + Identity cards in `max-w-3xl`; sticky Save on Details; compact identity empty/list.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — settings pages visual polish

Recorded 20 September 2026.

- Settings uses `Tabs` (`button-minimal`); form tabs in `max-w-3xl` section cards with sticky saves; Staff/Rates/Audit TableCards with badges; numbering single header row; audit humanized labels + truncated entity IDs. `ui-context.md` Settings layout note updated.
- `pnpm --filter @aabhushan/web typecheck` — passed.
- `pnpm --filter @aabhushan/web lint` — passed.

## Verification — burgundy brand palette

Recorded 20 September 2026 (superseded by blue brand palette).

- `--color-brand-50`–`--color-brand-950` in `apps/web/styles/theme.css` previously used Aabhushan burgundy. `brand-600` was `#7e143a` (`rgb(126 20 58)`).
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

- **Shop rates for live POS:** enter daily metal rates so drafts quote and finalize successfully (`pnpm seed:calculation-policy` already seeds `invoice.v1`).
- **Hardware drill — spec 05:** confirm barcode reader model, scan suffix, tag printer, and label millimetres; print a real tag and scan it back. Do not mark hardware validated from a preview.
- **Configuration — Auth/SMTP:** disable public signup, set site/redirect URLs, and configure custom SMTP. First Auth user and owner membership are already in place.
- **Girvi opening balances:** import owner-verified principal and pre-cutover unpaid interest for legacy accounts (spec 16). `girvi.v1` calculation is approved; legacy accounts stay blocked until their own terms are approved.
- **Billing follow-ons:** receipt/invoice/credit-note/refund document print (spec 13) consumes the `receipt.requested`, `credit_note.requested`, and `refund.requested` outbox events that specs 09–10 already queue.
- **Foundation — workspace:** done in spec 01. Use `pnpm install` and the root scripts; copy `.env.example` before starting API/worker.
- **Foundation — data and identity:** `0001`–`0014` and the first owner membership are applied on the live project.
- **Inventory and tagging:** specs 04–05 done except physical scanner/printer drill.
- **Customers and payments:** customer records and consent are done in spec 06; collections, allocations, receipts, dues, linked returns, credit notes, refunds, and reversals are done in specs 09–10.
- **Girvi:** accounts, collateral custody, and disbursement are done in spec 11. Interest, repayment, settlement, and physical release are done in spec 12 on approved `girvi.v1`. Shop-floor polish (customer tab, draft edit/discard, packet location moves, collateral photos) is done. Corrections, top-ups, renewals, partial release, auction, print PDFs (spec 13), and opening-balance import (spec 16) remain out of scope.
- **Documents and automation:** private files catalog, pledge/repayment PDFs, outbox, WhatsApp (specs 13–14). Collateral photos already reuse private `shop-assets`.
- **Dashboard and imports:** reconciled reports and opening imports (specs 15–16), including assessed-value worksheet if approved.- **Pilot readiness:** authorization/concurrency, hardware checks, backups, restore drill, staff training, supervised launch.

## Open Questions

- **Shop operation:** confirm that launch is one branch, how many staff/counters will use it, and which people can override prices, adjust stock, refund money, or release collateral. One branch is the documented working assumption, not a confirmed staffing survey.
- **Invoice rules:** owner-approved for `invoice.v1` (20 September 2026): separate purity rates ₹/g net metal, making fixed/per-gram/% metal, wastage % net×rate (default none), fixed stone charges, line then invoice discounts, tax-exclusive 3% GST (intra default), HALF_UP paise then ₹1 payable round-off. Accountant should confirm GST registration / place-of-supply before live inter-state invoices.
- **Girvi terms:** owner-approved for `girvi.v1` (21 September 2026): percentage per 30 days, simple interest on outstanding principal, actual days ÷ 30 counting the start date and excluding the settlement date, no minimum period, no grace, no extra charges, interest before principal, principal reduction effective on the repayment business date, HALF_UP to ₹0.01, immutable events, backdating disabled, rate frozen per account. Still open operationally: assessed-value inputs per account, opening balances for legacy accounts (spec 16), and treatment of accounts whose existing terms differ from `girvi.v1`.
- **Credit policy:** confirm due dates, permitted credit sales, payment corrections, and whether customer advances/overpayments are essential. The current MVP default rejects overpayments unless a separate credit workflow is implemented.
- **Returns:** inspection checklist, restock pricing after return, whether credit notes can remain unrefunded store credit (MVP: credit reduces invoice due only), and who besides owner/admin may approve refunds. Returned pieces already move to `return_inspection` and are not sellable until spec 04 inspection release.
- **Opening records:** identify existing stock, sales dues, active Girvi accounts, collateral packets, opening interest balances, and accrual dates. Confirm import format and who reviews totals.
- **Hardware:** confirm barcode reader model, scan suffix, tag printer, and label dimensions (invoice paper size and bilingual print are owner-confirmed).
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
- **Free-only Untitled UI:** explicitly confirmed. Use Untitled UI tokens and approved public Base/Application UI components, with Aabhushan blue (`#2c5ce6` as `brand-600` and generated 50–950 shades) instead of the library default purple. Inter, original page compositions, no PRO purchase or paid-template dependency. This supersedes the earlier Morfikos/shadcn direction and the interim burgundy ramp.
- **Decimal arithmetic and historical snapshots:** preserve reproducible invoice and Girvi results. Invoice commercial rules are encoded as approved `invoice.v1`.
- **Transactional posting and idempotency:** invoice, stock, initial payment, audit, and outbox writes commit together; repeat submissions cannot create duplicate financial operations.
- **Outbox and asynchronous side effects:** PDFs and WhatsApp messages run after commit, so provider failures do not undo valid sales or repayments. Consumers handle retries and ambiguous external outcomes explicitly.
- **Separate Girvi collateral:** pledged jewellery is not saleable inventory. Financial settlement and physical release are distinct recorded actions.
- **Manual payment verification:** cash/UPI/card/bank receipts are recorded by staff; payment gateways and automatic bank confirmation are deferred.
- **Private storage and backend authorization:** protect customer records and documents through verified staff permissions, scoped database access, and controlled file delivery.
- **Online financial operations:** no offline posting or automatic conflict reconciliation in v1. Polling and query invalidation are sufficient initially; realtime infrastructure is not required.
- **Managed database plus separately hosted processes:** web, API, and worker can share an always-on host with independent restarts. The exact provider and budget remain unresolved.

## Session Notes

- Specs 07–10 are complete for MVP billing, collections, and corrections: `invoice.v1` calculator, POS scan/pricing/finalize, manual payments with allocations/receipts/dues, and linked returns/credit notes/refunds/reversals. Enter daily metal rates to sell. Spec 05 hardware validation is still incomplete.
- Spec 09 posts money but does not render receipt documents: `receipt.requested` sits in the outbox with no consumer until spec 13. Spec 10 queues `credit_note.requested` and `refund.requested` the same way. Overpayments and customer advances are rejected by design; credit notes reduce invoice due only (no general wallet).
- Resume with daily metal rates, or with the spec 05 hardware drill when devices are available, or with later specs (11+) when requested. Read the latest `ui-context.md` and `ai-workflow-rules.md` first.
- Auth setup and SMTP remain configuration: `docs/supabase-auth-and-smtp.md`.
- Untitled UI MCP is project-configured in `.cursor/mcp.json` without auth. Free-only; no PRO login.
- Auth setup and SMTP remain configuration: `docs/supabase-auth-and-smtp.md`. Staff invite UI calls the API; missing SMTP still cannot be treated as a successful send.
- Untitled UI MCP is project-configured in `.cursor/mcp.json` without auth. Reload Cursor / enable the `untitledui` server in Settings → MCP if tools are missing. Free-only; no PRO login.
- `apps/web/utils/is-react-component.ts` has documented vendor patches: detect `forwardRef` via `Symbol.for("react.forward_ref")`, not `$$typeof.toString()`; import React types with `import type * as React from "react"`.
- Vendor `Button` uses named React imports (`isValidElement` and type-only `FC`/`ReactElement`/`ReactNode`), not a default `React` export. `@types/react` is `export =` and has no ESM default.
- Product name is Aabhushan (`@aabhushan/*`). The workspace directory may still use the older folder name.
- Read the latest `ui-context.md` and `ai-workflow-rules.md` before UI work. Free-only Untitled UI is a settled constraint and is not an open licensing question.
- Do not confuse Aabhushan's current MVP with the earlier broader Jewellery OS plan. Current choices include Next.js, Express, Supabase Auth/PostgreSQL, pg-boss, and no Redis; older Clerk/BullMQ/multi-branch assumptions do not carry over automatically.
- Keep undefined financial behavior out of implementation. Record pending rules here and proceed with independent foundation work while awaiting examples or decisions.
- For every meaningful implementation update, record the actual files/features changed, checks run and results, known limitations, and next unit. Move entries to Completed only after their acceptance conditions are evidenced.
- Preserve user changes and inspect existing code before scaffolding if a repository is later supplied. Do not overwrite an existing implementation based on this initial status record.
- No calendar deadline or delivery estimate has been confirmed. The Next Up list is dependency order, not a promised schedule.
