# UI Context

## Theme

Use only free, open-source Untitled UI React components with the default styles and Aabhushan's blue brand palette for the product. No paid license, PRO components, premium page templates, paid icon styles, or trial-dependent assets are part of this project. Adopt the library's neutral surfaces, typography, spacing, borders, shadows, control states, and component variants. Keep the application's identity as Aabhushan, with its own name and logo.

This revision replaces the earlier Morfikos-derived orange palette, Cal Sans headings, dark pill-button prescription, custom radius overrides, shadcn/ui component selection, and Lucide icon selection. Where older architecture or code-standards documents prescribe those UI choices, this document takes precedence for presentation. Backend architecture and business rules remain as defined in the project documents.

Use the default light theme for the initial staff workspace. Retain the library's theme infrastructure; a user-facing dark-mode toggle is not required for this MVP. If dark mode is enabled later, use the library's supported theme rather than a separate custom palette, and verify every financial screen in both modes.

Follow the official Next.js integration. Keep the installed, pinned library theme as the implementation source of truth for tokens, then override only the `--color-brand-*` scale in `apps/web/styles/theme.css`. The brand base is `#2c5ce6` (`brand-600`); lighter and darker steps are generated from that hue so primary actions, focus rings, and subtle brand surfaces stay in family. Use the free setup path and public source only; do not run PRO upgrade or paid-registry setup.

## Colors

Keep the default theme definitions and consume their semantic CSS variables. Override only the brand ramp (`--color-brand-50` through `--color-brand-950`) to Aabhushan's blue; do not recreate a parallel palette or copy the previous `--accent-primary`/`--bg-base` overrides. Values below reference the documented light-theme variables. Hex values for the brand ramp are recorded so later work does not reintroduce the library default purple or the earlier burgundy.

| Step | CSS Variable | Hex | RGB |
| --- | --- | --- | --- |
| 50 | `--color-brand-50` | `#edf5ff` | `rgb(237 245 255)` |
| 100 | `--color-brand-100` | `#d6e8ff` | `rgb(214 232 255)` |
| 200 | `--color-brand-200` | `#afcdff` | `rgb(175 205 255)` |
| 300 | `--color-brand-300` | `#82abff` | `rgb(130 171 255)` |
| 400 | `--color-brand-400` | `#5787fd` | `rgb(87 135 253)` |
| 500 | `--color-brand-500` | `#3464e7` | `rgb(52 100 231)` |
| 600 | `--color-brand-600` | `#2c5ce6` | `rgb(44 92 230)` |
| 700 | `--color-brand-700` | `#173fbf` | `rgb(23 63 191)` |
| 800 | `--color-brand-800` | `#0c2b9b` | `rgb(12 43 155)` |
| 900 | `--color-brand-900` | `#051b73` | `rgb(5 27 115)` |
| 950 | `--color-brand-950` | `#01084b` | `rgb(1 8 75)` |

| Role | CSS Variable | Value |
| --- | --- | --- |
| Main surface | `--color-bg-primary` | `var(--color-white)` |
| Secondary surface | `--color-bg-secondary` | `var(--color-neutral-50)` |
| Primary text | `--color-text-primary` | `var(--color-neutral-900)` |
| Supporting text | `--color-text-tertiary` | `var(--color-neutral-600)` |
| Primary action | `--color-bg-brand-solid` | `var(--color-brand-600)` |
| Primary action hover | `--color-bg-brand-solid_hover` | `var(--color-brand-700)` |
| Subtle brand surface | `--color-bg-brand-primary` | `var(--color-brand-50)` |
| Control border | `--color-border-primary` | `var(--color-neutral-300)` |
| Surface divider | `--color-border-secondary` | `var(--color-neutral-200)` |
| Focus ring | `--color-focus-ring` | `var(--color-brand-500)` |
| Error text | `--color-text-error-primary` | `var(--color-red-600)` |
| Success text | `--color-text-success-primary` | `var(--color-green-600)` |

These mappings are from the integration reference checked on 18 September 2026. Preserve component-specific tokens and foreground/background pairings from the installed source, including warning, disabled, selected, and destructive variants.

