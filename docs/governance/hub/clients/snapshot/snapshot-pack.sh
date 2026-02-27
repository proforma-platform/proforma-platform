#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 4 ]; then
  echo "usage: $0 <snapshot_type> <input.json> [source_repo] [source_ref]" >&2
  exit 2
fi

SNAPSHOT_TYPE="$1"
INPUT_JSON="$2"
SOURCE_REPO="${3:-platform}"
SOURCE_REF="${4:-}"
CREATED_BY="${GOVHUB_CREATED_BY:-cpp}"

if [ ! -f "$INPUT_JSON" ]; then
  echo "pack: file not found: $INPUT_JSON" >&2
  exit 2
fi

if command -v jq >/dev/null 2>&1; then
  CANONICAL_JSON="$(jq -c . "$INPUT_JSON")"
elif command -v python3 >/dev/null 2>&1; then
  CANONICAL_JSON="$(python3 - "$INPUT_JSON" <<'PY'
import json,sys
obj=json.load(open(sys.argv[1],encoding='utf-8'))
print(json.dumps(obj,separators=(',',':'),ensure_ascii=False))
PY
)"
else
  echo "pack: need jq or python3 for JSON parsing" >&2
  exit 2
fi

SECRET_PATTERN='PRIVATE KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ghp_|github_pat_|xoxb-|token=|password=|secret='
KEY_PATTERN='"(token|password|secret|api_key)"[[:space:]]*:'
if printf "%s" "$CANONICAL_JSON" | grep -E -i "$SECRET_PATTERN|$KEY_PATTERN" >/dev/null; then
  echo "pack: secret scan failed" >&2
  exit 1
fi

RAW_BYTES=$(printf "%s" "$CANONICAL_JSON" | wc -c | tr -d ' ')
if [ "$RAW_BYTES" -gt 262144 ]; then
  echo "pack: payload exceeds 256KB decompressed limit" >&2
  exit 1
fi

TMP_GZIP="$(mktemp)"
trap 'rm -f "$TMP_GZIP"' EXIT
printf "%s" "$CANONICAL_JSON" | gzip -c > "$TMP_GZIP"
PAYLOAD_B64="$(base64 < "$TMP_GZIP" | tr -d '\n')"
PAYLOAD_SHA256="$(sha256sum "$TMP_GZIP" | awk '{print $1}')"

if [ -n "$SOURCE_REF" ]; then
  printf '{"snapshot_type":"%s","protocol":"UBIN","version":"1.0","encoding":"json","compression":"gzip","payload_b64":"%s","payload_sha256":"%s","payload_size_bytes":%s,"created_by":"%s","source_repo":"%s","source_ref":"%s"}' \
    "$SNAPSHOT_TYPE" "$PAYLOAD_B64" "$PAYLOAD_SHA256" "$RAW_BYTES" "$CREATED_BY" "$SOURCE_REPO" "$SOURCE_REF"
else
  printf '{"snapshot_type":"%s","protocol":"UBIN","version":"1.0","encoding":"json","compression":"gzip","payload_b64":"%s","payload_sha256":"%s","payload_size_bytes":%s,"created_by":"%s","source_repo":"%s"}' \
    "$SNAPSHOT_TYPE" "$PAYLOAD_B64" "$PAYLOAD_SHA256" "$RAW_BYTES" "$CREATED_BY" "$SOURCE_REPO"
fi
