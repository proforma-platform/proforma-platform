#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${GOVHUB_PUBLIC_BASE_URL:-https://govhub.proforma.net.br}"
TIMEOUT_SECONDS="${WEBHOOK_MONITOR_TIMEOUT_SECONDS:-10}"

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

check_http_200() {
  local name="$1"
  local path="$2"
  local payload="$3"
  local code
  code="$(curl -sS -m "$TIMEOUT_SECONDS" -o /tmp/govhub_webhook_probe.out -w '%{http_code}' \
    -X POST "${BASE_URL%/}${path}" \
    -H "Content-Type: application/json" \
    --data "$payload" || true)"
  if [[ "$code" != "200" ]]; then
    printf '[FAIL] %s http=%s\n' "$name" "$code" >&2
    cat /tmp/govhub_webhook_probe.out >&2 || true
    exit 1
  fi
  printf '[OK] %s http=%s\n' "$name" "$code"
}

check_http_200 "memory-starter" "/webhook/govhub/memory/starter" \
  '{"query":"principal architect do gov","namespace":"gov_principal_architect","limit":3}'

check_http_200 "memory-store" "/webhook/govhub/memory/store" \
  '{"namespace":"gov_manager","topic":"monitor-memory-store","content":"monitor ping","summary":"monitor","tags":["gov","monitor"],"mission_id":"GOV-MANAGER-V1-MONITOR","role":"PRINCIPAL_ARCHITECT","actor":"monitor","source_type":"udn"}'

check_http_200 "memory-retrieve" "/webhook/govhub/memory/retrieve" \
  '{"query":"principal architect","namespace":"gov_principal_architect","limit":3}'

check_http_200 "worker-cpp-dispatch" "/webhook/govhub/workers/cpp/dispatch" \
  '{"task_id":"monitor-cpp-dispatch","mission_id":"GOV-MANAGER-V1-MONITOR","action":"MSG","message":"monitor healthcheck ping"}'

printf '[OK] govhub-webhooks-monitor complete\n'