- Use the library's semantic utilities and variant props. Avoid scattered hex values and broad CSS selectors that repaint all buttons, inputs, or links.
- Primary actions, navigation selection, and focus use default brand styling. Domain states use the relevant neutral, success, warning, or error badge/alert variants.
- Color supports a visible status label; it never replaces one. “Partially paid,” “Overdue,” “Under review,” and “Unknown delivery” must remain understandable without color perception.
- Keep charts consistent across dates and filters. Label sales, collections, principal, and interest explicitly; do not distinguish them by color alone.
- Preserve the library's focus, hover, pressed, loading, and disabled states. Validate contrast and keyboard focus in the final screen composition rather than assuming component defaults cover every custom arrangement.
- Use a separate white-paper print presentation with dark text and black barcodes. Dashboard colors must not make a printed invoice or tag harder to read.

## Typography

| Role | Font | Variable |
| --- | --- | --- |
| UI text, forms, tables, and financial figures | Inter with the library's fallback stack | `--font-body` |
| Page and section headings | Inter with the library's fallback stack | `--font-display` |
| Article codes and technical identifiers | Library default monospace stack | `--font-mono` |

Use the default typography scale and selected component's type treatments. Load Inter through the Next.js font setup and connect its `--font-inter` variable to the theme. Do not load Cal Sans or impose the previous marketing heading style.

- Build reusable page/section headings with semantic HTML and the default typography tokens; no premium header composition is required. Reserve large display styles for relevant public or authentication layouts; keep operational screens compact and readable.
- Use tabular numerals for totals, rates, balances, weights, and statement columns. Right-align numeric table cells and retain explicit currency and units.
- Apply consistent Indian currency grouping and workflow-approved display precision. Visual formatting never becomes the source for invoice or interest calculations.
- Use monospace sparingly for identifiers, not for entire customer or financial tables.
- Keep labels visible and help/error text readable. Do not reduce essential totals to caption-sized text to fit a layout.
- If Hindi is required, add a compatible Devanagari fallback after verifying the selected font's coverage. Embed suitable fonts in generated PDFs and check ₹ and required scripts in printed output.

## Border Radius

Use the default radius classes of each imported Untitled UI component. This table records the available scale and intended application usage; it must not override a component merely to force all controls to share one radius.

| Context | Class |
| --- | --- |
| Small UI where the component uses it | `rounded-md` — 6px |
| Standard controls where prescribed by the component | `rounded-lg` — 8px |
| Panels and containers where prescribed | `rounded-xl` — 12px |
| Larger overlays/containers where prescribed | `rounded-2xl` — 16px |
| Large visual containers only when part of the selected example | `rounded-3xl` — 24px |
| Avatars and pill badges | `rounded-full` |
| Table cells / print content | Component default; avoid decorative per-cell rounding |

Do not apply global 24px panel or pill-button overrides from the previous theme. Keep the selected component's shadows and borders with its radius. Ensure overflow handling does not clip menus, tooltips, or focus rings.

## Component Library

Use Untitled UI React FREE with Tailwind CSS and React Aria. The implementation baseline is the official public repository, checked on 18 September 2026 at commit `c981a73bcd6b6c68d2a54070f20f020191212828`. Its MIT license permits commercial use subject to its terms; retain applicable copyright/license notices with copied source.

The official free-versus-PRO explanation includes Base components and core Application UI in the free offering, while additional variants and page examples belong to PRO. Catalogue visibility alone is not evidence that every example is free. Use only the exact public-source variants identified below, not every similarly named variant on the website.

**Approved free Base components:** buttons and utility buttons, inputs, textarea, select/combobox/multi-select, checkboxes, radio buttons, toggles, badges/badge groups, tags, avatars, dropdowns, tooltips, and progress indicators. These have source under `components/base/` in the public repository. The public `input/pin-input.tsx` is available if the configured authentication flow actually requires code entry.

**Approved free Application UI:** the following source paths were present in the public repository. Preserve their required helpers, dependencies, default styles, and accessibility behavior.

| UI need | Approved public source under `components/application/` |
| --- | --- |
| Sidebar and header navigation | `app-navigation/`, including `sidebar-navigation/sidebar-simple.tsx` and `header-navigation.tsx` |
| Data tables | `table/table.tsx` |
| Tabs | `tabs/tabs.tsx` |
| Pagination | `pagination/pagination.tsx` and related public variants |
| Date and date-range selection | `date-picker/date-picker.tsx`, `date-range-picker.tsx`, and their calendar helpers |
| Charts | `charts/charts-base.tsx` and public line/bar/pie demo compositions |
| Modal foundation | `modals/modal.tsx` |
| Drawer foundation | `slideout-menus/slideout-menu.tsx` |
| File upload | `file-upload/file-upload-base.tsx` and required public helpers |
| Loading indicator | `loading-indicator/loading-indicator.tsx` (mutations / button pending only) |
| Skeleton / shimmer | `skeleton/skeleton.tsx` — local recipes for fetch loading (Untitled UI free has no skeleton) |
| Toast / transient success | `toast/staff-toast.tsx` — local `StaffToastProvider` (Untitled UI free has no toast) |
| Empty state | `empty-state/empty-state.tsx` |

