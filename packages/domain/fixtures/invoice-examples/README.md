# Owner-approved invoice calculation fixtures

JSON fixtures in this directory encode owner-approved `invoice.v1` samples (20 September 2026).

Each fixture includes:

- `id` — stable fixture id
- `policyVersion` — calculation policy version under test (`invoice.v1`)
- `policy` — approved `CalculationPolicy` with invoice.v1 method families
- `input` — `InvoiceQuoteInput` shape (domain)
- `expected` — full quote breakdown as decimal strings

## Approved rules (invoice.v1)

1. Metal value = net metal weight × selected purity’s daily rate (₹/g). No automatic 22/24 conversion.
2. Making: fixed ₹, ₹/g net metal, or % of metal value (one method per line; ₹0 allowed).
3. Wastage: default none; optional % of net metal weight × metal rate (does not change making weight).
4. Stones: fixed ₹ charge with optional description (weight does not set price).
5. Discounts: line then invoice, ₹ or %; reject excessive discounts; allocate invoice % across lines.
6. Tax: tax-exclusive 3% GST on taxable jewellery value (intra: 1.5% CGST + 1.5% SGST; inter: 3% IGST).
7. Rounding: components and tax to paise (HALF_UP); payable to nearest ₹1 with separate round-off.

Order: metal → making → wastage → stones → line discount → allocated invoice discount = taxable; + GST + round-off = payable.

## Fixture files

| File | Covers |
| --- | --- |
| `01-basic-metal-zero-making.json` | Net × rate, ₹0 making, intra GST, no round-off |
| `02-making-per-gram-wastage-stones.json` | Per-gram making, wastage %, stones, round-off |
| `03-making-percent-line-invoice-discount.json` | % making, line ₹ discount, invoice % allocation, two lines |
| `04-round-off-half-up-igst.json` | IGST 3%, weight precision preserved, ₹1 round-off |

## Rules for maintainers

1. Do not invent new commercial methods without an owner decision and a new policy version.
2. Old policy versions keep their fixtures; new versions get new files.
3. `pnpm verify:invoice-calculation` requires exact breakdown matches for every fixture JSON.
4. Seed the live org with `pnpm seed:calculation-policy` so POS can use the approved policy.
