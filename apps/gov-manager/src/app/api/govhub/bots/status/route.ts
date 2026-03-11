import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { defaultBotStatusState, sanitizeBotStatusState, upsertBotStatusRow } from "../../../../../core/bot-status";

const BOT_STATUS_SNAPSHOT_TYPE = String(process.env.GOVHUB_BOT_STATUS_SNAPSHOT_TYPE || "gov_manager_bot_status_v1").trim();
const BOT_STATUS_WRITE_TOKEN = String(process.env.GOV_MANAGER_BOT_STATUS_TOKEN || "").trim();

function hasBotWriteToken(request: Request): boolean {
  const provided = String(request.headers.get("x-gov-manager-token") || "").trim();
  if (!BOT_STATUS_WRITE_TOKEN || !provided) return false;
  return provided === BOT_STATUS_WRITE_TOKEN;
}

function canRead(request: Request): boolean {
  return hasSessionCookie(request) || hasBotWriteToken(request);
}

function canWrite(request: Request): boolean {
  return hasSessionCookie(request) || hasBotWriteToken(request);
}

export async function GET(request: Request) {
  if (!canRead(request)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, BOT_STATUS_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeBotStatusState(loaded.payload) : defaultBotStatusState();

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: BOT_STATUS_SNAPSHOT_TYPE,
      rows: state.rows,
      updated_at_utc: state.updated_at_utc,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function PUT(request: Request) {
  if (!canWrite(request)) {
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
  const botId = String(data.bot_id || "").trim();
  const workflowId = String(data.workflow_id || "").trim();
  if (!botId || !workflowId) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "BOT_ID_AND_WORKFLOW_REQUIRED" },
      { status: 400 }
    );
  }

  const loaded = await loadSnapshotPayload(config, BOT_STATUS_SNAPSHOT_TYPE);
  const base = loaded.found && loaded.payload ? sanitizeBotStatusState(loaded.payload) : defaultBotStatusState();
  const next = upsertBotStatusRow(base, {
    bot_id: botId,
    workflow_id: workflowId,
    state: String(data.state || "unknown"),
    result: String(data.result || ""),
    message: String(data.message || ""),
    run_id: String(data.run_id || ""),
    run_url: String(data.run_url || ""),
    actor: String(data.actor || botId),
    updated_at_utc: String(data.updated_at_utc || new Date().toISOString())
  });

  const actor = String(data.actor || "bot@gov-manager").trim() || "bot@gov-manager";
  const saved = await saveSnapshotPayload(config, {
    snapshotType: BOT_STATUS_SNAPSHOT_TYPE,
    payload: next,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "bot-status"
  });

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: BOT_STATUS_SNAPSHOT_TYPE,
      updated_at_utc: next.updated_at_utc,
      row: next.rows.find((row) => row.bot_id === botId && row.workflow_id === workflowId) || null,
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
