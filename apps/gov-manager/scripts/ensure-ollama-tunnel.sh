#!/usr/bin/env bash
set -euo pipefail

OLLAMA_BIND_ADDR="${OLLAMA_BIND_ADDR:-0.0.0.0}"
OLLAMA_TUNNEL_PORT="${OLLAMA_TUNNEL_PORT:-11435}"
OLLAMA_TARGET_HOST="${OLLAMA_TARGET_HOST:-192.168.0.101}"
OLLAMA_TARGET_PORT="${OLLAMA_TARGET_PORT:-11434}"
OLLAMA_TARGET_USER="${OLLAMA_TARGET_USER:-gamau}"
OLLAMA_SSH_KEY="${OLLAMA_SSH_KEY:-/home/sppro/.ssh/id_ed25519_win_exec}"
OLLAMA_TUNNEL_LOG="${OLLAMA_TUNNEL_LOG:-/opt/proforma/proforma-platform/apps/gov-manager/ollama-tunnel.log}"
HC_PING_SCRIPT="${HC_PING_SCRIPT:-/opt/proforma/proforma-platform/apps/gov-manager/scripts/healthchecks-ping.sh}"
HC_SLUG_TUNNEL="${HC_SLUG_TUNNEL:-gov-tunnel-ollama}"

FORWARD_SPEC="${OLLAMA_BIND_ADDR}:${OLLAMA_TUNNEL_PORT}:127.0.0.1:${OLLAMA_TARGET_PORT}"
SSH_PATTERN_STRICT="id_ed25519_win_exec .* -L ${FORWARD_SPEC} ${OLLAMA_TARGET_USER}@${OLLAMA_TARGET_HOST}"
SSH_PATTERN_ANY_PORT="id_ed25519_win_exec .*11435:127.0.0.1:${OLLAMA_TARGET_PORT}"

is_listener_up() {
  ss -ltn 2>/dev/null | grep -qE "[[:space:]]${OLLAMA_BIND_ADDR//./\\.}:${OLLAMA_TUNNEL_PORT}[[:space:]]"
}

is_ollama_ok() {
  curl -fsS --max-time 4 "http://127.0.0.1:${OLLAMA_TUNNEL_PORT}/api/tags" >/dev/null 2>&1
}

kill_stale_tunnels() {
  pgrep -f "${SSH_PATTERN_ANY_PORT}" | xargs -r kill
}

start_tunnel() {
  nohup ssh \
    -o GatewayPorts=yes \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -i "${OLLAMA_SSH_KEY}" \
    -N \
    -L "${FORWARD_SPEC}" \
    "${OLLAMA_TARGET_USER}@${OLLAMA_TARGET_HOST}" >>"${OLLAMA_TUNNEL_LOG}" 2>&1 &
}

if is_listener_up && pgrep -f "${SSH_PATTERN_STRICT}" >/dev/null 2>&1 && is_ollama_ok; then
  "${HC_PING_SCRIPT}" "${HC_SLUG_TUNNEL}" success
  exit 0
fi

kill_stale_tunnels || true
start_tunnel
sleep 1

if is_listener_up && is_ollama_ok; then
  "${HC_PING_SCRIPT}" "${HC_SLUG_TUNNEL}" success
  exit 0
fi

echo "[ensure-ollama-tunnel] tunnel failed to become healthy at $(date -u +%FT%TZ)" >>"${OLLAMA_TUNNEL_LOG}"
"${HC_PING_SCRIPT}" "${HC_SLUG_TUNNEL}" fail "tunnel indisponivel"
exit 1
