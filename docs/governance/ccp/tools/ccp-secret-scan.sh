#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <json-file>" >&2
  exit 2
fi

FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "secret-scan: file not found: $FILE" >&2
  exit 2
fi

PATTERN='PRIVATE KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ghp_|github_pat_|xoxb-|token=|password=|secret='
KEY_PATTERN='"(token|password|secret|api_key)"[[:space:]]*:'

if grep -E -i -n "$PATTERN" "$FILE" >/tmp/ccp_secret_hits.txt; then
  echo "secret-scan: FAIL pattern detected"
  sed -n '1,20p' /tmp/ccp_secret_hits.txt
  exit 1
fi

if grep -E -i -n "$KEY_PATTERN" "$FILE" >/tmp/ccp_secret_key_hits.txt; then
  echo "secret-scan: FAIL sensitive key detected"
  sed -n '1,20p' /tmp/ccp_secret_key_hits.txt
  exit 1
fi

echo "secret-scan: PASS"
