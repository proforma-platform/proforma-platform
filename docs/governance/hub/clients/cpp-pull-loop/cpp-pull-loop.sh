#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${GOVHUB_BASE_URL:-https://govhub.proforma.net.br}"
RUNTIME_MODE="${GOVHUB_RUNTIME_MODE:-LOCAL_ONLY}"
REPO_KEY="${GOVHUB_REPO_KEY:-platform}"
AGENT_ID="${GOVHUB_AGENT_ID:-CPP}"
SLEEP_SECS="${GOVHUB_POLL_SECONDS:-15}"

if [[ "${RUNTIME_MODE}" == "LOCAL_ONLY" ]]; then
  exit 0
fi

TOKEN_LINE=$(grep -m1 -E '^GOVHUB_TOKEN=' "$HOME/.config/proforma/secrets.env" 2>/dev/null || true)
TOKEN=${TOKEN_LINE#GOVHUB_TOKEN=}
TOKEN=$(printf '%s' "$TOKEN" | tr -d '\r' | sed -e 's/^ *//' -e 's/ *$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
[[ -n "$TOKEN" ]] || exit 1

update_state() {
  local run_id="$1"
  local mission_id="$2"
  local status="$3"
  local phase="$4"
  local nn="$5"
  local total="$6"
  local udn_state="$7"
  local report_ref="$8"

  curl -sS -X POST "${BASE_URL}/webhook/govhub/snapshot-update" \
    -H "Content-Type: application/json" \
    -H "X-GOVHUB-TOKEN: ${TOKEN}" \
    -d "{\"run_id\":\"${run_id}\",\"mission_id\":\"${mission_id}\",\"branch\":\"main\",\"status\":\"${status}\",\"phase\":\"${phase}\",\"nn\":${nn},\"total\":${total},\"udn_state\":\"${udn_state}\",\"report_ref\":\"${report_ref}\"}" >/dev/null
}

while true; do
  RESP=$(curl -sS -X POST "${BASE_URL}/webhook/govhub/missions/next" \
    -H "Content-Type: application/json" \
    -H "X-GOVHUB-TOKEN: ${TOKEN}" \
    -d "{\"repo_key\":\"${REPO_KEY}\",\"agent_id\":\"${AGENT_ID}\"}" || true)

  STATUS=$(printf '%s' "$RESP" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  if [[ "$STATUS" != "assigned" ]]; then
    sleep "$SLEEP_SECS"
    continue
  fi

  RUN_ID=$(printf '%s' "$RESP" | sed -n 's/.*"run_id":"\([^"]*\)".*/\1/p')
  MISSION_ID=$(printf '%s' "$RESP" | sed -n 's/.*"mission_id":"\([^"]*\)".*/\1/p')
  MISSION_KEY=$(printf '%s' "$RESP" | sed -n 's/.*"mission_key":"\([^"]*\)".*/\1/p')

  if [[ -z "$MISSION_ID" && -n "$MISSION_KEY" ]]; then
    MISSION_ID="$MISSION_KEY"
  fi
  if [[ -z "$RUN_ID" && -n "$MISSION_ID" ]]; then
    RUN_ID="${MISSION_ID}-run-001"
  fi
  [[ -n "$RUN_ID" && -n "$MISSION_ID" ]] || { sleep "$SLEEP_SECS"; continue; }

  update_state "$RUN_ID" "$MISSION_ID" "running" "phase_1" 1 3 "!RUN|${RUN_ID}|${MISSION_ID}|running|phase_1|1/3;" ""
  update_state "$RUN_ID" "$MISSION_ID" "running" "phase_2" 2 3 "!RUN|${RUN_ID}|${MISSION_ID}|running|phase_2|2/3;" ""
  update_state "$RUN_ID" "$MISSION_ID" "complete" "done" 3 3 "!RUN|${RUN_ID}|${MISSION_ID}|complete|done|3/3;" "govhub://reports/${RUN_ID}"

done
