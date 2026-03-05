#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/proforma/proforma-platform/apps/gov-manager"
ENV_FILE="${BASE_DIR}/.env"
WATCHDOG_URL="http://127.0.0.1:3000/api/govhub/operations/watchdog"
ALERTS_URL="http://127.0.0.1:3000/api/govhub/operations/alerts"
OWNER_ACK_STALE_MIN="${OWNER_ACK_STALE_MIN:-120}"

set -a
source "${ENV_FILE}" >/dev/null 2>&1 || true
set +a

if [[ -z "${GOVHUB_TOKEN:-}" ]]; then
  exit 0
fi

curl -s -X POST "${WATCHDOG_URL}" \
  -H "content-type: application/json" \
  -H "x-govhub-token:${GOVHUB_TOKEN}" \
  -d "{\"action\":\"run\",\"stale_threshold_min\":20}" >/dev/null || true

STALE_OWNER_ACK_COUNT="$(docker exec govhub-db psql -U postgres -d govhub_n8n -At -c "SELECT COUNT(*) FROM gov.mission_runs WHERE status='awaiting_owner_ack' AND updated_at < now() - interval '${OWNER_ACK_STALE_MIN} minutes';" 2>/dev/null | head -n1 | tr -dc '0-9')"
STALE_OWNER_ACK_COUNT="${STALE_OWNER_ACK_COUNT:-0}"

if [[ "${STALE_OWNER_ACK_COUNT}" -gt 0 ]]; then
  SEVERITY="high"
  if [[ "${STALE_OWNER_ACK_COUNT}" -ge 5 ]]; then
    SEVERITY="critical"
  fi

  curl -s -X POST "${ALERTS_URL}" \
    -H "content-type: application/json" \
    -H "x-govhub-token:${GOVHUB_TOKEN}" \
    -d "{\"action\":\"create\",\"type\":\"owner_ack_stale\",\"severity\":\"${SEVERITY}\",\"source\":\"xbo-owner-ack\",\"message\":\"Há missões aguardando owner ack acima do SLA de ${OWNER_ACK_STALE_MIN} min.\"}" >/dev/null || true
fi
