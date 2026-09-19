# 05 — Barcode Tagging and Hardware

**Status:** Specification only — not implemented  
**Depends on:** `04-inventory-and-article-receiving`  
**Enables:** POS scan billing, physical tag reprint, hardware acceptance  
**Blocked by:** shop confirmation of scanner model, scan suffix, tag printer, and label dimensions  

## Feature Overview & Objectives

Give each article one permanent scannable Code 128 identifier and a printable tag. Staff should retrieve the correct record by scanning instead of typing codes.

A print preview is not acceptance. This unit must be validated against the shop’s actual scanner and printer before launch. Until hardware evidence exists, keep configured dimensions explicit and unverified.

## Scope

### In this unit

- Permanent unique barcode generation per article
- Dedicated scanner input handling in the web app
- Tag HTML print view and reprint with the original identifier
- Batch tag print for newly received articles
- Device settings consumption (terminator/suffix, label size)
- Barcode generation via bwip-js
- Audited reprints
- Lookup feedback: found, duplicate scan in a session, unavailable article

### Explicitly out of this unit

- Invoice finalization
- RFID
- Silent/automatic printing
- WhatsApp of tag images
- Offline scan queues that later post sales
- Treating a barcode icon as a real tag

## Acceptance Conditions

- One article has exactly one permanent barcode for its life
- Reprint never issues a new identifier
- Keyboard-wedge scanner input is handled in a dedicated field and does not globally swallow all key events
- Configured terminator (often Enter) completes lookup and must not finalize payment on POS
- Lookup p95 target is below 500 ms under the agreed pilot load; measure later, do not claim it now
- Physical tag is readable and the shop scanner returns the stored barcode
- Print failures are visible; a successful preview does not mark a tag as printed-on-hardware

## User Flows & Interactions

### Generate and print after receiving

1. After an article is saved, staff open Print tag or select multiple received rows.
2. The API ensures each selected article has a barcode.
3. The web opens a dedicated print view: white paper, dark text, Code 128, quiet zone, article number, metal, purity, weight as configured.
4. Staff confirm Print. The browser print dialog is explicit.
5. Staff record whether the physical tag printed. Failed printer output can be retried without changing the barcode.

### Scan lookup

1. Focus is in the dedicated scan field.
2. Scanner types the barcode and the configured suffix/terminator.
3. The client calls lookup. Success shows the article. Failure shows Unavailable, Unknown barcode, or Network error.
4. Duplicate scan in the same POS draft is feedback only; it does not reserve stock.

### Reprint

1. Authorized staff choose Reprint on the article.
2. They enter a reason.
3. The same barcode is printed and an audit row is written.

## Data Models & Schema Changes

### `article_barcodes`

Prefer storing `articles.barcode` as the canonical unique value. Use this table only if history of generation attempts is needed.

| Column | Type | Notes |
| --- | --- | --- |
| `article_id` | `uuid` PK/FK | |
| `barcode` | `text` not null unique per org | Code 128-safe payload |
| `symbology` | `text` not null default `'code128'` | |
| `assigned_at` | `timestamptz` not null | |
| `assigned_by_staff_user_id` | `uuid` not null | |

### `tag_print_events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `article_id` | `uuid` not null | |
| `barcode` | `text` not null | copy of printed value |
| `print_kind` | `text` not null | `initial`, `reprint`, `batch` |
| `reason` | `text` | required for reprint |
| `template_version` | `text` not null | |
| `actor_staff_user_id` | `uuid` not null | |
| `created_at` | `timestamptz` not null | |

Device settings remain in spec 03. Do not invent label mm if unconfirmed; store owner-provided values and mark `hardware_validated_at` null until a drill succeeds.

## API Contracts

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/articles/:id/barcode` | `inventory.write` | idempotent assign |
| `POST` | `/api/v1/articles/barcodes/batch` | `inventory.write` | assign missing only |
| `GET` | `/api/v1/articles/lookup` | inventory or billing | by barcode |
| `POST` | `/api/v1/articles/:id/tag-prints` | `inventory.write` | records print intent/reprint |
| `GET` | `/api/v1/articles/:id/tag-preview` | `inventory.read` | returns print DTO, not a public image URL |

Barcode payload must be deterministic and collision-checked inside the organization.

## UI/UX Requirements

- Dedicated scan input, visually separate from ordinary text fields
- Tag preview uses actual configured dimensions, not a decorative card
- Print view strips navigation, sticky actions, shadows, and dashboard colors
- Monospace only for the article/barcode identifier
- Free buttons labeled Print tag and Reprint tag — icons never replace those labels
- Batch print uses the free table + checkboxes
- Empty/error: Unknown barcode, Unavailable, Printer not confirmed

Scanner Enter on POS (spec 08) must only add a line. This unit provides the shared scan helper.

## Edge Cases & Error Handling

- Scanner connected as keyboard but suffix unexpected: show raw buffer and fail lookup rather than submitting the wrong form
- Two staff print the same new article: barcode assign is idempotent
- Article sold: reprint of the historical tag is allowed for recovery; lookup for POS add must fail as sold
- Printer offline: keep the barcode; show print failure
- Preview OK, physical unreadable: do not mark hardware validation complete
- Offline browser: do not queue scans as future sales; show connectivity error
- Quiet-zone clipping from CSS overflow: treat as a print defect

## Open Questions

- Barcode reader model and suffix
- Tag printer and label size
- Bilingual tag text
- Whether article selling price appears on the tag (do not assume)

## Step-by-Step Implementation Sub-tasks

1. Implement unique barcode generation and persistence.
2. Add bwip-js adapter in `packages/integrations` for Code 128.
3. Build HTML tag print view with isolated print CSS.
4. Implement the shared scan-field component with terminator handling.
5. Wire lookup errors and duplicate-scan feedback.
6. Record print/reprint audit events.
7. Add tests for uniqueness, idempotent assign, and sold-article POS rejection.
8. Perform a hardware drill when devices are available; record pass/fail separately from unit tests.

## Verification

Unit tests do not replace the scanner/printer drill. Track hardware validation as incomplete until physical evidence exists.
