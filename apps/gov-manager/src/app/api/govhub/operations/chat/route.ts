import { NextResponse } from "next/server";
import { hasSessionCookie, readSessionFromRequest } from "../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { defaultAgentRegistryState, sanitizeAgentRegistryState } from "../../../../../core/agent-registry";
import { createQueueId, defaultQueueState, sanitizeQueueState, upsertQueueItems, type QueueAssignee, type QueueItem, type QueuePriority } from "../../../../../core/execution-queue";
import { defaultMissionBoardState, sanitizeMissionBoardState, syncMissionBoardRelayStatus } from "../../../../../core/mission-board-relay";
import {
  ALLOWED_CHAT_ACTIONS,
  clampChatText,
  nowUtc,
  sanitizeChatState,
  toOpsUdn,
  type ChatAction,
  type ChatMessage,
  type DeliveryStatus
} from "../../../../../core/operations-chat";

const CHAT_SNAPSHOT_TYPE = String(process.env.GOVHUB_CHAT_SNAPSHOT_TYPE || "gov_manager_ops_chat_v1").trim();
const CHAT_DISPATCH_PATH = String(process.env.GOVHUB_CHAT_DISPATCH_PATH || "/webhook/govhub/operations/chat-dispatch").trim();
const CHAT_DISPATCH_MSG_PATH = String(process.env.GOVHUB_CHAT_DISPATCH_MSG_PATH || "/webhook/govhub/workers/cppia/dispatch").trim();
const CHAT_REPLY_PATH = String(process.env.GOVHUB_CHAT_REPLY_PATH || "/api/govhub/operations/chat/reply").trim();
const CHAT_DISPATCH_ENABLED = String(process.env.GOVHUB_CHAT_DISPATCH_ENABLED || "true").trim().toLowerCase() !== "false";
const CHAT_REAL_CONVERSA_ENABLED = String(process.env.GOVHUB_CHAT_REAL_CONVERSA_ENABLED || "true").trim().toLowerCase() !== "false";
const CHAT_REAL_CONVERSA_FALLBACK_LOCAL = String(process.env.GOVHUB_CHAT_REAL_CONVERSA_FALLBACK_LOCAL || "true").trim().toLowerCase() !== "false";
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const BOARD_SNAPSHOT_TYPE = String(process.env.GOVHUB_MISSIONS_MANAGE_SNAPSHOT_TYPE || "gov_manager_mission_board_v1").trim();
const ADMIN_COMMAND_ACTIONS = new Set<ChatAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"]);
const PRINCIPAL_ARCHITECT_TARGET = "PRINCIPAL_ARCHITECT";
const PREFERRED_CPP_AGENT_ID = "gov-codex-01";

function hasGovhubToken(request: Request, expectedToken: string): boolean {
  const provided = String(request.headers.get("x-govhub-token") || "").trim();
  return Boolean(provided && expectedToken && provided === expectedToken);
}

