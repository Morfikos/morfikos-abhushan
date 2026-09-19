# 10 — Returns, Refunds, and Reversals

**Status:** Specification only — not implemented  
**Depends on:** `09-payments-and-outstanding-balances`, `04-inventory-and-article-receiving`  
**Enables:** accurate dues, stock re-entry after inspection, dashboard returns  
**Blocked by:** shop rules for inspection, credit notes, and who approves refunds  

## Feature Overview & Objectives

Correct finalized sales without editing or deleting history. Staff need linked returns, credit notes, refunds, and payment reversals so a customer statement remains explainable.

Returned pieces stay out of available stock until inspected. Refunds and credits must not reduce a balance twice.

## Scope

### In this unit

- Return request against a finalized invoice line/article
- Inspection gate and inventory release (uses spec 04 statuses)
- Credit note linked to the original invoice
- Refund of money already collected
- Payment reversal linked to the original payment
- Permissions for refund approval
- Audit reasons

### Explicitly out of this unit

- Silent invoice edits
- Old-gold exchange as a return substitute
- Automatic restock on customer request
- Accounting software export
- Girvi release (spec 12)

## Acceptance Conditions

- Finalized invoices are never updated in place for amounts, lines, or customer snapshots
- A return writes new records that reference the original
- Article moves to `return_inspection` immediately on accepted return, not `available`
- Inspection release is a separate inventory action
- Refund amount cannot exceed net collected on the related invoice after prior refunds
- Reversal and refund cannot both subtract the same payment
- `refunds.approve` is server-enforced
- Idempotency on refund/reversal/return-accept

## User Flows & Interactions

### Return an article

1. Authorized staff open a finalized invoice and choose Return article.
2. They record reason and customer acknowledgment as required.
3. Confirmation lists invoice, article, and consequence: stock will be under review, not for sale.
4. API accepts the return: credit note draft/issue per approved policy, article `return_inspection`, `return_in` movement.
5. Customer sales due decreases only by the approved credit, not twice via a parallel refund unless money is actually returned.

### Inspect

1. Inventory staff inspect the piece (spec 04).
2. They release to `available` or keep `unavailable`.
3. Financial credit is independent of making the piece sellable again.

### Refund or reverse

1. Owner/admin opens the payment or invoice.
2. They choose Refund (money out) or Reverse (correct a mistaken posting) with a reason.
3. The UI uses those words, not a generic Delete.
4. API writes a linked compensating payment with negative allocation effect and a new receipt/refund document as applicable.

## Data Models & Schema Changes

### `invoice_returns`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `invoice_id` | `uuid` not null | finalized only |
| `article_id` | `uuid` not null | |
| `invoice_line_id` | `uuid` not null | |
| `status` | `text` not null | `accepted`, `rejected` |
| `reason` | `text` not null | |
| `accepted_by_staff_user_id` | `uuid` not null | |
| `created_at` | `timestamptz` not null | |

### `credit_notes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `credit_note_number` | `text` not null unique per org | |
| `invoice_id` | `uuid` not null | |
| `return_id` | `uuid` | |
| `amount_inr` | `numeric(18,2)` not null | snapshot of credited sale amount |
| `issued_at` | `timestamptz` not null | |

Credit reduces `amount_due_inr` / sales due. It does not by itself create a cash outflow.

### `payment_reversals` / compensating `payments`

Prefer a new `payments` row with `status` and `reversed_by_payment_id` / `reverses_payment_id` rather than deleting. Type: `reversal` or `refund`.

Refunds require `refunds.approve`. Reversals of same-day miskeys may use the same permission until the shop says otherwise.

## API Contracts

| Method | Path | Permission | Idempotent |
| --- | --- | --- | --- |
| `POST` | `/api/v1/invoices/:id/returns` | billing + policy | **required** |
| `POST` | `/api/v1/payments/:id/refunds` | `refunds.approve` | **required** |
| `POST` | `/api/v1/payments/:id/reversals` | `refunds.approve` | **required** |
| `GET` | `/api/v1/invoices/:id/corrections` | billing/admin | history |

Do not expose `DELETE /invoices/:id`.

## UI/UX Requirements

- Invoice detail shows correction history
- Confirmation modal: article, amounts, Return vs Refund vs Reverse
- Status Under review on returned stock
- Customer statement lines labeled so credits and refunds are distinct
- Free modal foundation, locally authored content

## Edge Cases & Error Handling

- Return of an already returned line: `409`
- Return of a sold article that was already adjusted out: `422`
- Refund larger than net collected: `422`
- Double-click refund: same idempotency key
- Credit plus refund of the same remaining due: allow only when the customer was paid up and money must go back; never reduce due below zero
- Inspection skipped: article must not appear in POS lookup
- Network drop: unresolved, retry same key

## Open Questions

- Inspection checklist
- Who approves refunds besides owner/admin
- Whether credit notes can remain unrefunded store credit (MVP default: credit reduces invoice due only; no general wallet)
- Restock pricing after return

## Step-by-Step Implementation Sub-tasks

1. Migrate returns, credit notes, and compensating payment links.
2. Implement accept-return transaction: lock invoice/article, write credit, movement, audit, outbox.
3. Reuse spec 04 inspection release.
4. Implement refund/reversal with balance guards.
5. Build invoice correction UI.
6. PostgreSQL tests: no in-place invoice edit, no double restock, no double refund, org isolation.

## Verification

Reconstruct a customer balance from original invoice + payments + credits + refunds and match the statement. Confirm POS cannot sell an uninspected return.
