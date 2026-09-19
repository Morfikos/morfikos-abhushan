# 14 — Notifications, Outbox, and WhatsApp

**Status:** Specification only — not implemented  
**Depends on:** `01` worker, `06` consent, financial outbox events from `08`/`09`/`12`  
**Enables:** due reminders, failed-notification dashboard widgets  
**Blocked by:** official WhatsApp provider choice, account readiness, templates, consent language, reminder timing, budget  

## Feature Overview & Objectives

Send transactional invoice, receipt, due-payment, and Girvi messages through an official WhatsApp Business provider, with durable jobs and honest delivery states.

This unit does not use WhatsApp Web automation and does not treat provider acceptance as customer delivery. Worker restarts must not cause uncontrolled duplicate sends. Creating the Notifications screen does not configure the provider.

## Scope

### In this unit

- `pgboss` schema and worker consumers
- Transactional outbox dispatcher
- Notification records independent of queue rows
- Official WhatsApp adapter
- Webhook signature verification and durable deduplication
- Recurring reminder evaluation
- Consent and balance recheck immediately before send
- Staff Notifications UI with retry when safe
- Bounded concurrency and job retention separate from financial retention

### Explicitly out of this unit

- Promotional campaigns
- Redis or realtime
- Simulating successful delivery
- Interest posting from reminders
- Customer self-service opt-in portal beyond staff-recorded consent
- Offline message composition

## Acceptance Conditions

- Financial transactions only write outbox rows; they do not call WhatsApp
- Dispatcher enqueues after commit
- Consumers are idempotent on `notification` / event keys
- Before send: consent granted, recipient phone present, outstanding balance still due (for due/Girvi reminders), account not settled
- Statuses: `pending`, `accepted` (provider took it), `sent`, `delivered`, `failed`, `unknown`
- Duplicate or out-of-order webhooks cannot corrupt history
- Ambiguous send → `unknown`, not automatic resend
- Queue cleanup cannot delete notification or financial identity rows
- Reminders do not run usefully if the worker host is stopped — health must say so

## User Flows & Interactions

### Automatic transactional send

1. Invoice finalize/payment/Girvi event writes outbox.
2. Dispatcher creates a small job payload (ids + versions).
3. Worker loads organization and resource, rechecks eligibility, calls the adapter.
4. Notification row updates to `accepted` or `failed`.
5. Webhooks later move to `delivered` or `failed`/`unknown`.

### Scheduled reminders

1. Recurring evaluator selects due invoices / active Girvi accounts in the configured window.
2. For each candidate it rechecks consent and balances.
3. Settled accounts are skipped.
4. Eligible sends are recorded; ineligible are skipped with a reason, not marked delivered.

### Staff retry

1. Notifications table shows labeled statuses.
2. Retry is offered only for `failed` with a safe retry classification.
3. `unknown` requires reconcile, not a blind resend.

## Data Models & Schema Changes

### `outbox_events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `event_key` | `text` not null unique | |
| `event_type` | `text` not null | |
| `payload` | `jsonb` not null | identifiers only |
| `created_at` | `timestamptz` not null | |
| `dispatched_at` | `timestamptz` | |

### `notifications`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `organization_id` | `uuid` not null | |
| `customer_id` | `uuid` not null | |
| `channel` | `text` not null | `whatsapp` |
| `purpose` | `text` not null | matches consent purposes |
| `template_name` | `text` | |
| `provider_message_id` | `text` | |
| `status` | `text` not null | |
| `last_webhook_at` | `timestamptz` | |
| `consent_checked_at` | `timestamptz` | |
| `balance_checked_at` | `timestamptz` | |
| `related_type` / `related_id` | | invoice, payment, girvi |
| `dedupe_key` | `text` not null unique | |

### `notification_webhook_events`

Raw provider id + payload hash for durable dedupe. No staff bearer auth on the webhook route.

Job tables live in `pgboss`. Retention for successful jobs is operational and independent.

## API Contracts

| Method | Path | Auth |
| --- | --- | --- |
| `GET` | `/api/v1/notifications` | staff + permission |
| `POST` | `/api/v1/notifications/:id/retry` | staff; safe statuses only |
| `POST` | `/api/v1/webhooks/whatsapp` | provider signature on raw body |

Webhook must acknowledge after durable receipt. Parse only after signature check.

## UI/UX Requirements

- Free table, badges, buttons
- Status words: Pending, Accepted by provider, Sent, Delivered, Failed, Unknown
- Do not label acceptance as Delivered
- Local status messages and safe retry controls
- Poll the notifications view while visible; stop when hidden
- No customer phone in page URLs
- Reminder text must not include unnecessary private identity detail

## Edge Cases & Error Handling

- Provider 5xx after unknown accept: `unknown`, reconcile
- Template rejected: `failed`, no retry loop
- Consent revoked between enqueue and send: skip
- Balance settled between enqueue and send: skip
- Worker crash after send before DB update: dedupe by provider id / dedupe_key
- Host stopped: backlog grows; readiness/monitoring must surface it
- Missing WhatsApp config: integration error to operators, not fake ticks in the UI

## Open Questions

- Official provider
- Account ownership/readiness
- Permitted Girvi messaging and template names
- Language and reminder clock
- Messaging budget

## Step-by-Step Implementation Sub-tasks

1. Enable pg-boss in the worker with tested pooling/permissions.
2. Implement outbox writer (already used by finance) and dispatcher.
3. Create notification records and webhook tables.
4. Implement WhatsApp adapter behind `packages/integrations`.
5. Implement reminder evaluator with pre-send checks.
6. Build Notifications UI.
7. Tests: retry after crash, duplicate webhook, skip settled, skip revoked consent, finance not rolled back on send failure.
8. Keep provider setup a separate configuration checklist.

## Verification

Do not mark this complete on mocked “sent” responses. Record provider eligibility as outstanding until a real accepted template exists.
