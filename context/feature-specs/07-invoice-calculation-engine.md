# 07 — Invoice Calculation Engine

**Status:** Implemented — owner-approved `invoice.v1`  
**Depends on:** `03-shop-settings-and-organization`, `04-inventory-and-article-receiving`  
**Enables:** `08-pos-billing-and-finalization`  

## Feature Overview & Objectives

Provide one pure, versioned, decimal invoice calculator that both the API and any UI preview use. Staff today calculate totals by hand. The engine reproduces owner-approved `invoice.v1` rules and refuses unsupported methods instead of guessing.

This unit is domain-only. It does not finalize invoices, print PDFs, or post stock. Frontend previews are non-authoritative.

## Scope

### In this unit

- `packages/domain` invoice pricing policy and `quoteInvoice`
- decimal.js arithmetic with explicit units, scale, and rounding stage
- Versioned calculation policy records (`invoice.v1` methods approved)
- Quote breakdown DTO: metal value, making, wastage, stones, discounts, tax, round-off, grand total
- Owner-approved fixtures under `packages/domain/fixtures/invoice-examples/`
- Fail-closed behavior for draft/incomplete policies and invalid inputs

### Explicitly out of this unit

- Inferring rules from a UI mockup
- A second calculator in Next.js components or workers
- Girvi interest (spec 12)
- JavaScript `Number`, `parseFloat`, or `toFixed` as the engine
- Payment allocation
- Per-carat stone pricing and loose-stone tax classifications (later)
- Place-of-supply UI (MVP defaults to intra-state CGST+SGST; IGST available when selected)

## Acceptance Conditions

- All money/weight/rate inputs and outputs are decimal strings at the boundary
- Database `NUMERIC` values are never converted to IEEE floats for computation
- Policy version is part of the result snapshot
- Missing or unconfirmed rule → domain error, not a guessed total
- Approved fixtures pass exactly
- Changing a later default policy does not change fixture results for old versions
- No HTTP, React, or provider SDK imports in `packages/domain`

## Owner-approved invoice.v1 rules (20 September 2026)

| Topic | Rule |
| --- | --- |
| Purity / rate | Separate daily ₹/g rate per metal+purity; metal value = net metal weight × rate; no 22/24 conversion |
| Making | Fixed ₹, ₹/g net metal, or % of metal value; one method per line; ₹0 allowed |
| Wastage | Default none; optional % of net metal × rate; does not change making weight or inventory weight |
| Stones | Fixed ₹ charge + optional description; weight does not set price |
| Discounts | Line then invoice, ₹ or %; reject excessive discounts; allocate invoice discount across lines |
| Tax | Tax-exclusive 3% GST on taxable jewellery value (intra 1.5+1.5; inter 3% IGST) |
| Rounding | Components and tax to paise HALF_UP; payable to nearest ₹1 with separate round-off |
| Weights | Preserve scale precision; do not round weights to two decimals |

Calculation order per line:

Metal → Making → Wastage → Stones → Line discount → Allocated invoice discount = Taxable  
Sum taxable + GST + round-off = Invoice total

## User Flows & Interactions

There is no staff page whose only job is “the engine.” POS (spec 08) calls it.

Developer/owner flow:

1. Owner supplies invoice rules (done for `invoice.v1`).
2. Engineers encode samples as fixtures: inputs, policy version, expected breakdown.
3. The calculator matches fixtures exactly.
4. Seed approved policy: `pnpm seed:calculation-policy`.

## Data Models & Schema Changes

### `calculation_policies`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `version` | `text` not null | e.g. `invoice.v1` |
| `status` | `text` not null | `draft`, `approved`, `retired` |
| `currency` | `text` not null default `'INR'` | |
| `weight_unit` | `text` not null default `'g'` | |
| `rate_unit` | `text` not null default `'per_g'` | |
| `making_charge_method` | `text` | `line_fixed_per_gram_or_percent` for invoice.v1 |
| `wastage_method` | `text` | `percent_of_net_weight` |
| `discount_method` | `text` | `line_then_invoice_amount_or_percent` |
| `tax_method` | `text` | `gst_jewellery_3pct_exclusive` |
| `rounding_mode` | `text` | `ROUND_HALF_UP` |
| `rounding_scale` | `integer` | `2` for component/tax paise |
| `approved_at` | `timestamptz` | |
| `approved_by_staff_user_id` | `uuid` | |

A policy used for live finalization must be `approved` with methods set.

## API Contracts

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/invoices/quote` | `billing.write` | server-authoritative quote; not a sale |

Error codes:

- `CALCULATION_POLICY_UNAPPROVED`
- `CALCULATION_RULE_UNSUPPORTED`
- `CALCULATION_INPUT_INVALID`

## UI/UX Requirements

No dedicated calculator settings page beyond showing the active approved policy name/version on POS.

When a quote fails (missing rate, invalid input), show a local inline alert. Do not display a plausible but unofficial total.

When a quote succeeds, render the server breakdown with tabular numerals, ₹ labels, and right-aligned amounts.

## Edge Cases & Error Handling

- Purity without a rate for that business date: `422`
- Weight precision beyond `NUMERIC(14,4)`: reject
- Discount greater than taxable base: reject (no silent cap)
- Fixture drift after policy edit: old version fixtures must still pass; new version gets new fixtures
- UI rounding for display must not feed the next calculation

## Open Questions

Resolved for `invoice.v1` by owner decision (20 September 2026). Remaining operational confirmations:

- Shop accountant should confirm GST registration treatment and place-of-supply before live inter-state invoices
- POS line-level making/wastage/stone/discount UI (shipped in spec 08; defaults remain ₹0 making / no wastage until staff edit)
- Hallmark / HUID print policy on finalized documents (spec 13)

## Step-by-Step Implementation Sub-tasks

1. Add decimal helpers and explicit rounding policy types in `packages/domain`.
2. Define the calculation policy schema and `approved` gate.
3. Implement `quoteInvoice(input, policy)` with discriminated method unions.
4. Return structured unsupported-rule errors.
5. Encode owner-approved fixtures; verify exact matches.
6. Expose `POST /invoices/quote` as a thin wrapper.
7. Seed approved `invoice.v1` for the shop organization.

## Verification

- `pnpm verify:invoice-calculation` — fixtures + RLS + approved quote sample
- `pnpm seed:calculation-policy` — idempotent approved policy upsert
- POS finalization (spec 08) uses the same engine; live sale requires an applicable metal rate for the business date
