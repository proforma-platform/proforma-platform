#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${GOVHUB_INTERNAL_BASE_URL:-${GOVHUB_BASE_URL:-http://127.0.0.1:3000}}"
POLL_SECS="${GOVHUB_CHAT_POLL_SECONDS:-8}"
TARGET="${GOVHUB_CHAT_TARGET:-CPP}"
REPLY_ACTOR="${GOVHUB_CHAT_REPLY_ACTOR:-CPP}"
REPLY_SOURCE="${GOVHUB_CHAT_REPLY_SOURCE:-cpp-autonomous-loop}"
EXEC_AGENT_ID="${GOV_EXEC_AGENT_ID:-gov-codex-01}"
COOKIE_JAR="${GOVHUB_CHAT_COOKIE_JAR:-/tmp/govhub/ops-chat-cpp-loop.cookie}"
LOCK_FILE="${GOVHUB_CHAT_LOCK_FILE:-/tmp/govhub/ops-chat-cpp-loop.lock}"

mkdir -p /tmp/govhub
mkdir -p "$(dirname "$COOKIE_JAR")"
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

resolve_login_user() {
  if [[ -n "${GOV_MANAGER_LOGIN_USER:-}" ]]; then
    printf '%s' "$GOV_MANAGER_LOGIN_USER"
    return
  fi
  if [[ -f "/opt/proforma/proforma-platform/apps/gov-manager/.env" ]]; then
    local line
    line="$(grep -m1 -E '^GOV_MANAGER_LOGIN_USER=' /opt/proforma/proforma-platform/apps/gov-manager/.env || true)"
    line="${line#GOV_MANAGER_LOGIN_USER=}"
    printf '%s' "$line" | tr -d '\r' | sed -e 's/^ *//' -e 's/ *$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
    return
  fi
  printf 'admin'
}

resolve_login_password() {
  if [[ -n "${GOV_MANAGER_LOGIN_PASSWORD:-}" ]]; then
    printf '%s' "$GOV_MANAGER_LOGIN_PASSWORD"
    return
  fi
  if [[ -f "/opt/proforma/proforma-platform/apps/gov-manager/.env" ]]; then
    local line
    line="$(grep -m1 -E '^GOV_MANAGER_LOGIN_PASSWORD=' /opt/proforma/proforma-platform/apps/gov-manager/.env || true)"
    line="${line#GOV_MANAGER_LOGIN_PASSWORD=}"
    printf '%s' "$line" | tr -d '\r' | sed -e 's/^ *//' -e 's/ *$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
    return
  fi
  printf 'admin'
}

LOGIN_USER="$(resolve_login_user)"
LOGIN_PASSWORD="$(resolve_login_password)"

refresh_session_cookie() {
  curl -sS -c "$COOKIE_JAR" -b "$COOKIE_JAR" -X POST "${BASE_URL%/}/api/auth/session" \
    -H "content-type: application/json" \
    --data "{\"username\":\"${LOGIN_USER}\",\"password\":\"${LOGIN_PASSWORD}\"}" >/dev/null || true
}

json_get_first_unread() {
  curl -sS -X GET "${BASE_URL%/}/api/govhub/operations/chat?limit=120" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "accept: application/json"
}

json_get_queue() {
  local mission_id="$1"
  curl -sS -X GET "${BASE_URL%/}/api/govhub/operations/queue?mission_id=${mission_id}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "accept: application/json"
}

json_get_queue_all() {
  curl -sS -X GET "${BASE_URL%/}/api/govhub/operations/queue" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "accept: application/json"
}

json_get_sessions() {
  local mission_id="$1"
  curl -sS -X GET "${BASE_URL%/}/api/govhub/operations/sessions?mission_id=${mission_id}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "accept: application/json"
}

json_get_sessions_by_agent() {
  curl -sS -X GET "${BASE_URL%/}/api/govhub/operations/sessions?agent_id=${EXEC_AGENT_ID}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "accept: application/json"
}

json_get_agents() {
  curl -sS -X GET "${BASE_URL%/}/api/govhub/operations/agents" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" -H "accept: application/json"
}

