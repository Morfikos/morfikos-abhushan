# WhatsApp Cloud API configuration checklist (spec 14)

Creating the Notifications screen and worker consumers does **not** configure WhatsApp. Delivery stays failed with `WHATSAPP_NOT_CONFIGURED` until an official Business account and templates are ready. Do not treat provider acceptance as customer delivery.

## Prerequisites

- [x] Meta / WhatsApp Business account ownership confirmed for the shop (WABA + test number)
- [x] Phone number registered for Cloud API (sandbox test number is enough for first sends)
- [ ] Template names **Approved** for each purpose (invoice, receipt, due reminder, Girvi reminder)
- [ ] Consent language reviewed with the owner; staff record grants per purpose (spec 06)
- [ ] Reminder send window and language set under Settings → Reminders
- [ ] Messaging budget / rate limits agreed
- [ ] Long-lived / system-user access token (temporary tokens expire quickly)

## Environment variables (API + worker)

Root `.env` (gitignored), loaded by `tsx --env-file=../../.env`:

```bash
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
# Optional helpers for scripts
# WHATSAPP_APP_ID=
# WHATSAPP_WABA_ID=
# Optional overrides
# WHATSAPP_API_VERSION=v21.0
# WHATSAPP_TEMPLATE_INVOICE=aabhushan_invoice_v2
# WHATSAPP_TEMPLATE_RECEIPT=aabhushan_receipt_v2
# WHATSAPP_TEMPLATE_DUE_REMINDER=aabhushan_due_reminder_v2
# WHATSAPP_TEMPLATE_GIRVI_REMINDER=aabhushan_girvi_reminder_v2
```

The first names (`transactional_invoice`, `transactional_receipt`, `due_reminder`, `girvi_reminder`) were submitted as Marketing and got stuck on a category edit. Local `.env` now points at new Utility templates created 21 Sep 2026. Restart API and worker after changing these.

Names currently configured in `.env` (Utility, pending Meta review):

| Purpose | Template name | Body params (order) |
|---|---|---|
| Invoice | `aabhushan_invoice_v2` | invoice number, amount due |
| Receipt | `aabhushan_receipt_v2` | receipt number, amount |
| Due reminder | `aabhushan_due_reminder_v2` | invoice number, amount due |
| Girvi reminder | `aabhushan_girvi_reminder_v2` | account number |

If those overrides are unset, the adapter falls back to `transactional_invoice`, `transactional_receipt`, `due_reminder`, and `girvi_reminder`.

Language codes sent by the app: `en` or `hi` (from Settings → Reminders). Prefer **Utility** category in Meta; Marketing may be rejected or rate-limited differently.

## Webhook

- URL: `https://<api-host>/api/v1/webhooks/whatsapp`
- Verify token must match `WHATSAPP_VERIFY_TOKEN`
- Signature header `X-Hub-Signature-256` verified with `WHATSAPP_APP_SECRET` on the raw body
- No staff bearer token on this route
- Subscribe field: `messages` on object `whatsapp_business_account`

### Local development tunnel

Meta cannot call `localhost`. With API on `:3001`:

```bash
# one-time: cloudflared binary under .tools/ (gitignored)
# then, while pnpm dev is running:
./scripts/whatsapp-dev-tunnel.sh
```

The script starts a Cloudflare quick tunnel, checks the GET challenge, and re-registers the Meta app webhook + WABA `subscribed_apps`. Leave it running while testing. Each restart gets a **new** hostname, so re-run the script after kill/restart.

Manual Graph registration (same effect):

```bash
# App access token = APP_ID|APP_SECRET
curl -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_APP_ID}/subscriptions" \
  -H "Authorization: Bearer ${WHATSAPP_APP_ID}|${WHATSAPP_APP_SECRET}" \
  --data-urlencode "object=whatsapp_business_account" \
  --data-urlencode "callback_url=https://<tunnel>/api/v1/webhooks/whatsapp" \
  --data-urlencode "verify_token=${WHATSAPP_VERIFY_TOKEN}" \
  --data-urlencode "fields=messages" \
  --data-urlencode "include_values=true"

curl -X POST "https://graph.facebook.com/v21.0/${WHATSAPP_WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}"
```

## Ops

- Worker must be running (`pg-boss` schema + reminder schedules). If the host is stopped, reminder backlog grows and no due messages are sent.
- Queue job retention is independent of `app.notifications` history.
- Do not mark this integration complete on mocked “sent” responses. Record a real accepted template before pilot.
- Sandbox test numbers only deliver to Meta allowlisted recipient phones.
- Temporary User tokens expire; replace with a system-user token before relying on sends.

## First send checklist

1. Templates status **APPROVED** (exact names above, language matching Settings).
2. `pnpm dev` running; tunnel script running (or production HTTPS API).
3. Customer has E.164 phone + consent for the purpose under test.
4. Finalize invoice / record payment → watch `/notifications` for `pending` → `accepted` → `sent`/`delivered`.
