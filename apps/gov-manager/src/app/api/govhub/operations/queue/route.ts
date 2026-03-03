import { NextResponse } from "next/server";
import { hasSessionCookie } from "../../../../../auth/session";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import {
  createQueueId,
  decideAssignee,
  defaultQueueState,
  sanitizeQueueState,
  summarizeQueue,
  upsertQueueItems,
  type QueueItem,
  type QueuePriority,
  type QueueStatus
} from "../../../../../core/execution-queue";

const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();

function isPriority(value: unknown): value is QueuePriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3";
}

function isStatus(value: unknown): value is QueueStatus {
  return value === "open" || value === "in_progress" || value === "done" || value === "paused_waiting_owner";
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

  const loaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeQueueState(loaded.payload) : defaultQueueState();

  const url = new URL(request.url);
  const statusFilter = String(url.searchParams.get("status") || "").trim();
  const assigneeFilter = String(url.searchParams.get("assignee") || "").trim().toUpperCase();
  const missionFilter = String(url.searchParams.get("mission_id") || "").trim();

  const rows = state.rows.filter((row) => {
    if (isStatus(statusFilter) && row.status !== statusFilter) return false;
    if (assigneeFilter && row.assignee !== assigneeFilter) return false;
    if (missionFilter && row.mission_id !== missionFilter) return false;
    return true;
  });

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: QUEUE_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
      summary: summarizeQueue(rows),
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
  const action = String(data.action || "create_plan").trim();
  const actor = String(data.actor || "staff@gov-manager").trim() || "staff@gov-manager";

  const loaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
  const base = loaded.found && loaded.payload ? sanitizeQueueState(loaded.payload) : defaultQueueState();
  const now = new Date().toISOString();

  let newItems: QueueItem[] = [];

  if (action === "create_item") {
    const missionId = String(data.mission_id || "").trim();
    const title = String(data.title || "").trim();
    if (!missionId || !title) {
      return NextResponse.json(
        { status: "invalid_request", error_code: "MISSION_ID_AND_TITLE_REQUIRED" },
        { status: 400 }
      );
    }

    const kind = String(data.kind || "general").trim();
    const priority = isPriority(data.priority) ? data.priority : "P2";
    newItems = [
      {
        queue_id: createQueueId(missionId, title),
        mission_id: missionId,
        title,
        description: String(data.description || "").slice(0, 800),
        kind,
        priority,
        assignee: decideAssignee(kind),
        status: "open",
        created_at_utc: now,
        updated_at_utc: now
      }
    ];
  } else if (action === "create_plan") {
    const missionId = String(data.mission_id || "").trim();
    if (!missionId) {
      return NextResponse.json(
        { status: "invalid_request", error_code: "MISSION_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const tasksRaw = Array.isArray(data.tasks) ? data.tasks : [];
    if (tasksRaw.length === 0) {
      return NextResponse.json(
        { status: "invalid_request", error_code: "TASKS_REQUIRED" },
        { status: 400 }
      );
    }

    newItems = tasksRaw.reduce<QueueItem[]>((acc, task, idx) => {
      if (!task || typeof task !== "object") return acc;
      const row = task as Record<string, unknown>;
      const title = String(row.title || row.goal || "").trim();
      if (!title) return acc;
      const kind = String(row.kind || row.executor || "general").trim();
      const priority = isPriority(row.priority) ? row.priority : "P2";
      acc.push({
        queue_id: createQueueId(missionId, title, idx + 1),
        mission_id: missionId,
        title,
        description: String(row.description || row.goal || "").slice(0, 800),
        kind,
        priority,
        assignee: decideAssignee(kind),
        status: "open",
        created_at_utc: now,
        updated_at_utc: now
      });
      return acc;
    }, []);

    if (newItems.length === 0) {
      return NextResponse.json(
        { status: "invalid_request", error_code: "TASKS_EMPTY_AFTER_SANITIZE" },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json(
      { status: "invalid_request", error_code: "ACTION_NOT_SUPPORTED", allowed_actions: ["create_item", "create_plan"] },
      { status: 400 }
    );
  }

  const next = upsertQueueItems(base, newItems);
  const saved = await saveSnapshotPayload(config, {
    snapshotType: QUEUE_SNAPSHOT_TYPE,
    payload: next,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "execution-queue"
  });

  const filtered = next.rows.filter((row) => row.status !== "done");
  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: QUEUE_SNAPSHOT_TYPE,
      updated_at_utc: next.updated_at_utc,
      inserted: newItems.length,
      summary: summarizeQueue(filtered),
      rows: filtered.slice(0, 80),
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