A free modal foundation does not include every premium confirmation example. A free table does not include a finished customer-management page. Build the business composition around the free foundation and replace all sample data with real API data. Demo source can guide integration where included in the MIT repository; do not copy gated page source or premium assets.

Removed from the implementation plan: premium dashboard/settings/informational page templates; paid login, sign-up, verification, recovery, and 404 page variants; PRO marketing sections; advanced paid alert/notification/metric/filter/header/activity-feed compositions; and any source requiring a purchase, PRO authentication, or paid registry access. The earlier broad catalogue links are no longer instructions to import complete pages. This exclusion is an implementation policy, not a claim that every variant in each category is paid.

Build locally with free components: page and section headers, breadcrumbs, filter rows, metric summaries, inline alerts, notification lists, activity histories, all required authentication pages, and the 404 page. Use semantic HTML, free Base components, and the default theme. This is ordinary application composition, not a pixel-for-pixel reconstruction of locked templates.

| Project area | Free-only implementation |
| --- | --- |
| Dashboard | Local metric summaries and headings; public chart and table foundations |
| Inventory/tagging | Free inputs/selects/badges/table/uploader; local filters and tag preview |
| POS | Free customer combobox, scan input, table, buttons, and payment controls; local pricing summary |
| Invoices/payments | Free tables/tabs/modal foundation; local document detail, receipts, and confirmation content |
| Customers | Free table/avatar/tabs; local directory and profile composition |
| Girvi | Free forms/date pickers/uploader/table/modal; local terms, statements, repayment/release content |
| Notifications | Free table/badges/buttons; local status messages and safe retry controls |
| Settings | Free form controls with local headings and validation/status feedback |
| Login/invitation/recovery/verification | Original compact forms using free inputs/buttons and the real Supabase flow |
| 404/access/service errors | Original text-and-action pages with free buttons; no purchased illustration or template |
| Help/support | Original semantic content and free controls; no marketing-template dependency |

No Untitled UI marketing section is required by the MVP. The documentation advertises free marketing variants, but none is selected here: use simple locally authored help/contact content. This keeps the build independent of both paid marketing assets and unverified variants.

For Next.js App Router, retain the documented route/theme providers, font integration, and global styles from the free setup. Keep interactive controls within client boundaries. React Hook Form and Zod remain the form tools; adapt controlled React Aria values/refs correctly. Do not install a second visual system to replace missing premium compositions.

**Source organization:** copied free Base code in `apps/web/components/base/`, copied free Application UI in `apps/web/components/application/`, shared original compositions in `apps/web/components/shared/`, and domain screens in `apps/web/features/`. Record the upstream commit and preserve required relative helpers. No premium page collection or marketing component directory is needed.

When adding a component later, confirm that its exact source and required assets are publicly available under a suitable free license. If not, leave that variant out and build the needed behavior from already-approved primitives. Do not ask the owner to purchase a license; the free-only decision is final for this project. This is a dependency check, not a blocker to building the MVP.

