import { NextResponse } from "next/server";
import { hasSessionCookie, readSessionFromRequest } from "../../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../../core/govhub-snapshots";
import { ALLOWED_CHAT_ACTIONS, clampChatText, nowUtc, sanitizeChatState, toOpsUdn, type ChatAction, type ChatMessage } from "../../../../../../core/operations-chat";

const CHAT_SNAPSHOT_TYPE = String(process.env.GOVHUB_CHAT_SNAPSHOT_TYPE || "gov_manager_ops_chat_v1").trim();
const ADMIN_COMMAND_ACTIONS = new Set<ChatAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"]);

function hasGovhubToken(request: Request, expectedToken: string): boolean {
  const provided = String(request.headers.get("x-govhub-token") || "").trim();
  return Boolean(provided && expectedToken && provided === expectedToken);
}

export async function POST(request: Request) {
  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const session = readSessionFromRequest(request);
  const tokenAuth = hasGovhubToken(request, config.token);
  if (!hasSessionCookie(request) && !tokenAuth) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const missionId = clampChatText(data.mission_id, 120);
  const actor = clampChatText(data.actor, 80) || "CPP-IA";
  const target = clampChatText(data.target, 80) || "STAFF";
  const action = clampChatText(data.action, 20).toUpperCase() as ChatAction;
  const message = clampChatText(data.message, 2000);
  const inReplyTo = clampChatText(data.in_reply_to, 120);
  const source = clampChatText(data.source, 80) || "chat-dispatch";
  const dispatchHttp = Number.isFinite(Number(data.dispatch_http)) ? Number(data.dispatch_http) : 200;
  const dispatchErrorCode = clampChatText(data.dispatch_error_code, 80);

  if (!missionId || !message || !ALLOWED_CHAT_ACTIONS.has(action)) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_ID_ACTION_MESSAGE_REQUIRED" },
      { status: 400 }
    );
  }
  if (session && session.role !== "admin" && ADMIN_COMMAND_ACTIONS.has(action) && !tokenAuth) {
    return NextResponse.json(
      { status: "forbidden", error_code: "ADMIN_REQUIRED_FOR_COMMAND" },
      { status: 403 }
    );
  }

  const loaded = await loadSnapshotPayload(config, CHAT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeChatState(loaded.payload) : sanitizeChatState(null);
  const messageId = `${missionId}-reply-${Date.now()}`;
  const udnBlock = toOpsUdn({ missionId, action, actor, target, message });

  const row: ChatMessage = {
    message_id: messageId,
    mission_id: missionId,
    actor,
    target,
    action,
    message,
    udn_block: udnBlock,
    direction: "inbound",
    in_reply_to: inReplyTo,
    source,
    delivery_status: "dispatched",
    dispatch_http: dispatchHttp,
    dispatch_error_code: dispatchErrorCode,
    created_at_utc: nowUtc()
  };

  const next = {
    version: "1.0" as const,
    updated_at_utc: nowUtc(),
    rows: [row, ...state.rows].slice(0, 500)
  };

  const saved = await saveSnapshotPayload(config, {
    snapshotType: CHAT_SNAPSHOT_TYPE,
    payload: next,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "ops-chat-reply"
  });

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: CHAT_SNAPSHOT_TYPE,
      row,
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
