#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${GOVHUB_BASE_URL:-http://127.0.0.1:15678}"
ENDPOINT="${MISSIONS_NEXT_ENDPOINT:-${BASE_URL%/}/webhook/govhub/missions/next}"
TOKEN="${GOVHUB_TOKEN:-}"
REPO_KEY="${REPO_KEY:-platform}"
AGENT_ID="${AGENT_ID:-CPP}"
CALLS="${CALLS:-3}"

if [[ -z "$TOKEN" ]]; then
  echo "ERRO: definir GOVHUB_TOKEN" >&2
  exit 2
fi

tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

for i in $(seq 1 "$CALLS"); do
  code=$(curl -sS -o "$tmp_body" -w '%{http_code}' -X POST "$ENDPOINT" \
    -H 'content-type: application/json' \
    -H "x-govhub-token: ${TOKEN}" \
    --data "{\"repo_key\":\"${REPO_KEY}\",\"agent_id\":\"${AGENT_ID}\"}")

  if [[ "$code" != "200" ]]; then
    echo "FALHA: http_code=$code (esperado 200)" >&2
    cat "$tmp_body" >&2
    exit 1
  fi

  python3 - "$tmp_body" "$i" <<'PY'
import json, sys
p, i = sys.argv[1], sys.argv[2]
raw = open(p, 'r', encoding='utf-8').read()
if not raw.strip():
    raise SystemExit(f"FALHA rodada {i}: body vazio")
obj = json.loads(raw)
status = str(obj.get('status', '')).strip()
if status not in {'no_work', 'assigned'}:
    raise SystemExit(f"FALHA rodada {i}: status invalido '{status}'")
if status == 'assigned':
    mission_key = str(obj.get('mission_key', '')).strip()
    mission_task_id = str(obj.get('mission_task_id', '')).strip()
    if not mission_key or mission_key.lower() == 'null':
        raise SystemExit(f"FALHA rodada {i}: assigned sem mission_key")
    if not mission_task_id or mission_task_id.lower() == 'null':
        raise SystemExit(f"FALHA rodada {i}: assigned sem mission_task_id")
print(f"OK rodada {i}: status={status}")
PY

done

echo "CONTRATO_OK missions-next (${CALLS} rodadas)"
