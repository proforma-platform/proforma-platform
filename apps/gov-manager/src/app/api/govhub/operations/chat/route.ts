import { NextResponse } from "next/server";
import { hasSessionCookie, readSessionFromRequest } from "../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
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
const CHAT_DISPATCH_ENABLED = String(process.env.GOVHUB_CHAT_DISPATCH_ENABLED || "true").trim().toLowerCase() !== "false";
const CHAT_REAL_CONVERSA_ENABLED = String(process.env.GOVHUB_CHAT_REAL_CONVERSA_ENABLED || "true").trim().toLowerCase() !== "false";
const CHAT_REAL_CONVERSA_FALLBACK_LOCAL = String(process.env.GOVHUB_CHAT_REAL_CONVERSA_FALLBACK_LOCAL || "true").trim().toLowerCase() !== "false";
const ADMIN_COMMAND_ACTIONS = new Set<ChatAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"]);
const PRINCIPAL_ARCHITECT_TARGET = "PRINCIPAL_ARCHITECT";

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
  const dispatchPayload = {
    message_id: messageId,
    mission_id: missionId,
    actor,
    target,
    action,
    message,
    udn_block: udnBlock
  };

  let dispatch: { status: DeliveryStatus; http: number | null; error_code: string; data: unknown };
  if (shouldUseRealConversa) {
    dispatch = await dispatchToWebhook(config, {
      ...dispatchPayload,
      task_id: missionId,
      source: "gov-manager-chat"
    }, CHAT_DISPATCH_MSG_PATH);
  } else if (action === "MSG") {
    dispatch = { status: "dispatched", http: 204, error_code: "", data: null };
  } else {
    dispatch = await dispatchToWebhook(config, dispatchPayload);
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

  const rows: ChatMessage[] = [row];
  let chatMode: "legacy" | "realtime" = "legacy";

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
      rows.unshift({
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

  const next = {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: [...rows, ...state.rows].slice(0, 500)
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
      rows,
      chat_mode: chatMode,
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
