#!/usr/bin/env bash
set -euo pipefail

MISSION_ID="${1:-}"
ERROR_CODE="${2:-AUTO_FIX_TRIGGER}"
ERROR_EXCERPT="${3:-}"
BASE_URL="${GOVHUB_BASE_URL:-https://govhub.proforma.net.br}"
TOKEN="${GOVHUB_TOKEN:-}"

if [[ -z "$MISSION_ID" ]]; then
  echo "usage: autofix-limited.sh <mission_id> [error_code] [error_excerpt]" >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "Error: GOVHUB_TOKEN is required." >&2
  exit 1
fi

URL="${BASE_URL%/}/webhook/govhub/missions/autofix-limited"
PAYLOAD="{\"mission_id\":\"${MISSION_ID}\",\"error_code\":\"${ERROR_CODE}\",\"error_excerpt\":\"${ERROR_EXCERPT}\"}"

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

HTTP_STATUS=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" \
  -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-GOVHUB-TOKEN: $TOKEN" \
  --data "$PAYLOAD")

if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
  echo "autofix-limited: failed_http=$HTTP_STATUS" >&2
  head -c 1200 "$TMP_BODY" >&2 || true
  exit 1
fi

echo "autofix-limited: success mission_id=$MISSION_ID http_status=$HTTP_STATUS"
