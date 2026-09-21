# Owner-approved Girvi calculation fixtures

JSON fixtures in this directory encode owner-approved `girvi.v1` samples (21 September 2026).

The 2% rate is an illustrative test input, not a recommended lending rate. Unless a fixture states otherwise: principal ₹10,000, rate 2% per 30 days, no fees, no minimum period.

Each fixture includes:

- `id` — stable fixture id
- `policyVersion` — calculation policy version under test (`girvi.v1`)
- `policy` — approved `GirviCalculationPolicy` method families
- `terms` — the frozen `GirviTermsSnapshot` for the account
- `events` — posted `GirviLedgerEvent` rows in any order; the engine sorts by business date then sequence
- `checks` — one or more as-of statements, each with `expected` balances and an optional `repayment` allocation or `expectedErrorCode`

## Approved rules (girvi.v1)

1. Rate is a percentage **per 30 days**. "Monthly" is not used, and calendar months are not equal-cost.
2. Simple interest on outstanding principal. Unpaid interest never becomes principal and never earns interest.
3. Actual calendar days ÷ 30. The start date is counted; the repayment/settlement date is excluded from the preceding balance.
4. No minimum period, no grace period, and no late fees, penalties, storage charges, or overdue rate increases.
5. A repayment clears outstanding interest first, then reduces principal.
6. Principal reduction takes effect on the repayment's business date; the reduced principal accrues from that date onward.
7. Interest accrues at high decimal precision and rounds HALF_UP to ₹0.01 only when money moves or a statement is produced. Settlement payable stays in paise.
8. Amounts above the settlement payable are rejected. There is no customer credit or advance.

## Fixture files

| File | Covers |
| --- | --- |
| `01-date-boundaries-and-allocation.json` | Same-day, 1-day, 30-day, and 31-day periods; interest-only, insufficient, and partial repayment allocation; overpayment rejection |
| `02-february-boundary.json` | 28-day February period |
| `03-leap-year-boundary.json` | 29-day February period in 2028 |
| `04-insufficient-payment-no-compounding.json` | Carried unpaid interest that does not compound |
| `05-partial-repayment-then-settlement.json` | ₹2,000 partial repayment then ₹8,181 settlement |
| `06-same-date-repayments.json` | Deterministic same-date posting order with no extra accrual days |
| `07-opening-balance-cutover.json` | Imported opening principal and pre-cutover unpaid interest (spec 16 shape) |

## Rules for maintainers

1. Do not invent new Girvi methods without an owner decision and a new policy version.
2. Old policy versions keep their fixtures; new versions get new files. Existing accounts stay frozen on the version they were activated with.
3. `pnpm verify:girvi-calculation` requires exact matches for every check in every fixture JSON.
4. Seed the live org with `pnpm seed:girvi-calculation-policy` so Girvi statements and settlement can run.
