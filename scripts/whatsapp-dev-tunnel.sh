#!/usr/bin/env bash
# Local Spec 14 helper: quick Cloudflare tunnel + re-register Meta webhook.
# Requires: pnpm dev already listening on :3001, .env WhatsApp vars, .tools/cloudflared.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLOUDFLARED="${ROOT}/.tools/cloudflared"
if [[ ! -x "$CLOUDFLARED" ]]; then
  echo "Missing $CLOUDFLARED — download cloudflared darwin-arm64 into .tools/ first." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Missing .env" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
# Read only WHATSAPP_* keys without sourcing whole .env (may contain shell-unsafe chars).
eval "$(python3 - <<'PY'
from pathlib import Path
for line in Path(".env").read_text().splitlines():
    if line.startswith("WHATSAPP_") and "=" in line:
        k, v = line.split("=", 1)
        print(f"export {k}={v!r}")
PY
)"
set +a

: "${WHATSAPP_APP_SECRET:?}"
: "${WHATSAPP_VERIFY_TOKEN:?}"
: "${WHATSAPP_ACCESS_TOKEN:?}"

APP_ID="${WHATSAPP_APP_ID:-2505774849900532}"
WABA_ID="${WHATSAPP_WABA_ID:-1440093601463103}"
LOG="$(mktemp -t whatsapp-tunnel.XXXXXX.log)"

echo "Starting cloudflared → http://127.0.0.1:3001 (log: $LOG)"
"$CLOUDFLARED" tunnel --url http://127.0.0.1:3001 --no-autoupdate >"$LOG" 2>&1 &
CF_PID=$!
trap 'kill "$CF_PID" 2>/dev/null || true' EXIT

HOST=""
for _ in $(seq 1 40); do
  HOST="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG" | head -1 || true)"
  if [[ -n "$HOST" ]]; then
    break
  fi
  sleep 0.5
done

if [[ -z "$HOST" ]]; then
  echo "Could not parse tunnel URL. Log:" >&2
  cat "$LOG" >&2
  exit 1
fi

CALLBACK="${HOST}/api/v1/webhooks/whatsapp"
echo "Tunnel: $HOST"
echo "Callback: $CALLBACK"

# Local challenge check through tunnel
CHALLENGE_OUT="$(curl -fsS -G "$CALLBACK" \
  --data-urlencode 'hub.mode=subscribe' \
  --data-urlencode "hub.verify_token=${WHATSAPP_VERIFY_TOKEN}" \
  --data-urlencode 'hub.challenge=tunnel-check')"
if [[ "$CHALLENGE_OUT" != "tunnel-check" ]]; then
  echo "Webhook challenge failed via tunnel: $CHALLENGE_OUT" >&2
  exit 1
fi
echo "Challenge OK"

APP_TOKEN="${APP_ID}|${WHATSAPP_APP_SECRET}"
curl -fsS -X POST "https://graph.facebook.com/v21.0/${APP_ID}/subscriptions" \
  -H "Authorization: Bearer ${APP_TOKEN}" \
  --data-urlencode "object=whatsapp_business_account" \
  --data-urlencode "callback_url=${CALLBACK}" \
  --data-urlencode "verify_token=${WHATSAPP_VERIFY_TOKEN}" \
  --data-urlencode "fields=messages" \
  --data-urlencode "include_values=true" >/dev/null
echo "App subscription updated"

curl -fsS -X POST "https://graph.facebook.com/v21.0/${WABA_ID}/subscribed_apps" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}" >/dev/null
echo "WABA subscribed_apps OK"

echo
echo "Webhook is active. Leave this process running while testing."
echo "Press Ctrl+C to stop the tunnel."
wait "$CF_PID"
