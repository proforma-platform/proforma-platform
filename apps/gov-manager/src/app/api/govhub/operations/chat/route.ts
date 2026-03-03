import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";

type ChatAction = "OK" | "PAUSAR" | "NEGAR" | "OWNER_CALL" | "NOVA_MISSAO" | "STATUS";
type DeliveryStatus = "queued" | "dispatched" | "failed";

interface ChatMessage {
  message_id: string;
  mission_id: string;
  actor: string;
  target: string;
  action: ChatAction;
  message: string;
  udn_block: string;
  delivery_status: DeliveryStatus;
  dispatch_http: number | null;
  dispatch_error_code: string;
  created_at_utc: string;
}

interface ChatState {
  version: "1.0";
  updated_at_utc: string;
  rows: ChatMessage[];
}

const CHAT_SNAPSHOT_TYPE = String(process.env.GOVHUB_CHAT_SNAPSHOT_TYPE || "gov_manager_ops_chat_v1").trim();
const CHAT_DISPATCH_PATH = String(process.env.GOVHUB_CHAT_DISPATCH_PATH || "/webhook/govhub/operations/chat-dispatch").trim();
const CHAT_DISPATCH_ENABLED = String(process.env.GOVHUB_CHAT_DISPATCH_ENABLED || "true").trim().toLowerCase() !== "false";
const ALLOWED_ACTIONS = new Set<ChatAction>(["OK", "PAUSAR", "NEGAR", "OWNER_CALL", "NOVA_MISSAO", "STATUS"]);

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function sanitizeState(input: unknown): ChatState {
  if (!input || typeof input !== "object") {
    return { version: "1.0", updated_at_utc: nowUtc(), rows: [] };
  }
  const obj = input as Record<string, unknown>;
  const rows = Array.isArray(obj.rows) ? obj.rows : [];
  const out = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const messageId = clampText(r.message_id, 120);
      const missionId = clampText(r.mission_id, 120);
      const action = clampText(r.action, 20) as ChatAction;
      if (!messageId || !missionId || !ALLOWED_ACTIONS.has(action)) return null;
      const created = new Date(clampText(r.created_at_utc, 64));
      const createdAt = Number.isNaN(created.getTime()) ? nowUtc() : created.toISOString();
      const delivery = clampText(r.delivery_status, 20).toLowerCase();
      const delivery_status: DeliveryStatus = delivery === "dispatched" || delivery === "failed" ? (delivery as DeliveryStatus) : "queued";
      return {
        message_id: messageId,
        mission_id: missionId,
        actor: clampText(r.actor, 80),
        target: clampText(r.target, 80),
        action,
        message: clampText(r.message, 2000),
        udn_block: clampText(r.udn_block, 3000),
        delivery_status,
        dispatch_http: Number.isFinite(Number(r.dispatch_http)) ? Number(r.dispatch_http) : null,
        dispatch_error_code: clampText(r.dispatch_error_code, 80),
        created_at_utc: createdAt
      } satisfies ChatMessage;
    })
    .filter((row): row is ChatMessage => Boolean(row))
    .sort((a, b) => b.created_at_utc.localeCompare(a.created_at_utc))
    .slice(0, 500);

  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: out
  };
}

function toUdn(input: { missionId: string; action: ChatAction; actor: string; target: string; message: string }): string {
  const safe = (text: string) => text.replace(/\r?\n/g, " ").replace(/[;|]/g, ",").trim();
  return [
    `!OPS|${safe(input.missionId)}|${input.action}|CHAT_CMD`,
    `#actor:${safe(input.actor)};target=${safe(input.target)}`,
    `#msg:${safe(input.message)}`,
    "#tau:dispatch_to_worker;update_queue;persist_audit",
    "!OUT:JSON_ONLY.NO_MD.NO_TXT."
  ].join("\n");
}

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
  const state = loaded.found && loaded.payload ? sanitizeState(loaded.payload) : sanitizeState(null);
  const url = new URL(request.url);
  const missionFilter = clampText(url.searchParams.get("mission_id"), 120);
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const missionId = clampText(data.mission_id, 120);
  const action = clampText(data.action, 20).toUpperCase() as ChatAction;
  const actor = clampText(data.actor, 80) || "staff@gov-manager";
  const target = clampText(data.target, 80) || "CPP";
  const message = clampText(data.message, 2000);

  if (!missionId || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_ID_AND_ACTION_REQUIRED" },
      { status: 400 }
    );
  }

  const udnBlock = toUdn({ missionId, action, actor, target, message });
  const loaded = await loadSnapshotPayload(config, CHAT_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeState(loaded.payload) : sanitizeState(null);
  const messageId = `${missionId}-${Date.now()}`;

  const dispatch = await dispatchToWebhook(config, {
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
    delivery_status: dispatch.status,
    dispatch_http: dispatch.http,
    dispatch_error_code: dispatch.error_code,
    created_at_utc: nowUtc()
  };

  const next: ChatState = {
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
