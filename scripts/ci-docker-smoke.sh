#!/usr/bin/env bash
# Startet das gebaute Coolify-Image im Host-Netz, damit es die
# Postgres- und Redis-Service-Container unter 127.0.0.1 erreicht.
# Es werden keine Anbieter-Schlüssel übergeben.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="${1:-multimarkt:ci}"
name="${CI_DOCKER_NAME:-resale-ci}"

: "${DATABASE_URL:?DATABASE_URL fehlt}"
: "${REDIS_URL:?REDIS_URL fehlt}"

docker rm -f "$name" >/dev/null 2>&1 || true

cleanup() {
  local status=$?
  if [[ "$status" -ne 0 ]]; then
    echo "----- Container-Log -----" >&2
    docker logs "$name" >&2 || true
  fi
  docker rm -f "$name" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

docker run -d --name "$name" --network host \
  -e NODE_ENV=production \
  -e PORT="${PORT:-3000}" \
  -e APP_USER_ID="${APP_USER_ID:-00000000-0000-0000-0000-000000000000}" \
  -e APP_ACCESS_TOKEN="${APP_ACCESS_TOKEN:-ci-not-a-secret}" \
  -e JWT_SECRET="${JWT_SECRET:-ci-not-a-secret}" \
  -e INTERNAL_SERVICE_TOKEN="${INTERNAL_SERVICE_TOKEN:-ci-not-a-secret}" \
  -e WEBHOOK_SECRET_KLEINANZEIGEN="${WEBHOOK_SECRET_KLEINANZEIGEN:-ci-not-a-secret}" \
  -e DATABASE_URL \
  -e REDIS_URL \
  -e PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://127.0.0.1:${PORT:-3000}}" \
  -e UPLOAD_DIR="${UPLOAD_DIR:-uploads}" \
  -e SALE_CONFLICT_DEBOUNCE_MS="${SALE_CONFLICT_DEBOUNCE_MS:-15000}" \
  -e GEMINI_API_KEY= \
  -e GEMINI_VISION_MODEL= \
  -e EBAY_CLIENT_ID= \
  -e EBAY_CLIENT_SECRET= \
  -e EBAY_REFRESH_TOKEN= \
  -e EBAY_FULFILLMENT_POLICY_ID= \
  -e EBAY_PAYMENT_POLICY_ID= \
  -e EBAY_RETURN_POLICY_ID= \
  -e EBAY_MERCHANT_LOCATION_KEY= \
  -e EBAY_PICKUP_FULFILLMENT_POLICY_ID= \
  -e EBAY_ENVIRONMENT= \
  -e S3_BUCKET= \
  -e S3_REGION= \
  -e S3_ENDPOINT= \
  -e S3_ACCESS_KEY_ID= \
  -e S3_SECRET_ACCESS_KEY= \
  -e S3_PUBLIC_URL_BASE= \
  "$image"

node "$root/scripts/ci-wait-healthy.mjs" "http://127.0.0.1:${PORT:-3000}" "${BOOT_TIMEOUT_MS:-120000}" &
wait_pid=$!

while kill -0 "$wait_pid" 2>/dev/null; do
  running="$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo false)"
  if [[ "$running" != "true" ]]; then
    kill "$wait_pid" 2>/dev/null || true
    wait "$wait_pid" 2>/dev/null || true
    echo "Der Container ist beendet, bevor /healthz und /ready 200 geliefert haben." >&2
    exit 1
  fi
  sleep 1
done

wait "$wait_pid"
