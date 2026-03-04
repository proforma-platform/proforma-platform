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
const CHAT_DISPATCH_ENABLED = String(process.env.GOVHUB_CHAT_DISPATCH_ENABLED || "true").trim().toLowerCase() !== "false";
const ADMIN_COMMAND_ACTIONS = new Set<ChatAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO"]);

async function dispatchToWebhook(
  config: ReturnType<typeof resolveGovhubSnapshotConfig>,
  payload: Record<string, unknown>
): Promise<{ status: DeliveryStatus; http: number | null; error_code: string }> {
  if (!CHAT_DISPATCH_ENABLED) return { status: "queued", http: null, error_code: "DISPATCH_DISABLED" };
  const base = config.baseUrl.replace(/\/+$/, "");
  const path = CHAT_DISPATCH_PATH.startsWith("/") ? CHAT_DISPATCH_PATH : `/${CHAT_DISPATCH_PATH}`;
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
    if (response.ok) return { status: "dispatched", http: response.status, error_code: "" };
    return { status: "failed", http: response.status, error_code: "DISPATCH_HTTP_ERROR" };
  } catch {
    return { status: "failed", http: null, error_code: "DISPATCH_FETCH_FAILED" };
  }
}

export async function GET(request: Request) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
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
  const rows = missionFilter ? state.rows.filter((row) => row.mission_id === missionFilter) : state.rows;

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: CHAT_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
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

  const dispatch =
    action === "MSG"
      ? { status: "dispatched" as DeliveryStatus, http: 204, error_code: "" }
      : await dispatchToWebhook(config, {
          message_id: messageId,
          mission_id: missionId,
          actor,
          target,
          action,
          message,
          udn_block: udnBlock
        });

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

  const next = {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: [row, ...state.rows].slice(0, 500)
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
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