function isPrincipalArchitectTarget(target: string): boolean {
  const normalized = String(target || "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
  return normalized === PRINCIPAL_ARCHITECT_TARGET;
}

function compactReplyText(raw: unknown): string {
  let text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  text = text
    .replace(/^Recebido,?\s*[^.]*\.\s*/i, "")
    .replace(/Miss[aã]o:\s*[^.]*\.\s*/gi, "")
    .replace(/Leitura inicial:\s*/gi, "")
    .replace(/^Pergunta:\s*/i, "")
    .replace(/^\s*Resposta:\s*/i, "")
    .replace(/Pr[oó]ximo passo recomendado:\s*/gi, "Próximo: ");

  return clampChatText(text, 280);
}

function buildLocalReply(input: { missionId: string; actor: string; message: string }): string {
  const clean = String(input.message || "").trim();
  const lower = clean.toLowerCase();

  const compact = (text: string) => clampChatText(text.replace(/\s+/g, " ").trim(), 320);

  if (lower.includes("n8n") || lower.includes("webhook") || lower.includes("externo")) {
    return compact(
      "Sim, é viável integrar com n8n externo via webhook/API. Próximo: definir contrato (auth, idempotência, timeout, retry, auditoria) e isolar por credencial/tenant."
    );
  }

  if (lower.includes("investidor") || lower.includes("investidores") || lower.includes("apresenta")) {
    return compact(
      "Recomendado: apresentação executiva para investidores. Próximo: público-alvo, proposta de valor, métricas (tração/custo), riscos e pedido objetivo."
    );
  }

  if (lower.includes("pendente") || lower.includes("fila") || lower.includes("progresso")) {
    return compact(
      "Status operacional: posso listar pendências, bloqueios e próximo destrave. Próximo: confirmar missão foco e prioridade (P0/P1/P2)."
    );
  }

  if (lower.includes("custo") || lower.includes("token") || lower.includes("orçamento")) {
    return compact(
      "Diretriz de custo: reduzir contexto repetido, padronizar UDN compacto e limitar retries. Próximo: enviar missão alvo para projeção de consumo."
    );
  }

  if (lower.includes("erro") || lower.includes("falha") || lower.includes("bug")) {
    return compact(
      "Recebido. Próximo: abrir diagnóstico objetivo (causa, impacto, mitigação) e aplicar correção com validação antes/depois."
    );
  }

  const shortEcho = compact(clean).slice(0, 110);
  return compact(`Recebido: ${shortEcho}. Próximo: defina objetivo, restrições e critério de aceite para execução direta.`);
}

function resolveReplyFromDispatch(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const row = data as Record<string, unknown>;
  const candidates = [
    row.reply,
    row.response,
    row.answer,
    row.message,
    row.output_text,
    row.text
  ];
  for (const value of candidates) {
    const text = compactReplyText(value);
    if (text) return text;
  }
  return "";
}

function targetWorkerRoute(target: string): string {
  const normalized = String(target || "").trim().toUpperCase();
  if (normalized === "CPP") return "/webhook/govhub/workers/cpp/dispatch";
  if (normalized === "CPP-IA") return "/webhook/govhub/workers/cppia/dispatch";
  return "";
}

function normalizeQueuePriority(value: unknown): QueuePriority {
  const clean = String(value || "").trim().toUpperCase();
  if (clean === "P0" || clean === "P1" || clean === "P2" || clean === "P3") return clean;
  return "P1";
}

function inferPriorityFromMessage(message: string): QueuePriority {
  const clean = String(message || "").toUpperCase();
  const match = clean.match(/\b(P[0-3])\b/);
  return normalizeQueuePriority(match?.[1] || "");
}

function resolveMissionAssignee(
  target: string,
  agentsState: ReturnType<typeof sanitizeAgentRegistryState>
): { assignee: QueueAssignee; assigneeAgentId: string } {
  const clean = String(target || "").trim();
  const upper = clean.toUpperCase();
  if (upper === "STAFF") return { assignee: "STAFF", assigneeAgentId: "" };
  if (upper === "CPP" || upper === "CPP-IA") {
    const preferred =
      upper === "CPP"
        ? agentsState.rows.find((row) => String(row.agent_id || "").trim().toLowerCase() === PREFERRED_CPP_AGENT_ID)
        : null;
    const fallback = agentsState.rows.find((row) => String(row.role || "").trim().toUpperCase() === upper);
    return { assignee: upper, assigneeAgentId: String(preferred?.agent_id || fallback?.agent_id || "").trim() };
  }

  const exact = agentsState.rows.find((row) => String(row.agent_id || "").trim().toLowerCase() === clean.toLowerCase());
  if (exact) {
    const role = String(exact.role || "").trim().toUpperCase();
    if (role === "CPP" || role === "CPP-IA") return { assignee: role, assigneeAgentId: exact.agent_id };
  }

  return { assignee: "CPP", assigneeAgentId: "" };
}

function buildMissionTitle(message: string, fallbackMissionId: string): string {
  const lines = String(message || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = String(lines[0] || "").replace(/^nova miss[aã]o\s*[:\-]?\s*/i, "").trim();
  return clampChatText(title || `Execução ${fallbackMissionId}`, 180);
}

async function publishChatReply(
  config: ReturnType<typeof resolveGovhubSnapshotConfig>,
  payload: Record<string, unknown>
): Promise<void> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const path = CHAT_REPLY_PATH.startsWith("/") ? CHAT_REPLY_PATH : `/${CHAT_REPLY_PATH}`;
  await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-govhub-token": config.token
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  }).catch(() => undefined);
}