**MCP (Cursor):** the project MCP server `untitledui` is configured in `.cursor/mcp.json` against [Untitled UI's React MCP](https://www.untitledui.com/react/integrations/mcp) at `https://www.untitledui.com/react/api/mcp`, with no API key or OAuth. Use it to search and list free Base/Application components and icons while implementing later specs. Unauthenticated search is keyword-only and hides PRO items. Do not log in, pass a license key, or install page templates (`get_page_template_files` is PRO-only). If a tool returns `pro_access_required`, compose from approved free primitives instead.

## Layout Patterns

- **Application shell:** compose an original app shell around the public `sidebar-simple.tsx` or header-navigation component. Preserve that component's default styling and responsive behavior; do not import a paid dashboard shell. On desktop (`lg+`), the staff sidebar may collapse to a 72px icon rail with tooltips; collapse preference is stored in browser `localStorage` (`aabhushan.staff.sidebarCollapsed`). Mobile keeps the hamburger drawer with full labels. There is no sidebar Search until a real global search exists. The selected nav item uses brand-subtle styling (`bg-brand-primary`); nested routes keep the parent item active via longest-prefix matching. Notification attention badges show expanded and collapsed. Navigation includes Dashboard, Inventory, Invoices/POS, Payments, Customers, Girvi, Notifications, and Settings, filtered by staff permission.
- **Informational/list-detail screens:** Build original customer directories, transaction lists, account summaries, and detail pages using the approved free table/tabs/navigation and shared staff page recipes below. Paginated list cards use the shared `ListTableFooter` composition (`Page X of Y`, `N per page` select, Previous/Next) and the free modal foundation via `ConfirmDialog` for destructive confirmations. No informational-page template is imported.
- **Staff page recipes (chrome only — reuse, do not restyle tokens):** Shared files live under `apps/web/components/shared/`:
  - `staff-page-header.tsx` — `StaffPageHeader` (title, optional description/icon/badge/actions; optional `back` composed with `StaffBackLink`). List pages omit `back`; detail/forms pass it.
  - `section-card.tsx` — `SectionCard` (`rounded-xl bg-primary p-4 shadow-xs ring-1 ring-secondary md:p-5`, optional `text-lg` title + `text-sm text-tertiary` description). Use for form/detail panels, not data tables (`TableCard` stays for directories).
  - `sticky-form-actions.tsx` — `StickyFormActions` with `variant="bar"` (full-page forms: receive/edit article, Girvi create) or `variant="inset"` (inside a SectionCard: settings, customer profile/create).
  - `directory-states.tsx` — `DirectoryEmptyState` (icon tile + title + description + optional CTA), `FilteredEmptyState` (clear-filters CTA), `DirectoryTableSkeleton` (TableCard header + **search then** filter-strip skeletons + `TableSkeleton`). Keep `ActiveFiltersBar` for chips; do not fold chips into empty helpers.
  - Directory boolean recipe (document only; do not over-abstract): `filtersActive`, true-empty (`directoryEmpty` / `catalogueEmpty` / `ledgerEmpty`), `filteredEmpty`, `showInitialLoading = isLoading && !data`, `showDirectoryCard`.
  - Loading recipe map: **Directory** = `StaffListPageSkeleton` / `StaffDirectoryLoading` (Suspense) or live header + `DirectoryTableSkeleton` (in-feature); **Detail** = `StaffDetailPageSkeleton` (tabs + SectionCard-shaped panels, optional `layout="split3"`); **Form** = live header + `FormSkeleton` (`SectionCard` tokens, optional `showStickyActions`); **Shell** = `StaffShellSkeleton` (280px / `lg` rail); **Settings** = `SettingsPageSkeleton`; **Print** = `PrintDocumentSkeleton`.
- **Staff list pages:** `StaffPageHeader` → true-empty `DirectoryEmptyState` **or** `DirectoryTableSkeleton` **or** `TableCard` (Header + filter strip with `ListSearchToolbar` / domain filters / optional `ActiveFiltersBar` → table or `FilteredEmptyState` → `ListTableFooter`). Rows use `href`, `cursor-pointer`, and a trailing ChevronRight. **Allowed divergences:** Inventory keeps `InventoryFilterToolbar` / scan / status / category filters (and may show a minimal scan+search card above true-empty for lookup). Payments keeps a Collections metrics `SectionCard` (period + method tiles) above the collections `TableCard` — Suspense must include metrics shimmer + list skeleton.
- **Staff detail pages:** `StaffPageHeader` with `back` + optional badge + actions; section content in `SectionCard`s; tabs use free `Tabs` `underline` `md` `gap-6` where the screen already uses that pattern.
- **Staff forms:** `StaffPageHeader` + `SectionCard` stack (usually `max-w-3xl`) + `StickyFormActions`. Prefer in-flow sticky `bar` over viewport-fixed footers.
- **Settings:** use free `Tabs` (`button-minimal`) for Shop profile / Staff / Rates / Numbering / Devices / Reminders / Audit. Form panels use `SectionCard` in `max-w-3xl` with `StickyFormActions` `inset`; Staff/Rates/Audit directories use `TableCard` with count badges. Membership status uses `membershipStatusLabel` / `membershipStatusColor` from `features/settings/membership-status.ts`.
- **Login:** Build a compact original page with Aabhushan identity, free email/password inputs, submit feedback, and password recovery. Connect it to Supabase Auth. Do not import a paid login template or display unconfigured social-login methods.
- **Invited staff setup:** Build an original invitation-acceptance and initial-account form using free controls. Public registration remains disabled. Hide public “Create account” links and explain administrator-provided access. Show recovery for expired or invalid invitations; no sign-up template is required.
- **Verification and recovery:** Build original check-email, confirmation, expiration, resend, and completed states for the actual Supabase flow. Link-based verification shows instructions; code entry uses the free PIN input only when a real verification endpoint supports it. No paid verification/recovery page or SMS-only visual flow.
- **404 and unavailable pages:** Build a simple original heading, explanation, and free return-to-dashboard/login buttons. No paid 404 template or illustration. Distinguish missing routes from permission or service failures without exposing private record existence; ordinary empty lists use the free empty-state foundation.
- **Dashboard:** use original metric summaries with free charts and tables; retain useful density. Separate sales, collections, outstanding sales dues, Girvi principal, and accrued interest. Do not fill missing data with decorative trends or fabricated percentages.
- **Inventory:** staff list chrome matches other directories (filters inside the Articles `TableCard`); when empty, a minimal scan+search card may sit above the empty state for lookup. Article detail groups identification, weights, pricing defaults, source, location, photographs, and movement history. Tag preview follows the actual printer dimensions rather than a marketing card layout.
- **POS:** combine free input/table/panel controls into a desktop workspace: one Sale `TableCard` with header + line-count badge, in-card customer row (combobox with clear X + Walk-in + New customer) + scan + Browse articles + Receive & add toolbar, dense line table (article caption with metal/purity, horizontal making Apply, icon Pricing/Remove), and a sticky totals rail with a dominant brand-subtle grand total. **Browse articles** is a modal of available-stock checkboxes with **Add N to sale** (scan remains the primary add path). **New customer** opens a POS-light create dialog (name, optional phone, WhatsApp invoice); full profile remains on `/customers/new`. Stack logically on tablet/narrow screens. Preserve scan focus and visible errors; a scanner Enter must not finalize payment automatically.
- **Payments:** `/payments` opens with a Collections received card for one business date — an `InputDate` plus Cash / UPI / Card / Bank tiles and a total, each method labelled as text — above a Collections `TableCard` (in-card customer/receipt search, method and date filters, Type column for Collection/Refund/Reversal, `ListTableFooter`). **Record payment** is a labelled button, never icon-only: the dialog uses sticky header/footer chrome with a scrollable body; customer first, then unpaid invoices (Allocate all dues / per-row Full, “leaves X after this”), then tenders only once an allocation exists. Method is a segmented `MethodSelect` (Cash/UPI/Card/Bank as text); amounts use shared `MoneyInput` (₹ prefix, right-aligned `tabular-nums`). Totals show a brand-subtle Collecting amount plus Allocated / Tender / Difference (error-coloured on mismatch), with a footer reason when Record payment is disabled. Amounts are right-aligned with ₹. Collections are labelled separately from Sales and never presented as revenue. Receipt numbers appear only after the server confirms the post. Payment detail uses **Refund** and **Reverse** (not Delete) with a reason; both write a linked compensating payment.
- **Financial confirmation:** show customer, account/invoice, amount, payment method, and action consequence. Use clear labels such as “Finalize invoice,” “Return article,” “Refund,” “Reverse,” “Record repayment,” and “Release collateral.” Client-side disabled/loading controls complement backend idempotency; they do not replace it.
- **Invoices and customers:** use list/detail pages with receipts, outstanding balances, and correction history. Finalized invoice detail has **Return article** per line (confirmation lists invoice, article, and that stock will be under review, not for sale), a **Corrections** card (returns, credit notes, refunds, reversals), and a read-only Collections card. Customer Sales tab shows sales due, outstanding invoices, a **Credits** list (credit notes reduce due; not cash), and payment history labelled Collection / Refund / Reversal. Posting stays on `/payments`. A completed sale with failed PDF/message processing remains completed with a separate actionable status.
- **Girvi:** group account details into Collateral, Terms, Statement, Payments, and History. Show principal and interest separately. Financial settlement and physical release are distinct actions and displayed states; the interface never implies collateral becomes stock when overdue.
- **Notifications:** show pending, sent, delivered, failed, and unknown outcomes with clear labels. Offer retries only when safe; ambiguous sends need reconciliation. Do not label provider acceptance as customer delivery.
- **Support/marketing content:** Render original help, FAQ, and contact text in semantic sections using the default tokens and free buttons/inputs where needed. No marketing-template, paid hero, footer, or contact-section dependency.
- **Loading and errors:** For **data fetch**, use structure-matched skeletons from `components/application/skeleton/skeleton.tsx` that mirror the page or panel being loaded (list card + filters + rows, detail header + sections, form cards, metric tiles, charts). Keep the live page title/back row when it already paints before data; skeleton only the body. With `keepPreviousData`, do not replace prior rows with a full-page skeleton on page or filter change. For **mutations**, keep free `Button isLoading` / confirm-dialog pending — do not replace those with page skeletons. Empty states stay after load. Distinguish no results, unavailable stock, stale quotes, validation, denied access, and interrupted transactions. Preserve unsent work where safe; never claim an unconfirmed mutation succeeded. Auth login/invite/recovery keep button loading only. Print routes use print-block skeletons, not shop chrome spinners.
- **Staff auth chrome:** Do not blank the staff shell with centered “Checking staff access…” on soft nav or remount. Hydrate `CurrentStaff` from a tab `sessionStorage` snapshot when present; cold load may use `StaffShellSkeleton` (sidebar + main). Revalidate `GET /api/v1/me` in the background. Same-origin sidebar and `Button` `href`s use App Router (`next/link`). Clear the snapshot on sign-out, 401, and 403.
- **Success feedback:** After completed shop-floor outcomes (finalize invoice, record payment, receive article, Girvi repay/settle/release, notification retry), show a short success toast via `useStaffToast()` from the staff-shell provider. Prefer existing inline alerts for form validation errors. Do not toast every PATCH (making apply, draft line edits).
- **Rates gate:** Staff shell shows a dismissible banner when today’s Kolkata gold or silver rates are missing (`GET /api/v1/shop/rates/coverage`), for roles with billing or rates access. Session-only dismiss; CTA to `/settings?tab=rates`. POS may still surface quote-level rate errors separately.
- **Dialogs and drawers:** Use only the public modal and slideout foundations, with locally authored confirmation/detail content. Shared `ModalOverlay` dismisses on backdrop click and Escape by default (`isDismissable`); pass `isDismissable={false}` (or `!mutation.isPending`) only while a submit is in flight so an accidental dismiss cannot abandon the request. Select/ComboBox/DatePicker popovers already close on outside click via React Aria. Preserve accessible titles, focus trapping/return, keyboard behavior, and unsaved-work handling. Long article or Girvi forms use original full pages; no premium modal/drawer composition is required.
- **Responsive and keyboard use:** preserve access to key amounts, weights, errors, and actions at smaller widths. Use contained table scrolling where needed. Test scanner and keyboard navigation, zoom, touch targets, screen-reader announcements, and reduced motion. Default components still require workflow-level accessibility checks.
- **Print:** use dedicated invoice/receipt/tag output with white paper, dark text, correct fonts, page breaks, and barcode quiet zones. Remove navigation, sticky actions, shadows, and decorative components. Validate PDFs and physical output independently from web styling.

## Icons

- Use only the free line icons from `@untitledui/icons` used by the public components. Do not import paid icon styles or premium illustration packs; verify package license and exports when pinning dependencies. Keep provided sizes, alignment, and stroke treatment. Do not mix Lucide or emoji into standard navigation and action controls.
- Choose available icons for inventory, scan/tagging, receipts, payments, customers, dashboard, notifications, settings, and Girvi. Pair unfamiliar concepts with explicit text, especially “Girvi.” Verify actual exports in the installed package.
- Decorative icons inherit semantic foreground styling and are hidden from assistive technology. Icon-only actions need accessible labels; tooltips supplement rather than replace them.
- Preserve visible text on invoice finalization, repayments, refunds, and collateral release. Icons alone must not communicate financial consequences.
- Use a free icon in a simple locally styled token-based container where useful for status messages. Do not add a premium featured-icon composition or illustration dependency. Avoid oversized decoration in financial panels.
- Generate real barcodes using the existing barcode integration. A barcode/QR icon is not a scannable article tag, payment instrument, or proof of payment.
