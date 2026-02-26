#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAN_SCRIPT="$SCRIPT_DIR/ccp-secret-scan.sh"

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <type:mission|report|error> <json-file>" >&2
  exit 2
fi

TYPE="$1"
FILE="$2"

if [ ! -f "$FILE" ]; then
  echo "lint: file not found: $FILE" >&2
  exit 2
fi

MAX_BYTES=$((128*1024))
SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -gt "$MAX_BYTES" ]; then
  echo "lint: FAIL payload exceeds 128KB ($SIZE bytes)" >&2
  exit 1
fi

if [ -x "$SCAN_SCRIPT" ]; then
  "$SCAN_SCRIPT" "$FILE"
fi

parse_json() {
  if command -v jq >/dev/null 2>&1; then
    jq -e . "$FILE" >/dev/null
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -m json.tool "$FILE" >/dev/null
    return
  fi
  echo "lint: FAIL json parser not available (need jq or python3)" >&2
  exit 2
}

parse_json

if command -v jq >/dev/null 2>&1; then
  jq -e '.ccp_ver|type=="string"' "$FILE" >/dev/null || { echo "lint: FAIL missing/invalid ccp_ver"; exit 1; }
  jq -e '.id|type=="string" and (.id|length>0)' "$FILE" >/dev/null || { echo "lint: FAIL missing/invalid id"; exit 1; }
  jq -e '.ts|type=="string"' "$FILE" >/dev/null || { echo "lint: FAIL missing/invalid ts"; exit 1; }

  case "$TYPE" in
    mission)
      jq -e '.repo_key|type=="string" and (.repo_key|length>0)' "$FILE" >/dev/null || { echo "lint: FAIL mission.repo_key"; exit 1; }
      jq -e '.agent_id|type=="string" and (.agent_id|length>0)' "$FILE" >/dev/null || { echo "lint: FAIL mission.agent_id"; exit 1; }
      ;;
    report)
      jq -e '.head_sha|type=="string" and (.head_sha|length>=7)' "$FILE" >/dev/null || { echo "lint: FAIL report.head_sha"; exit 1; }
      jq -e '.files_modified|type=="array"' "$FILE" >/dev/null || { echo "lint: FAIL report.files_modified"; exit 1; }
      jq -e '.security|type=="object"' "$FILE" >/dev/null || { echo "lint: FAIL report.security"; exit 1; }
      ;;
    error)
      jq -e '.status|type=="string"' "$FILE" >/dev/null || { echo "lint: FAIL error.status"; exit 1; }
      jq -e '.error_code|type=="string" and (.error_code|length>0)' "$FILE" >/dev/null || { echo "lint: FAIL error.error_code"; exit 1; }
      jq -e '.message|type=="string" and (.message|length>0)' "$FILE" >/dev/null || { echo "lint: FAIL error.message"; exit 1; }
      ;;
    *)
      echo "lint: FAIL unknown type '$TYPE'" >&2
      exit 2
      ;;
  esac
else
  python3 - "$TYPE" "$FILE" <<'PY'
import json,sys
kind=sys.argv[1]
path=sys.argv[2]
obj=json.load(open(path,'r',encoding='utf-8'))
def fail(msg):
  print(f"lint: FAIL {msg}")
  raise SystemExit(1)
for k in ("ccp_ver","id","ts"):
  if not isinstance(obj.get(k),str) or not obj.get(k):
    fail(f"missing/invalid {k}")
if kind=="mission":
  for k in ("repo_key","agent_id"):
    if not isinstance(obj.get(k),str) or not obj.get(k):
      fail(f"mission.{k}")
elif kind=="report":
  if not isinstance(obj.get("head_sha"),str) or len(obj.get("head_sha",""))<7:
    fail("report.head_sha")
  if not isinstance(obj.get("files_modified"),list):
    fail("report.files_modified")
  if not isinstance(obj.get("security"),dict):
    fail("report.security")
elif kind=="error":
  for k in ("status","error_code","message"):
    if not isinstance(obj.get(k),str) or not obj.get(k):
      fail(f"error.{k}")
else:
  fail(f"unknown type '{kind}'")
print("lint: PASS")
PY
fi

echo "lint: PASS"
echo "lint: NOTE full schema validation is optional via tools/node/validate.mjs"
