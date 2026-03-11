#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${GOVHUB_BASE_URL:-https://govhub.proforma.net.br}"
UPDATE_URL="${BASE_URL}/webhook/govhub/snapshot-update"
LATEST_URL="${BASE_URL}/webhook/govhub/snapshots/latest?snapshot_type=mission_runs_v1"

if [[ -z "${GOVHUB_TOKEN:-}" ]]; then
  echo "GOVHUB_TOKEN is required" >&2
  exit 1
fi

VALID_BODY='{"run_id":"run-smoke-001","mission_id":"GOV-SMOKE","branch":"main","status":"in_progress","phase":"SNAPSHOT_LAYER","nn":1,"total":3,"last_event_ts":"2026-03-01T00:00:00Z","last_error_code":"","last_error_excerpt_256":"","report_ref":"smoke://snapshot-update","udn_state":"!GOV-SMOKE|ACT|CPP|PF|main\n#μ:test\n#τ:[a]\n#σ:running"}'

# (1) 401 without token
HTTP_401=$(curl -sS -o /tmp/snapshot_update_401.json -w '%{http_code}' -X POST "$UPDATE_URL" -H 'Content-Type: application/json' --data "$VALID_BODY")
echo "TEST_1_HTTP=${HTTP_401}"

# (2) 200 with valid token
HTTP_200=$(curl -sS -o /tmp/snapshot_update_200.json -w '%{http_code}' -X POST "$UPDATE_URL" -H 'Content-Type: application/json' -H "X-GOVHUB-TOKEN: ${GOVHUB_TOKEN}" --data "$VALID_BODY")
echo "TEST_2_HTTP=${HTTP_200}"

# (3) upsert works (same run_id changed phase)
UPSERT_BODY='{"run_id":"run-smoke-001","mission_id":"GOV-SMOKE","branch":"main","status":"in_progress","phase":"SNAPSHOT_LAYER_2","nn":2,"total":3,"last_event_ts":"2026-03-01T00:01:00Z","last_error_code":"","last_error_excerpt_256":"","report_ref":"smoke://snapshot-update","udn_state":"!GOV-SMOKE|ACT|CPP|PF|main\n#μ:test2\n#τ:[b]\n#σ:running"}'
HTTP_UPSERT=$(curl -sS -o /tmp/snapshot_update_upsert.json -w '%{http_code}' -X POST "$UPDATE_URL" -H 'Content-Type: application/json' -H "X-GOVHUB-TOKEN: ${GOVHUB_TOKEN}" --data "$UPSERT_BODY")
echo "TEST_3_HTTP=${HTTP_UPSERT}"

# (4) snapshot read returns UBIN envelope
HTTP_LATEST=$(curl -sS -o /tmp/snapshot_update_latest.json -w '%{http_code}' -H "X-GOVHUB-TOKEN: ${GOVHUB_TOKEN}" "$LATEST_URL")
echo "TEST_4_HTTP=${HTTP_LATEST}"

echo "-- latest fields --"
python3 - <<'PY'
import json
p='/tmp/snapshot_update_latest.json'
try:
    d=json.load(open(p))
    print({k:d.get(k) for k in ['status','snapshot_type','protocol','compression','payload_sha256']})
except Exception as e:
    print({'parse_error':str(e)})
PY
