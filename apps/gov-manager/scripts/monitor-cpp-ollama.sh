#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/proforma/proforma-platform/apps/gov-manager"
ENV_FILE="${BASE_DIR}/.env"
ENSURE_TUNNEL_SCRIPT="${BASE_DIR}/scripts/ensure-ollama-tunnel.sh"
CPP_HEALTH_URL="${CPP_HEALTH_URL:-http://127.0.0.1:15711/health}"
ALERTS_URL="${ALERTS_URL:-http://127.0.0.1:3000/api/govhub/operations/alerts}"
HC_PING="${BASE_DIR}/scripts/healthchecks-ping.sh"
HC_SLUG_CPP_MONITOR="${HC_SLUG_CPP_MONITOR:-gov-monitor-cpp-ollama}"

set -a
source "${ENV_FILE}" >/dev/null 2>&1 || true
set +a

emit_alert() {
  local type="$1"
  local severity="$2"
  local source="$3"
  local message="$4"
  if [[ -z "${GOVHUB_TOKEN:-}" ]]; then
    return 0
  fi
  curl -sS -X POST "${ALERTS_URL}" \
    -H "content-type: application/json" \
    -H "x-govhub-token:${GOVHUB_TOKEN}" \
    -d "{\"action\":\"create\",\"type\":\"${type}\",\"severity\":\"${severity}\",\"source\":\"${source}\",\"message\":\"${message}\"}" >/dev/null || true
}

"${HC_PING}" "${HC_SLUG_CPP_MONITOR}" start

if ! "${ENSURE_TUNNEL_SCRIPT}"; then
  emit_alert "ollama_tunnel_down" "high" "cpp-monitor" "Tunnel Ollama indisponível. Auto-recovery falhou."
  "${HC_PING}" "${HC_SLUG_CPP_MONITOR}" fail "auto-recovery do tunnel falhou"
  exit 1
fi

health_json="$(curl -fsS --max-time 8 "${CPP_HEALTH_URL}" || true)"
if [[ -z "${health_json}" ]]; then
  if docker inspect govhub-cpp-worker --format '{{.State.Running}}' 2>/dev/null | grep -q '^true$'; then
    # Worker pode estar processando requisição longa (LLM) e bloquear /health temporariamente.
    "${HC_PING}" "${HC_SLUG_CPP_MONITOR}" success
    exit 0
  fi
  emit_alert "cpp_worker_down" "critical" "cpp-monitor" "Worker CPP sem resposta no endpoint /health e container parado."
  "${HC_PING}" "${HC_SLUG_CPP_MONITOR}" fail "cpp /health sem resposta e container parado"
  exit 1
fi

if ! printf '%s' "${health_json}" | grep -q '"status":[[:space:]]*"ok"'; then
  emit_alert "cpp_worker_unhealthy" "high" "cpp-monitor" "Worker CPP respondeu sem status=ok."
  "${HC_PING}" "${HC_SLUG_CPP_MONITOR}" fail "cpp sem status=ok"
  exit 1
fi

if ! printf '%s' "${health_json}" | grep -q '"ollama_enabled":[[:space:]]*true'; then
  emit_alert "cpp_ollama_disabled" "high" "cpp-monitor" "Worker CPP sem OLLAMA_BASE_URL habilitado."
  "${HC_PING}" "${HC_SLUG_CPP_MONITOR}" fail "cpp sem ollama_enabled=true"
  exit 1
fi

"${HC_PING}" "${HC_SLUG_CPP_MONITOR}" success
exit 0
