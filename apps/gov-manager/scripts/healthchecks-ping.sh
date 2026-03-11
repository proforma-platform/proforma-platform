#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/opt/proforma/proforma-platform/apps/gov-manager"
ENV_FILE="${BASE_DIR}/.env"

set -a
source "${ENV_FILE}" >/dev/null 2>&1 || true
set +a

HC_BASE_URL="${HC_BASE_URL:-https://hc-ping.com}"
HC_PING_KEY="${HC_PING_KEY:-}"
HC_TIMEOUT_SECONDS="${HC_TIMEOUT_SECONDS:-8}"

TARGET="${1:-}"
STATE="${2:-success}"
MESSAGE="${3:-}"

if [[ -z "${TARGET}" ]]; then
  exit 0
fi

if [[ "${TARGET}" =~ ^https?:// ]]; then
  URL="${TARGET}"
else
  if [[ -z "${HC_PING_KEY}" ]]; then
    exit 0
  fi
  URL="${HC_BASE_URL%/}/${HC_PING_KEY}/${TARGET}"
fi

if [[ "${STATE}" == "start" ]]; then
  URL="${URL}/start"
elif [[ "${STATE}" == "fail" ]]; then
  URL="${URL}/fail"
fi

if [[ -n "${MESSAGE}" ]]; then
  curl -fsS --max-time "${HC_TIMEOUT_SECONDS}" \
    -H "content-type: text/plain" \
    --data-binary "${MESSAGE}" \
    "${URL}" >/dev/null || true
else
  curl -fsS --max-time "${HC_TIMEOUT_SECONDS}" "${URL}" >/dev/null || true
fi