async function dispatchToWebhook(
  config: ReturnType<typeof resolveGovhubSnapshotConfig>,
  payload: Record<string, unknown>,
  pathOverride?: string
): Promise<{ status: DeliveryStatus; http: number | null; error_code: string; data: unknown }> {
  if (!CHAT_DISPATCH_ENABLED) return { status: "queued", http: null, error_code: "DISPATCH_DISABLED", data: null };
  const base = config.baseUrl.replace(/\/+$/, "");
  const rawPath = String(pathOverride || CHAT_DISPATCH_PATH).trim();
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const endpoint = `${base}${path}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-govhub-token": config.token
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    if (response.ok) return { status: "dispatched", http: response.status, error_code: "", data: parsed };
    return { status: "failed", http: response.status, error_code: "DISPATCH_HTTP_ERROR", data: parsed };
  } catch {
    return { status: "failed", http: null, error_code: "DISPATCH_FETCH_FAILED", data: null };
  }
}

export async function GET(request: Request) {
  const config = resolveGovhubSnapshotConfig();
  const tokenAuth = hasGovhubToken(request, config.token);
  if (!hasSessionCookie(request) && !tokenAuth) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, CHAT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeChatState(loaded.payload) : sanitizeChatState(null);
  const url = new URL(request.url);
  const missionFilter = clampChatText(url.searchParams.get("mission_id"), 120);
  const unreadFor = clampChatText(url.searchParams.get("unread_for"), 80).toUpperCase();
  const limitRaw = Number(url.searchParams.get("limit") || 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;

  let rows = missionFilter ? state.rows.filter((row) => row.mission_id === missionFilter) : state.rows;

  if (unreadFor) {
    const repliedTo = new Set(
      rows
        .filter((row) => row.direction === "inbound" && String(row.in_reply_to || "").trim())
        .map((row) => String(row.in_reply_to || "").trim())
    );
    rows = rows.filter((row) => {
      if (row.direction !== "outbound") return false;
      if (String(row.action || "").toUpperCase() !== "MSG") return false;
      if (String(row.target || "").trim().toUpperCase() !== unreadFor) return false;
      const messageId = String(row.message_id || "").trim();
      if (!messageId) return false;
      return !repliedTo.has(messageId);
    });
  }

  rows = rows.slice(0, limit);

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: CHAT_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
      unread_for: unreadFor || null,
      unread_count: unreadFor ? rows.length : undefined,
      rows,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const missionId = clampChatText(data.mission_id, 120);
  const action = clampChatText(data.action, 20).toUpperCase() as ChatAction;
  const defaultTarget = action === "MSG" ? "STAFF" : "CPP";
  const actor = session.username;
  const target = clampChatText(data.target, 80) || defaultTarget;
  const message = clampChatText(data.message, 2000);
  const isAdminCommand = ADMIN_COMMAND_ACTIONS.has(action);

  if (!missionId || !ALLOWED_CHAT_ACTIONS.has(action)) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_ID_AND_ACTION_REQUIRED" },
      { status: 400 }
    );
  }
  if (action === "MSG" && !message) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MESSAGE_REQUIRED" },
      { status: 400 }
    );
  }
  if (session.role !== "admin" && isAdminCommand) {
    return NextResponse.json(
      { status: "forbidden", error_code: "ADMIN_REQUIRED_FOR_COMMAND" },
      { status: 403 }
    );
  }

  const udnBlock = toOpsUdn({ missionId, action, actor, target, message });
  const loaded = await loadSnapshotPayload(config, CHAT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeChatState(loaded.payload) : sanitizeChatState(null);
  const messageId = `${missionId}-${Date.now()}`;

  const shouldUseRealConversa = action === "MSG" && isPrincipalArchitectTarget(target) && CHAT_REAL_CONVERSA_ENABLED;
  const workerChatPath = targetWorkerRoute(target);
  const dispatchPayload = {
    message_id: messageId,
    mission_id: missionId,
    actor,
    target,
    action,
    message,
    udn_block: udnBlock
  };
  const rows: ChatMessage[] = [];

  let dispatch: { status: DeliveryStatus; http: number | null; error_code: string; data: unknown };
  if (shouldUseRealConversa) {
    dispatch = await dispatchToWebhook(config, {
      ...dispatchPayload,
      task_id: missionId,
      source: "gov-manager-chat"
    }, CHAT_DISPATCH_MSG_PATH);
  } else if ((action === "MSG" || action === "STATUS") && workerChatPath) {
    dispatch = await dispatchToWebhook(config, {
      ...dispatchPayload,
      task_id: missionId,
      queue_id: missionId,
      source: "gov-manager-chat",
      use_llm: action === "MSG"
    }, workerChatPath);
    if (dispatch.status === "dispatched") {
      const replyMessage = compactReplyText(resolveReplyFromDispatch(dispatch.data));
      if (replyMessage) {
        const replyActor = target;
        const replyTarget = actor;
        const replyUdn = toOpsUdn({ missionId, action: "MSG", actor: replyActor, target: replyTarget, message: replyMessage });
        rows.push({
          message_id: `${missionId}-reply-${Date.now()}`,
          mission_id: missionId,
          actor: replyActor,
          target: replyTarget,
          action: "MSG",
          message: replyMessage,
          udn_block: replyUdn,
          direction: "inbound",
          in_reply_to: messageId,
          source: "worker-chat-reply",
          delivery_status: "dispatched",
          dispatch_http: dispatch.http ?? 200,
          dispatch_error_code: "",
          created_at_utc: nowUtc()
        });
      }
    }
  } else {
    dispatch = { status: "queued", http: null, error_code: "", data: null };
  }

  const row: ChatMessage = {
    message_id: messageId,
    mission_id: missionId,
    actor,
    target,
    action,
    message,
    udn_block: udnBlock,
    direction: "outbound",
    in_reply_to: "",
    source: "staff-ui",
    delivery_status: dispatch.status,
    dispatch_http: dispatch.http,
    dispatch_error_code: dispatch.error_code,
    created_at_utc: nowUtc()
  };

  rows.push(row);
  let chatMode: "legacy" | "realtime" = "legacy";
  let missionDispatch: Record<string, unknown> | null = null;

  if (action === "NOVA_MISSAO") {
    const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
    const agentsState = agentsLoaded.found && agentsLoaded.payload
      ? sanitizeAgentRegistryState(agentsLoaded.payload)
      : defaultAgentRegistryState();
    const routing = resolveMissionAssignee(target, agentsState);
    const priority: QueuePriority = "P0";
    const title = buildMissionTitle(message, missionId);
    const description = clampChatText(message || title, 800);
    const queueLoaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
    const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
    const existing = queueState.rows.find((item) => item.mission_id === missionId && item.status !== "done");

    if (!existing) {
      const queueItem: QueueItem = {
        queue_id: createQueueId(missionId, title),
        mission_id: missionId,
        title,
        description,
        kind: routing.assignee,
        priority,
        assignee: routing.assignee,
        ...(routing.assigneeAgentId ? { assignee_agent_id: routing.assigneeAgentId } : {}),
        last_transition_reason_code: "CHAT_NEW_MISSION",
        last_transition_reason_message: `Missão aberta via comando NOVA_MISSAO por ${actor}.`,
        last_transition_source: "operations-chat",
        last_transition_actor: actor,
        last_transition_at_utc: nowUtc(),
        status: "open",
        created_at_utc: nowUtc(),
        updated_at_utc: nowUtc()
      };
      const nextQueue = upsertQueueItems(queueState, [queueItem]);
      const queueSaved = await saveSnapshotPayload(config, {
        snapshotType: QUEUE_SNAPSHOT_TYPE,
        payload: nextQueue,
        createdBy: actor,
        sourceRepo: "gov-manager",
        sourceRef: "ops-chat-nova-missao"
      });

      const boardLoaded = await loadSnapshotPayload(config, BOARD_SNAPSHOT_TYPE);
      const boardState = boardLoaded.found && boardLoaded.payload
        ? sanitizeMissionBoardState(boardLoaded.payload)
        : defaultMissionBoardState();
      const nextBoard = syncMissionBoardRelayStatus(boardState, {
        missionId,
        objective: title,
        assignee: routing.assignee,
        priority,
        status: "open",
        actor,
        now: nowUtc()
      });
      const boardSaved = await saveSnapshotPayload(config, {
        snapshotType: BOARD_SNAPSHOT_TYPE,
        payload: nextBoard,
        createdBy: actor,
        sourceRepo: "gov-manager",
        sourceRef: "ops-chat-nova-missao-board"
      });

      missionDispatch = {
        status: queueSaved.ok && boardSaved.ok ? "created" : "upstream_error",
        mission_id: missionId,
        queue_id: queueItem.queue_id,
        assignee: routing.assignee,
        assignee_agent_id: routing.assigneeAgentId || null,
        priority,
        queue_govhub_http: queueSaved.status,
        board_govhub_http: boardSaved.status
      };
    } else {
      missionDispatch = {
        status: "already_exists",
        mission_id: missionId,
        queue_id: existing.queue_id,
        assignee: existing.assignee,
        assignee_agent_id: String(existing.assignee_agent_id || "").trim() || null,
        priority: existing.priority
      };
    }
  }

  if (action === "MSG" && isPrincipalArchitectTarget(target)) {
    let replyMessage = "";
    let replySource = "principal-architect-local";
    if (shouldUseRealConversa && dispatch.status === "dispatched") {
      replyMessage = resolveReplyFromDispatch(dispatch.data);
      chatMode = "realtime";
      replySource = "principal-architect-realtime";
    }
    if (!replyMessage && CHAT_REAL_CONVERSA_FALLBACK_LOCAL) {
      replyMessage = buildLocalReply({ missionId, actor, message });
      if (shouldUseRealConversa) {
        replySource = "principal-architect-fallback";
      }
    }
    replyMessage = compactReplyText(replyMessage);

    if (replyMessage) {
      const replyMessageId = `${missionId}-reply-${Date.now()}`;
      const replyActor = PRINCIPAL_ARCHITECT_TARGET;
      const replyTarget = actor;
      const replyUdn = toOpsUdn({
        missionId,
        action: "MSG",
        actor: replyActor,
        target: replyTarget,
        message: replyMessage
      });
      rows.push({
        message_id: replyMessageId,
        mission_id: missionId,
        actor: replyActor,
        target: replyTarget,
        action: "MSG",
        message: replyMessage,
        udn_block: replyUdn,
        direction: "inbound",
        in_reply_to: messageId,
        source: replySource,
        delivery_status: "dispatched",
        dispatch_http: dispatch.http ?? 200,
        dispatch_error_code: "",
        created_at_utc: nowUtc()
      });
    }
  }

  const orderedRows = rows.sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc));

  if (orderedRows.length > 1) {
    const inbound = orderedRows.find((entry) => entry.direction === "inbound" && entry.in_reply_to === messageId);
    if (inbound) {
      await publishChatReply(config, {
        mission_id: missionId,
        actor: inbound.actor,
        target: inbound.target,
        action: "MSG",
        message: inbound.message,
        in_reply_to: messageId,
        source: inbound.source,
        dispatch_http: inbound.dispatch_http
      });
    }
  }

  const next = {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: [...orderedRows, ...state.rows].slice(0, 500)
  };

  const saved = await saveSnapshotPayload(config, {
    snapshotType: CHAT_SNAPSHOT_TYPE,
    payload: next,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "ops-chat"
  });

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: CHAT_SNAPSHOT_TYPE,
      row,
      rows: orderedRows,
      ...(missionDispatch ? { mission_dispatch: missionDispatch } : {}),
      chat_mode: chatMode,
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}

export async function DELETE(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const deleteAll = String(url.searchParams.get("all") || "").trim().toLowerCase() === "true";
  const messageId = clampChatText(url.searchParams.get("message_id"), 120);
  if (!deleteAll && !messageId) {
    return NextResponse.json({ status: "invalid_request", error_code: "MESSAGE_ID_REQUIRED" }, { status: 400 });
  }

  const loaded = await loadSnapshotPayload(config, CHAT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeChatState(loaded.payload) : sanitizeChatState(null);

  const deleteIds = new Set<string>();
  let nextRows = state.rows;
  if (deleteAll) {
    for (const row of state.rows) {
      const rowId = String(row.message_id || "").trim();
      if (rowId) deleteIds.add(rowId);
    }
    nextRows = [];
  } else {
    deleteIds.add(messageId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of state.rows) {
        const parentId = String(row.in_reply_to || "").trim();
        const rowId = String(row.message_id || "").trim();
        if (!rowId || !parentId) continue;
        if (deleteIds.has(parentId) && !deleteIds.has(rowId)) {
          deleteIds.add(rowId);
          changed = true;
        }
      }
    }
    nextRows = state.rows.filter((row) => !deleteIds.has(String(row.message_id || "").trim()));
  }
  if (nextRows.length === state.rows.length) {
    return NextResponse.json({ status: "not_found", error_code: "MESSAGE_NOT_FOUND" }, { status: 404 });
  }

  const next = {
    version: "1.0" as const,
    updated_at_utc: nowUtc(),
    rows: nextRows
  };

  const saved = await saveSnapshotPayload(config, {
    snapshotType: CHAT_SNAPSHOT_TYPE,
    payload: next,
    createdBy: session.username,
    sourceRepo: "gov-manager",
    sourceRef: "ops-chat-delete"
  });

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: CHAT_SNAPSHOT_TYPE,
      deleted_count: state.rows.length - nextRows.length,
      deleted_message_ids: [...deleteIds].filter((id) => state.rows.some((row) => row.message_id === id)),
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
