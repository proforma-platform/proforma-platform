#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  owner-ack.sh --mission-id <id> --decision <approve|deny> --owner-id <owner> [--note <text>]

Required environment variables:
  GOVHUB_TOKEN

Optional environment variables:
  GOVHUB_BASE_URL (default: https://govhub.proforma.net.br)
USAGE
}

MISSION_ID=""
DECISION=""
OWNER_ID=""
NOTE=""
BASE_URL="${GOVHUB_BASE_URL:-https://govhub.proforma.net.br}"
TOKEN="${GOVHUB_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mission-id) MISSION_ID="$2"; shift 2 ;;
    --decision) DECISION="$2"; shift 2 ;;
    --owner-id) OWNER_ID="$2"; shift 2 ;;
    --note) NOTE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$MISSION_ID" || -z "$DECISION" || -z "$OWNER_ID" ]]; then
  echo "Error: --mission-id, --decision and --owner-id are required." >&2
  usage
  exit 1
fi

if [[ "$DECISION" != "approve" && "$DECISION" != "deny" ]]; then
  echo "Error: --decision must be approve or deny." >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "Error: GOVHUB_TOKEN is required." >&2
  exit 1
fi

CANONICAL_URL="${BASE_URL%/}/webhook/govhub/missions/owner-ack"
COMPAT_URL="${BASE_URL%/}/webhook/govhub-v7-missions-owner-ack/webhook%2520missao%2520owner%2520ack/govhub/missions/owner-ack"

PAYLOAD=$(cat <<JSON
{"mission_id":"${MISSION_ID}","decision":"${DECISION}","owner_id":"${OWNER_ID}","note":"${NOTE}"}
JSON
)

call_url() {
  local url="$1"
  local tmp_body
  tmp_body="$(mktemp)"
  local status
  status=$(curl -sS -o "$tmp_body" -w "%{http_code}" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "X-GOVHUB-TOKEN: $TOKEN" \
    --data "$PAYLOAD")
  printf '%s\n%s\n' "$status" "$tmp_body"
}

readarray -t r1 < <(call_url "$CANONICAL_URL")
if [[ "${r1[0]}" == "404" ]]; then
  rm -f "${r1[1]}"
  readarray -t r2 < <(call_url "$COMPAT_URL")
  if [[ "${r2[0]}" -lt 200 || "${r2[0]}" -ge 300 ]]; then
    echo "owner-ack: failed_http=${r2[0]}" >&2
    head -c 1200 "${r2[1]}" >&2 || true
    rm -f "${r2[1]}"
    exit 1
  fi
  echo "owner-ack: success endpoint=compat mission_id=${MISSION_ID} decision=${DECISION}"
  rm -f "${r2[1]}"
  exit 0
fi

if [[ "${r1[0]}" -lt 200 || "${r1[0]}" -ge 300 ]]; then
  echo "owner-ack: failed_http=${r1[0]}" >&2
  head -c 1200 "${r1[1]}" >&2 || true
  rm -f "${r1[1]}"
  exit 1
fi

echo "owner-ack: success endpoint=canonical mission_id=${MISSION_ID} decision=${DECISION}"
rm -f "${r1[1]}"
