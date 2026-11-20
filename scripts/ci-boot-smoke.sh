#!/usr/bin/env bash
# Startet das gebaute Backend (node dist/main) und verlangt 200 von /healthz
# und /ready. Migrationen und der Build laufen in eigenen CI-Schritten davor.
# Anbieter-Schlüssel werden geleert, damit ein lokales .env keine echten
# Aufrufe und keine Beispielwerte einschaltet.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root/backend"

: "${DATABASE_URL:?DATABASE_URL fehlt}"
: "${REDIS_URL:?REDIS_URL fehlt}"

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
export APP_USER_ID="${APP_USER_ID:-00000000-0000-0000-0000-000000000000}"
export APP_ACCESS_TOKEN="${APP_ACCESS_TOKEN:-ci-not-a-secret}"
export JWT_SECRET="${JWT_SECRET:-ci-not-a-secret}"
export INTERNAL_SERVICE_TOKEN="${INTERNAL_SERVICE_TOKEN:-ci-not-a-secret}"
export WEBHOOK_SECRET_KLEINANZEIGEN="${WEBHOOK_SECRET_KLEINANZEIGEN:-ci-not-a-secret}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:${PORT}}"
export UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
export SALE_CONFLICT_DEBOUNCE_MS="${SALE_CONFLICT_DEBOUNCE_MS:-15000}"

export GEMINI_API_KEY=
export GEMINI_VISION_MODEL=
export EBAY_CLIENT_ID=
export EBAY_CLIENT_SECRET=
export EBAY_REFRESH_TOKEN=
export EBAY_FULFILLMENT_POLICY_ID=
export EBAY_PAYMENT_POLICY_ID=
export EBAY_RETURN_POLICY_ID=
export EBAY_MERCHANT_LOCATION_KEY=
export EBAY_PICKUP_FULFILLMENT_POLICY_ID=
export EBAY_ENVIRONMENT=
export S3_BUCKET=
export S3_REGION=
export S3_ENDPOINT=
export S3_ACCESS_KEY_ID=
export S3_SECRET_ACCESS_KEY=
export S3_PUBLIC_URL_BASE=

if [[ ! -f dist/main.js ]]; then
  echo "dist/main.js fehlt. Vorher im backend \`npm run build\` ausführen." >&2
  exit 1
fi

log="${RUNNER_TEMP:-/tmp}/resale-boot.log"
node dist/main >"$log" 2>&1 &
pid=$!

cleanup() {
  local status=$?
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  exit "$status"
}
trap cleanup EXIT

if ! node "$root/scripts/ci-wait-healthy.mjs" "http://127.0.0.1:${PORT}" "${BOOT_TIMEOUT_MS:-90000}" "$pid"; then
  echo "----- Backend-Log -----" >&2
  cat "$log" >&2 || true
  exit 1
fi