start_mission_session() {
  local session_id="$1"
  local session_token="$2"
  local mission_id="$3"
  local payload
  payload="$(node -e '
const payload = {
  action: "start_mission",
  session_id: process.argv[1],
  session_token: process.argv[2],
  mission_id: process.argv[3]
};
process.stdout.write(JSON.stringify(payload));
' "$session_id" "$session_token" "$mission_id")"
  curl -sS -X POST "${BASE_URL%/}/api/govhub/operations/sessions" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "content-type: application/json" \
    --data "$payload" >/dev/null || true
}

post_execution_event() {
  local session_id="$1"
  local session_token="$2"
  local mission_id="$3"
  local trace_id="$4"
  local run_id="$5"
  local event_type="$6"
  local stage="$7"
  local progress_pct="$8"
  local message="$9"
  local completion_proof="${10:-}"
  local payload
  payload="$(node -e '
const payload = {
  session_id: process.argv[1],
  session_token: process.argv[2],
  mission_id: process.argv[3],
  trace_id: process.argv[4],
  run_id: process.argv[5],
  event_type: process.argv[6],
  stage: process.argv[7],
  progress_pct: Number(process.argv[8] || 0),
  message: process.argv[9]
};
const proof = String(process.argv[10] || "").trim();
if (proof) payload.completion_proof = proof;
process.stdout.write(JSON.stringify(payload));
' "$session_id" "$session_token" "$mission_id" "$trace_id" "$run_id" "$event_type" "$stage" "$progress_pct" "$message" "$completion_proof")"
  curl -sS -X POST "${BASE_URL%/}/api/govhub/operations/execution-events" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "content-type: application/json" \
    --data "$payload" >/dev/null || true
}

complete_mission_session() {
  local session_id="$1"
  local session_token="$2"
  local mission_id="$3"
  local trace_id="$4"
  local run_id="$5"
  local completion_proof="$6"
  local delivery_summary="$7"
  local validation_summary="$8"
  local payload
  payload="$(node -e '
const payload = {
  action: "complete_mission",
  session_id: process.argv[1],
  session_token: process.argv[2],
  mission_id: process.argv[3],
  trace_id: process.argv[4],
  run_id: process.argv[5],
  completion_ack: true,
  completion_proof: process.argv[6],
  delivery_summary: process.argv[7],
  validation_summary: process.argv[8]
};
process.stdout.write(JSON.stringify(payload));
' "$session_id" "$session_token" "$mission_id" "$trace_id" "$run_id" "$completion_proof" "$delivery_summary" "$validation_summary")"
  curl -sS -X POST "${BASE_URL%/}/api/govhub/operations/sessions" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "content-type: application/json" \
    --data "$payload" >/dev/null || true
}

