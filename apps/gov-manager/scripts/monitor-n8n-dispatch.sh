#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/proforma/proforma-platform/apps/gov-manager"
ENV_FILE="${BASE_DIR}/.env"
HC_PING="${BASE_DIR}/scripts/healthchecks-ping.sh"
HC_SLUG_N8N_DISPATCH="${HC_SLUG_N8N_DISPATCH:-gov-n8n-dispatch}"
DISPATCH_URL="${DISPATCH_URL:-http://127.0.0.1:15678/webhook/govhub/workers/cpp/dispatch}"

set -a
source "${ENV_FILE}" >/dev/null 2>&1 || true
set +a

"${HC_PING}" "${HC_SLUG_N8N_DISPATCH}" start

if ! docker inspect govhub-n8n --format '{{.State.Running}}' 2>/dev/null | grep -q '^true$'; then
  "${HC_PING}" "${HC_SLUG_N8N_DISPATCH}" fail "container govhub-n8n parado"
  exit 1
fi

probe_code="$(
  curl -s -o /tmp/n8n_dispatch_probe.out -w "%{http_code}" \
    -X POST "${DISPATCH_URL}" \
    -H "content-type: application/json" \
    -d "{}" || echo "000"
)"

# 200/400/401/409 indicam endpoint ativo (fluxo/validação respondeu).
# 404/5xx indicam problema.
if [[ "${probe_code}" == "200" || "${probe_code}" == "400" || "${probe_code}" == "401" || "${probe_code}" == "409" ]]; then
  "${HC_PING}" "${HC_SLUG_N8N_DISPATCH}" success
  exit 0
fi

"${HC_PING}" "${HC_SLUG_N8N_DISPATCH}" fail "dispatch probe http=${probe_code}"
exit 1
