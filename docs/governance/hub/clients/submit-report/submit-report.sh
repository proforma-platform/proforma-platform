#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  submit-report.sh --mission-key <key> --repo-key <repo> --report-file <path> [--agent-id <id>]

Required environment variables:
  GOVHUB_REPORT_INGEST_URL  Full report-ingest webhook URL
  GOVHUB_TOKEN              Value for X-GOVHUB-TOKEN header

Optional environment variables:
  GOVHUB_AGENT_ID           Used when --agent-id is not provided
USAGE
}

MISSION_KEY=""
REPO_KEY=""
AGENT_ID="${GOVHUB_AGENT_ID:-}"
REPORT_FILE=""
REPORT_INGEST_URL="${GOVHUB_REPORT_INGEST_URL:-}"
TOKEN="${GOVHUB_TOKEN:-}"
MAX_SIZE_BYTES=$((512 * 1024))

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mission-key) MISSION_KEY="$2"; shift 2 ;;
    --repo-key) REPO_KEY="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --report-file) REPORT_FILE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$MISSION_KEY" || -z "$REPO_KEY" || -z "$REPORT_FILE" ]]; then
  echo "Error: --mission-key, --repo-key and --report-file are required." >&2
  usage
  exit 1
fi

if [[ -z "$AGENT_ID" ]]; then
  echo "Error: missing agent_id. Use --agent-id or GOVHUB_AGENT_ID." >&2
  exit 1
fi

if [[ -z "$REPORT_INGEST_URL" ]]; then
  echo "Error: GOVHUB_REPORT_INGEST_URL is required." >&2
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "Error: GOVHUB_TOKEN is required." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: current directory is not inside a git repository." >&2
  exit 1
fi

if [[ ! -f "$REPORT_FILE" ]]; then
  echo "Error: report file does not exist: $REPORT_FILE" >&2
  exit 1
fi

if [[ ! -s "$REPORT_FILE" ]]; then
  echo "Error: report file is empty: $REPORT_FILE" >&2
  exit 1
fi

FILE_SIZE_BYTES=$(wc -c < "$REPORT_FILE" | tr -d ' ')
if (( FILE_SIZE_BYTES > MAX_SIZE_BYTES )); then
  echo "Error: report file exceeds 512KB (${FILE_SIZE_BYTES} bytes)." >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse HEAD)"
REPORT_MD_RAW="$(cat "$REPORT_FILE")"

if printf '%s' "$REPORT_MD_RAW" | grep -Eq 'PRIVATE KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ghp_|github_pat_|xoxb-|token=|password=|secret='; then
  echo "Error: high-risk secret pattern detected in report. Submission aborted." >&2
  exit 1
fi

json_escape() {
  sed -e 's/\\/\\\\/g' \
      -e 's/"/\\"/g' \
      -e ':a;N;$!ba;s/\n/\\n/g'
}

REPORT_MD_ESCAPED="$(printf '%s' "$REPORT_MD_RAW" | json_escape)"

PAYLOAD=$(cat <<JSON
{
  "mission_key": "${MISSION_KEY}",
  "repo_key": "${REPO_KEY}",
  "agent_id": "${AGENT_ID}",
  "branch": "${BRANCH}",
  "head_sha": "${HEAD_SHA}",
  "report_md": "${REPORT_MD_ESCAPED}"
}
JSON
)

TMP_BODY="$(mktemp)"
HTTP_STATUS=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" \
  -X POST "$REPORT_INGEST_URL" \
  -H "Content-Type: application/json" \
  -H "X-GOVHUB-TOKEN: $TOKEN" \
  --data "$PAYLOAD")

if [[ "$HTTP_STATUS" -lt 200 || "$HTTP_STATUS" -ge 300 ]]; then
  echo "Submission failed (HTTP $HTTP_STATUS)." >&2
  cat "$TMP_BODY" >&2
  rm -f "$TMP_BODY"
  exit 1
fi

echo "submit-report: success"
echo "repo_key=$REPO_KEY mission_key=$MISSION_KEY agent_id=$AGENT_ID branch=$BRANCH head_sha=$HEAD_SHA file_size_bytes=$FILE_SIZE_BYTES http_status=$HTTP_STATUS"
cat "$TMP_BODY"
rm -f "$TMP_BODY"