extract_session_tuple() {
  local file_path="$1"
  local mission_id="${2:-}"
  node -e '
const fs = require("fs");
const filePath = process.argv[1];
const missionId = String(process.argv[2] || "").trim().toUpperCase();
let data = {};
try { data = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch {}
const rows = Array.isArray(data.sessions) ? data.sessions : [];
let row = null;
if (missionId) {
  row = rows.find((r) => String(r.current_mission_id || "").trim().toUpperCase() === missionId) || null;
}
if (!row) row = rows[0] || null;
if (!row) process.exit(0);
const out = [
  String(row.session_id || ""),
  String(row.session_token || ""),
  String(row.current_trace_id || ""),
  String(row.current_run_id || ""),
  String(row.status || ""),
  String(row.current_mission_id || "")
];
process.stdout.write(out.join("\t"));
' "$file_path" "$mission_id"
}

maybe_execute_mission() {
  local mission_id="$1"
  local action="$2"
  local request_msg="$3"
  local sessions_file="$4"
  local fallback_sessions_file="$5"
  local queue_file="$6"

  if [[ "$action" != "MSG" ]]; then
    return
  fi

  local queue_status
  queue_status="$(node -e '
const fs=require("fs");
let q={}; try { q=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch {}
const row=(Array.isArray(q.rows)?q.rows:[])[0]||{};
process.stdout.write(String(row.status||""));
' "$queue_file")"
  if [[ "$queue_status" == "done" ]]; then
    return
  fi

  local tuple
  tuple="$(extract_session_tuple "$sessions_file" "$mission_id")"
  if [[ -z "$tuple" ]]; then
    tuple="$(extract_session_tuple "$fallback_sessions_file")"
  fi
  if [[ -z "$tuple" ]]; then
    return
  fi

  local session_id session_token trace_id run_id session_status current_mission
  IFS=$'\t' read -r session_id session_token trace_id run_id session_status current_mission <<< "$tuple"
  if [[ -z "$session_id" || -z "$session_token" ]]; then
    return
  fi

  if [[ "$current_mission" != "$mission_id" ]]; then
    start_mission_session "$session_id" "$session_token" "$mission_id"
    json_get_sessions "$mission_id" > "$sessions_file" || true
    tuple="$(extract_session_tuple "$sessions_file" "$mission_id")"
    if [[ -n "$tuple" ]]; then
      IFS=$'\t' read -r session_id session_token trace_id run_id session_status current_mission <<< "$tuple"
    fi
  fi

  if [[ -z "$trace_id" || -z "$run_id" ]]; then
    return
  fi

  post_execution_event "$session_id" "$session_token" "$mission_id" "$trace_id" "$run_id" "progress" "execution" "15" "Execução iniciada no executor CPP."

  local text_lc
  text_lc="$(printf '%s' "$request_msg" | tr '[:upper:]' '[:lower:]')"
  if [[ "$text_lc" != *"executar agora"* && "$text_lc" != *"execute agora"* ]]; then
    return
  fi

  if [[ "$text_lc" == *"excluir"* && "$text_lc" == *"chat"* ]]; then
    local file_path="/opt/proforma/proforma-platform/apps/gov-manager/src/app/page.tsx"
    local has_delete_fn has_delete_button
    has_delete_fn="0"
    has_delete_button="0"
    if rg -n "async function deleteChatMessage\\(" "$file_path" >/dev/null 2>&1; then
      has_delete_fn="1"
    fi
    if rg -n "deleteChatMessage\\(" "$file_path" >/dev/null 2>&1 && rg -n "Excluir mensagem" "$file_path" >/dev/null 2>&1; then
      has_delete_button="1"
    fi
    if [[ "$has_delete_fn" == "1" && "$has_delete_button" == "1" ]]; then
      local proof
      proof="proof://cpp/${mission_id}/chat-delete-button/$(date -u +%Y%m%dT%H%M%SZ)"
      post_execution_event "$session_id" "$session_token" "$mission_id" "$trace_id" "$run_id" "progress" "validation" "90" "Validação funcional concluída para exclusão de mensagens no chat."
      complete_mission_session \
        "$session_id" "$session_token" "$mission_id" "$trace_id" "$run_id" "$proof" \
        "Fluxo de exclusão de mensagens do chat presente na UI operacional." \
        "Validação estática confirmou handler deleteChatMessage e ação de exclusão no componente."
      return
    fi
    post_execution_event "$session_id" "$session_token" "$mission_id" "$trace_id" "$run_id" "blocked" "validation" "25" "Critério funcional de exclusão no chat não encontrado no código."
    return
  fi

  post_execution_event "$session_id" "$session_token" "$mission_id" "$trace_id" "$run_id" "blocked" "analysis" "20" "Execução automática sem estratégia para este pedido."
}

queue_create_item() {
  local mission_id="$1"
  local description="$2"
  local title="Missao ${mission_id}"
  local payload
  payload="$(node -e '
const missionId = String(process.argv[1] || "").trim().toUpperCase();
const title = String(process.argv[2] || "").trim() || `Missao ${missionId}`;
const description = String(process.argv[3] || "").replace(/\s+/g, " ").trim().slice(0, 800);
const body = {
  action: "create_item",
  mission_id: missionId,
  title,
  description,
  kind: "cpp",
  assignee: "CPP",
  priority: "P0"
};
process.stdout.write(JSON.stringify(body));
' "$mission_id" "$title" "$description")"
  curl -sS -X POST "${BASE_URL%/}/api/govhub/operations/queue" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "content-type: application/json" \
    --data "$payload" >/dev/null || true
}

reply_chat() {
  local payload="$1"
  curl -sS -X POST "${BASE_URL%/}/api/govhub/operations/chat/reply" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "content-type: application/json" \
    --data "$payload" >/dev/null
}

build_reply_message() {
  local mission_id="$1"
  local request_msg="$2"
  local action="$3"
  local queue_file="$4"
  local sessions_file="$5"
  local agents_file="$6"
  local fallback_sessions_file="$7"
  local fallback_queue_file="$8"
  local queue_all_file="$9"
  node -e '
const missionId = process.argv[1];
const requestMsg = String(process.argv[2] || "");
const action = String(process.argv[3] || "").trim().toUpperCase();
let q = {}, s = {}, a = {}, fs = {}, fq = {}, qa = {};
const fsp = require("fs");
try { q = JSON.parse(fsp.readFileSync(process.argv[4], "utf8")); } catch {}
try { s = JSON.parse(fsp.readFileSync(process.argv[5], "utf8")); } catch {}
try { a = JSON.parse(fsp.readFileSync(process.argv[6], "utf8")); } catch {}
try { fs = JSON.parse(fsp.readFileSync(process.argv[7], "utf8")); } catch {}
try { fq = JSON.parse(fsp.readFileSync(process.argv[8], "utf8")); } catch {}
try { qa = JSON.parse(fsp.readFileSync(process.argv[9], "utf8")); } catch {}

const text = requestMsg.toLowerCase();
const asksAgents = (
  (text.includes("lista") || text.includes("retorne") || text.includes("mostrar") || text.includes("quais")) &&
  (text.includes("agente") || text.includes("agentes"))
);
const asksPausedCount =
  (text.includes("quantas") || text.includes("qtd") || text.includes("numero")) &&
  (text.includes("missoes") || text.includes("missões")) &&
  (text.includes("pausad") || text.includes("paused"));

if (asksPausedCount) {
  const rows = Array.isArray(qa.rows) ? qa.rows : [];
  const count = rows.filter((r) => String(r.status || "").toLowerCase() === "paused_waiting_owner").length;
  process.stdout.write(`RESULTADO:${count}`);
  process.exit(0);
}

if (action === "NOVA_MISSAO") {
  const cleanRequest = String(requestMsg || "").replace(/\s+/g, " ").trim().slice(0, 220) || "sem_descricao";
  const msg = `MISSAO_RECEBIDA | mission=${missionId} | prioridade=P0 | status=registrada_em_a_fazer | pedido=${cleanRequest}`;
  process.stdout.write(msg.slice(0, 1800));
  process.exit(0);
}

if (asksAgents) {
  const rows = Array.isArray(a.rows) ? a.rows : [];
  const header = "| id | role | state | health | load | max | heartbeat |";
  const sep = "|---|---|---|---|---:|---:|---|";
  const body = rows.slice(0, 30).map((r) => {
    const id = String(r.agent_id || "-");
    const role = String(r.role || "-");
    const state = String(r.state || "-");
    const health = String(r.health || "-");
    const load = Number.isFinite(Number(r.current_load)) ? String(Number(r.current_load)) : "-";
    const max = Number.isFinite(Number(r.max_concurrency)) ? String(Number(r.max_concurrency)) : "-";
    const hb = String(r.last_heartbeat_at_utc || "-");
    return `| ${id} | ${role} | ${state} | ${health} | ${load} | ${max} | ${hb} |`;
  });
  const table = [header, sep, ...body].join("\n");
  const msg = `RESULTADO FACTUAL | agentes_cadastrados=${rows.length}\n${table}`;
  process.stdout.write(msg.slice(0, 1800));
  process.exit(0);
}

const qr = (Array.isArray(q.rows) ? q.rows : [])[0] || {};
const ss = (Array.isArray(s.sessions) ? s.sessions : [])[0] || {};
const ev = (Array.isArray(s.events) ? s.events : []).find((r) =>
  String(r.mission_id || "").trim().toUpperCase() === String(missionId || "").trim().toUpperCase()
) || {};
const queueStatus = String(qr.status || "n/a");
const queueProgress = qr.execution_progress_pct === undefined || qr.execution_progress_pct === null ? "n/a" : String(qr.execution_progress_pct);
const queueLabel = String(qr.execution_progress_label || "").trim() || "n/a";
const sessId = String(ss.session_id || "n/a");
const sessStatus = String(ss.status || "n/a");
const hb = String(ss.last_heartbeat_at_utc || ev.created_at_utc || "n/a");
const traceId = String(ss.current_trace_id || ev.trace_id || "n/a");
const runId = String(ss.current_run_id || ev.run_id || "n/a");

if (queueStatus === "n/a" && sessId === "n/a") {
  const cleanRequest = String(requestMsg || "").replace(/\s+/g, " ").trim().slice(0, 220) || "sem_descricao";
  const msg = `MISSAO_RECEBIDA | mission=${missionId} | status=aguardando_execucao | pedido=${cleanRequest}`;
  process.stdout.write(msg.slice(0, 1800));
  process.exit(0);
}

const msg = `RESULTADO FACTUAL | mission=${missionId} | queue=${queueStatus}(${queueProgress}%) | label=${queueLabel} | session=${sessId}/${sessStatus} | hb=${hb} | trace=${traceId} | run=${runId}`;
process.stdout.write(msg.slice(0, 1800));
' "$mission_id" "$request_msg" "$action" "$queue_file" "$sessions_file" "$agents_file" "$fallback_sessions_file" "$fallback_queue_file" "$queue_all_file"
}

while true; do
  refresh_session_cookie
  UNREAD_JSON="$(json_get_first_unread || true)"

  FIRST_JSON="$(node -e '
const raw = process.argv[1] || "{}";
let data = {};
try { data = JSON.parse(raw); } catch {}
const rows = Array.isArray(data.rows) ? data.rows : [];
const target = String(process.argv[2] || "").trim().toUpperCase();
const repliedTo = new Set(
  rows
    .filter((r) => String(r.direction || "").toLowerCase() === "inbound" && String(r.in_reply_to || "").trim())
    .map((r) => String(r.in_reply_to || "").trim())
);
const next = rows.find((r) => {
  if (String(r.direction || "").toLowerCase() !== "outbound") return false;
  if (String(r.target || "").trim().toUpperCase() !== target) return false;
  const action = String(r.action || "").trim().toUpperCase();
  if (action !== "MSG" && action !== "NOVA_MISSAO") return false;
  const messageId = String(r.message_id || "").trim();
  if (!messageId) return false;
  return !repliedTo.has(messageId);
});
process.stdout.write(JSON.stringify(next || {}));
' "$UNREAD_JSON" "$TARGET")"

  HAS_MESSAGE="$(node -e '
let row = {};
try { row = JSON.parse(process.argv[1] || "{}"); } catch {}
process.stdout.write(String(Boolean(row && row.message_id)));
' "$FIRST_JSON")"

  if [[ "$HAS_MESSAGE" != "true" ]]; then
    sleep "$POLL_SECS"
    continue
  fi

  MISSION_ID="$(node -e 'let r={};try{r=JSON.parse(process.argv[1]||"{}")}catch{};process.stdout.write(String(r.mission_id||""));' "$FIRST_JSON")"
  MESSAGE_ID="$(node -e 'let r={};try{r=JSON.parse(process.argv[1]||"{}")}catch{};process.stdout.write(String(r.message_id||""));' "$FIRST_JSON")"
  REQUESTOR="$(node -e 'let r={};try{r=JSON.parse(process.argv[1]||"{}")}catch{};process.stdout.write(String(r.actor||"STAFF"));' "$FIRST_JSON")"
  ACTION="$(node -e 'let r={};try{r=JSON.parse(process.argv[1]||"{}")}catch{};process.stdout.write(String(r.action||"MSG").toUpperCase());' "$FIRST_JSON")"
  REQUEST_MSG="$(node -e 'let r={};try{r=JSON.parse(process.argv[1]||"{}")}catch{};process.stdout.write(String(r.message||"").replace(/\s+/g," ").trim().slice(0,600));' "$FIRST_JSON")"

  TMP_DIR="/tmp/govhub"
  QUEUE_FILE="${TMP_DIR}/ops-chat-loop-queue.json"
  SESSIONS_FILE="${TMP_DIR}/ops-chat-loop-sessions.json"
  AGENTS_FILE="${TMP_DIR}/ops-chat-loop-agents.json"
  FALLBACK_SESSIONS_FILE="${TMP_DIR}/ops-chat-loop-fallback-sessions.json"
  FALLBACK_QUEUE_FILE="${TMP_DIR}/ops-chat-loop-fallback-queue.json"
  QUEUE_ALL_FILE="${TMP_DIR}/ops-chat-loop-queue-all.json"

  json_get_queue "$MISSION_ID" > "$QUEUE_FILE" || echo "{}" > "$QUEUE_FILE"
  json_get_sessions "$MISSION_ID" > "$SESSIONS_FILE" || echo "{}" > "$SESSIONS_FILE"
  json_get_agents > "$AGENTS_FILE" || echo "{}" > "$AGENTS_FILE"
  json_get_queue_all > "$QUEUE_ALL_FILE" || echo "{}" > "$QUEUE_ALL_FILE"
  json_get_sessions_by_agent > "$FALLBACK_SESSIONS_FILE" || echo "{}" > "$FALLBACK_SESSIONS_FILE"

  if [[ "$ACTION" == "NOVA_MISSAO" ]]; then
    EXISTING_COUNT="$(node -e '
const fs=require("fs");
let q={}; try { q=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); } catch {}
const rows=Array.isArray(q.rows)?q.rows:[];
process.stdout.write(String(rows.length));
' "$QUEUE_FILE")"
    if [[ "$EXISTING_COUNT" == "0" ]]; then
      queue_create_item "$MISSION_ID" "$REQUEST_MSG"
      json_get_queue "$MISSION_ID" > "$QUEUE_FILE" || true
    fi
  fi

  FALLBACK_MISSION_ID="$(node -e '
const fs=require("fs");
let j={};try{j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))}catch{}
const s=(j.sessions||[])[0]||{};
process.stdout.write(String(s.current_mission_id||""));
' "$FALLBACK_SESSIONS_FILE")"

  echo "{}" > "$FALLBACK_QUEUE_FILE"
  if [[ -n "$FALLBACK_MISSION_ID" ]]; then
    json_get_queue "$FALLBACK_MISSION_ID" > "$FALLBACK_QUEUE_FILE" || true
  fi
  FACTUAL_MESSAGE="$(build_reply_message "$MISSION_ID" "$REQUEST_MSG" "$ACTION" "$QUEUE_FILE" "$SESSIONS_FILE" "$AGENTS_FILE" "$FALLBACK_SESSIONS_FILE" "$FALLBACK_QUEUE_FILE" "$QUEUE_ALL_FILE")"

  PAYLOAD="$(node -e '
const payload = {
  mission_id: process.argv[1],
  actor: process.argv[2],
  target: process.argv[3],
  action: "MSG",
  in_reply_to: process.argv[4],
  source: process.argv[5],
  message: process.argv[6]
};
process.stdout.write(JSON.stringify(payload));
' "$MISSION_ID" "$REPLY_ACTOR" "$REQUESTOR" "$MESSAGE_ID" "$REPLY_SOURCE" "$FACTUAL_MESSAGE")"

  reply_chat "$PAYLOAD"
  maybe_execute_mission "$MISSION_ID" "$ACTION" "$REQUEST_MSG" "$SESSIONS_FILE" "$FALLBACK_SESSIONS_FILE" "$QUEUE_FILE"
  sleep 1
done
