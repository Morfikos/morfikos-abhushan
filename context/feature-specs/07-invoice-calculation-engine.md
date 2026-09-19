# 07 — Invoice Calculation Engine

**Status:** Specification only — not implemented  
**Depends on:** `03-shop-settings-and-organization`, `04-inventory-and-article-receiving`  
**Enables:** `08-pos-billing-and-finalization`  
**Blocked by:** owner-approved invoice examples for purity, making charges, wastage, stones, discounts, tax, and rounding  

## Feature Overview & Objectives

Provide one pure, versioned, decimal invoice calculator that both the API and any UI preview use. Staff today calculate totals by hand. The engine must reproduce owner-approved examples and refuse unsupported rules instead of guessing.

This unit is domain-only. It does not finalize invoices, print PDFs, or post stock. Frontend previews are non-authoritative.

## Scope

### In this unit

- `packages/domain` invoice pricing policy interface
- decimal.js arithmetic with explicit units, scale, and rounding stage
- Versioned calculation policy records
- Quote breakdown DTO: metal value, making, wastage, stones, discounts, tax, round-off, grand total
- Fixture harness for owner-approved examples
- Visible failure for unconfirmed rule combinations

### Explicitly out of this unit

- Inferring rules from a UI mockup
- A second calculator in Next.js components or workers
- Girvi interest (spec 12)
- JavaScript `Number`, `parseFloat`, or `toFixed` as the engine
- Payment allocation

## Acceptance Conditions

- All money/weight/rate inputs and outputs are decimal strings at the boundary
- Database `NUMERIC` values are never converted to IEEE floats for computation
- Policy version is part of the result snapshot
- Missing or unconfirmed rule → domain error, not a guessed total
- Approved fixtures pass exactly
- Changing a later default policy does not change fixture results for old versions
- No HTTP, React, or provider SDK imports in `packages/domain`

## User Flows & Interactions

There is no staff page whose only job is “the engine.” POS (spec 08) calls it.

Developer/owner flow:

1. Owner supplies invoice samples and expected totals.
2. Engineers encode each sample as a fixture: inputs, policy version, expected breakdown.
3. The calculator is implemented until fixtures pass.
4. Unsupported samples stay listed as blocked, not approximated.

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
| `making_charge_method` | `text` | set only when approved |
| `wastage_method` | `text` | set only when approved |
| `discount_method` | `text` | |
| `tax_method` | `text` | |
| `rounding_mode` | `text` | decimal rounding mode |
| `rounding_scale` | `integer` | typically 2 for INR |
| `approved_at` | `timestamptz` | |
| `approved_by_staff_user_id` | `uuid` | |

Do not fill methods with guessed defaults. A policy used for live finalization must be `approved`.

### Domain input (not a table)

```text
policyVersion
businessDate
lines[]:
  articleId? (optional for fixtures)
  metal, purity
  grossWeightGrams, nonMetalWeightGrams, netMetalWeightGrams
  ratePerGram
  makingChargeInput (shape depends on approved method)
  wastageInput
  stoneCharges[]
  lineDiscountInput
invoiceDiscountInput
taxInput
```

### Domain output

Breakdown per line and invoice totals as decimal strings, plus `policyVersion` and `roundingApplied`.

## API Contracts

This unit may expose a quote helper used by POS:

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/invoices/quote` | `billing.write` | server-authoritative quote; not a sale |

The HTTP handler only validates input and calls the domain/application service. It does not reimplement math.

Error codes:

- `CALCULATION_POLICY_UNAPPROVED`
- `CALCULATION_RULE_UNSUPPORTED`
- `CALCULATION_INPUT_INVALID`

## UI/UX Requirements

No dedicated calculator settings page beyond showing the active approved policy name/version on POS later.

If a quote fails because rules are unapproved, show a local inline alert: calculations are blocked pending owner examples. Do not display a plausible but unofficial total.

When a quote succeeds, render the server breakdown with tabular numerals, ₹ labels, and right-aligned amounts. Local preview, if any, must call the same policy and still be revalidated on the server.

## Edge Cases & Error Handling

- Purity without a rate for that business date: `422`
- Weight precision beyond `NUMERIC(14,4)`: reject
- Mixing approved and unsupported making-charge bases: reject the unsupported line
- Discount greater than taxable base: reject unless an approved rule allows it
- Fixture drift after policy edit: old version fixtures must still pass; new version gets new fixtures
- UI rounding for display must not feed the next calculation

## Open Questions

These block live calculator approval, not workspace setup:

- Purity and rate handling
- Making-charge method(s)
- Wastage convention
- Stone charges
- Discounts
- Tax treatment
- Rounding
- Required invoice fields

Until approved, implement the engine interface and fixture harness only.

## Step-by-Step Implementation Sub-tasks

1. Add decimal helpers and explicit rounding policy types in `packages/domain`.
2. Define the calculation policy schema and `approved` gate.
3. Implement `quoteInvoice(input, policy)` with discriminated method unions.
4. Return structured unsupported-rule errors.
5. Add a fixture folder for owner examples; keep it empty-but-failing until samples arrive, or skip live totals.
6. Expose `POST /invoices/quote` as a thin wrapper.
7. Add unit tests that fail closed without fixtures rather than generating fake gold prices.
8. When examples arrive, encode them and do not mark this unit complete until they pass.

## Verification

Owner-approved fixtures are mandatory before POS finalization uses the engine. Do not mark billing complete on synthetic placeholder math.
