#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: $0 <input.json> [output.json]" >&2
  exit 2
fi

IN="$1"
OUT="${2:-}"

if [ ! -f "$IN" ]; then
  echo "minify: file not found: $IN" >&2
  exit 2
fi

minify_with_jq() {
  if [ -n "$OUT" ]; then
    jq -c . "$IN" > "$OUT"
  else
    jq -c . "$IN"
  fi
}

minify_with_python() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "minify: jq not found and python3 not available" >&2
    exit 2
  fi
  if [ -n "$OUT" ]; then
    python3 - "$IN" "$OUT" <<'PY'
import json,sys
src=sys.argv[1]
out=sys.argv[2]
with open(src,'r',encoding='utf-8') as f:
    obj=json.load(f)
with open(out,'w',encoding='utf-8',newline='\n') as g:
    g.write(json.dumps(obj,separators=(',',':'),ensure_ascii=False))
PY
  else
    python3 - "$IN" <<'PY'
import json,sys
with open(sys.argv[1],'r',encoding='utf-8') as f:
    obj=json.load(f)
print(json.dumps(obj,separators=(',',':'),ensure_ascii=False))
PY
  fi
}

if command -v jq >/dev/null 2>&1; then
  minify_with_jq
else
  minify_with_python
fi

echo "minify: OK"
