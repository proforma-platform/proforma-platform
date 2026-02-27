#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  fetch-mission.sh --repo-key <repo_key> --agent-id <agent_id> [--output-file <path>] [--mission-type <type>]

Token source priority:
  1) $HOME/.config/proforma/secrets.env (GOVHUB_TOKEN=...; perms <= 0600)
  2) GOVHUB_TOKEN env var (fallback only when file is absent)
USAGE
}

REPO_KEY=""
AGENT_ID=""
OUTPUT_FILE=""
MISSION_TYPE=""
ENDPOINT="https://govhub.proforma.net.br/webhook/govhub/missions/next"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-key) REPO_KEY="${2:-}"; shift 2 ;;
    --agent-id) AGENT_ID="${2:-}"; shift 2 ;;
    --output-file) OUTPUT_FILE="${2:-}"; shift 2 ;;
    --mission-type) MISSION_TYPE="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$REPO_KEY" || -z "$AGENT_ID" ]]; then
  echo "Error: --repo-key and --agent-id are required." >&2
  usage
  exit 1
fi

trim() {
  local s="$1"
  s="${s#${s%%[![:space:]]*}}"
  s="${s%${s##*[![:space:]]}}"
  printf '%s' "$s"
}

load_token() {
  local secrets_file="$HOME/.config/proforma/secrets.env"
  local token=""

  if [[ -f "$secrets_file" ]]; then
    local perm
    perm=$(stat -c '%a' "$secrets_file" 2>/dev/null || true)
    if [[ -z "$perm" ]]; then
      echo "Error: cannot determine permissions for $secrets_file" >&2
      return 1
    fi
    local perm_dec
    perm_dec=$((8#$perm))
    if (( (perm_dec & 63) != 0 )); then
      echo "Error: $secrets_file permissions must be <= 0600 (current: $perm)." >&2
      return 1
    fi

    local line
    line=$(grep -m1 '^GOVHUB_TOKEN=' "$secrets_file" || true)
    if [[ -z "$line" ]]; then
      echo "Error: GOVHUB_TOKEN not found in $secrets_file." >&2
      return 1
    fi

    token="${line#GOVHUB_TOKEN=}"
    token="${token//$'\r'/}"
    token="$(trim "$token")"

    if [[ "${token:0:1}" == '"' && "${token: -1}" == '"' ]] || [[ "${token:0:1}" == "'" && "${token: -1}" == "'" ]]; then
      token="${token:1:${#token}-2}"
    fi
    token="$(trim "$token")"
  else
    token="${GOVHUB_TOKEN:-}"
    token="${token//$'\r'/}"
    token="$(trim "$token")"
  fi

  if [[ -z "$token" ]]; then
    echo "Error: GOVHUB_TOKEN not available (file missing or empty fallback env)." >&2
    return 1
  fi
  if (( ${#token} < 20 )); then
    echo "Error: GOVHUB_TOKEN failed sanity check (length < 20)." >&2
    return 1
  fi

  printf '%s' "$token"
}

TOKEN="$(load_token)"

if [[ -n "$MISSION_TYPE" ]]; then
  PAYLOAD=$(printf '{"repo_key":"%s","agent_id":"%s","mission_type":"%s"}' "$REPO_KEY" "$AGENT_ID" "$MISSION_TYPE")
else
  PAYLOAD=$(printf '{"repo_key":"%s","agent_id":"%s"}' "$REPO_KEY" "$AGENT_ID")
fi

TMP_BODY="$(mktemp)"
cleanup() {
  rm -f "$TMP_BODY"
}
trap cleanup EXIT

HTTP_STATUS=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" \
  -X POST "$ENDPOINT" \
  -H "X-GOVHUB-TOKEN: $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD")

if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
  PREVIEW="$(head -c 1200 "$TMP_BODY" || true)"
  echo "fetch-mission failed: http_status=$HTTP_STATUS" >&2
  if [[ -n "$PREVIEW" ]]; then
    echo "error_preview=$PREVIEW" >&2
  fi
  exit 1
fi

RAW_BODY="$(cat "$TMP_BODY")"
if [[ -z "$RAW_BODY" ]]; then
  echo "fetch-mission failed: empty response body" >&2
  exit 1
fi

COMPACT_JSON="$(python3 - <<'PY' "$TMP_BODY"
import json,sys
with open(sys.argv[1],encoding='utf-8') as f:
    obj=json.load(f)
print(json.dumps(obj,separators=(',',':'),ensure_ascii=False))
PY
)"

if [[ -n "$OUTPUT_FILE" ]]; then
  printf '%s' "$RAW_BODY" > "$OUTPUT_FILE"
fi

python3 - <<'PY' "$TMP_BODY" "$REPO_KEY" "$AGENT_ID" "$HTTP_STATUS" >&2
import json,sys
obj=json.load(open(sys.argv[1],encoding='utf-8'))
repo=sys.argv[2]
agent=sys.argv[3]
http=sys.argv[4]
status=obj.get('status')
mission=obj.get('mission_key')
lock=obj.get('lock_expires_at_utc')
print(f"fetch-mission: success repo_key={repo} agent_id={agent} http_status={http} status={status} mission_key={mission} lock_expires_at_utc={lock}")
PY

printf '%s\n' "$COMPACT_JSON"
