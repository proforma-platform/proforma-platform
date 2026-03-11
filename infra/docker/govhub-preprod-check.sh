#!/usr/bin/env bash
set -euo pipefail

req_bin() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "FAIL: missing binary '$1'" >&2
    exit 1
  }
}

req_bin docker
req_bin curl
req_bin openssl
req_bin awk
req_bin grep

echo "[1/6] container status"
for c in govhub-db govhub-n8n govhub-cpp-worker govhub-cpp-ia-worker; do
  s="$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || true)"
  if [[ "$s" != "running" ]]; then
    echo "FAIL: container '$c' not running (status='$s')"
    exit 1
  fi
done
echo "OK: all containers running"

echo "[2/6] n8n healthz"
health_code="$(curl -sS -o /tmp/govhub-healthz.out -w '%{http_code}' http://127.0.0.1:15678/healthz)"
if [[ "$health_code" != "200" ]]; then
  echo "FAIL: healthz http=$health_code body=$(cat /tmp/govhub-healthz.out)"
  exit 1
fi
echo "OK: healthz 200"

echo "[3/6] partner secret configured"
partner_secret="$(docker exec govhub-n8n printenv GOVHUB_PARTNER_HMAC_SECRET || true)"
if [[ -z "$partner_secret" ]]; then
  echo "FAIL: GOVHUB_PARTNER_HMAC_SECRET missing in govhub-n8n"
  exit 1
fi
echo "OK: partner secret present"

echo "[4/6] govhub-output valid signature"
ts="$(date +%s)"
nonce="n-preprod-$(date +%s)"
body='{"job_id":"JOB-PREPROD-CHECK"}'
sig="$(printf '%s' "${ts}.${nonce}.${body}" | openssl dgst -sha256 -hmac "$partner_secret" -hex | awk '{print $2}')"
out_ok_code="$(curl -sS -o /tmp/govhub-output-ok.out -w '%{http_code}' \
  -X POST http://127.0.0.1:15678/webhook/govhub-output \
  -H 'content-type: application/json' \
  -H 'x-partner-id: PARTNER-TESTE' \
  -H 'x-correlation-id: CORR-PREPROD-OK' \
  -H 'x-idempotency-key: IDEMP-PREPROD-OK' \
  -H "x-timestamp: $ts" \
  -H "x-nonce: $nonce" \
  -H "x-signature: $sig" \
  --data "$body")"
if [[ "$out_ok_code" != "200" ]]; then
  echo "FAIL: output valid-signature expected 200 got $out_ok_code body=$(cat /tmp/govhub-output-ok.out)"
  exit 1
fi
echo "OK: output valid-signature 200"

echo "[5/6] govhub-output invalid signature"
out_bad_code="$(curl -sS -o /tmp/govhub-output-bad.out -w '%{http_code}' \
  -X POST http://127.0.0.1:15678/webhook/govhub-output \
  -H 'content-type: application/json' \
  -H 'x-partner-id: PARTNER-TESTE' \
  -H 'x-correlation-id: CORR-PREPROD-BAD' \
  -H 'x-idempotency-key: IDEMP-PREPROD-BAD' \
  -H "x-timestamp: $ts" \
  -H 'x-nonce: n-preprod-bad' \
  -H 'x-signature: deadbeef' \
  --data "$body")"
if [[ "$out_bad_code" != "401" ]]; then
  echo "FAIL: output invalid-signature expected 401 got $out_bad_code body=$(cat /tmp/govhub-output-bad.out)"
  exit 1
fi
echo "OK: output invalid-signature 401"

echo "[6/6] govhub-status auth guard"
status_bad_code="$(curl -sS -o /tmp/govhub-status-bad.out -w '%{http_code}' \
  -X POST http://127.0.0.1:15678/webhook/govhub-status \
  -H 'content-type: application/json' \
  --data '{"job_id":"JOB-PREPROD-CHECK","status":"DONE"}')"
if [[ "$status_bad_code" != "401" ]]; then
  echo "FAIL: status missing partner-id expected 401 got $status_bad_code body=$(cat /tmp/govhub-status-bad.out)"
  exit 1
fi
echo "OK: status missing partner-id 401"

echo "PASS: GOVHUB preprod check completed"
