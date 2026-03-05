import { NextResponse } from "next/server";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { defaultAgentRegistryState, hasHealthyAssigneeAgent, sanitizeAgentRegistryState } from "../../../../../core/agent-registry";
import {
  createQueueId,
  defaultQueueState,
  sanitizeQueueState,
  summarizeQueue,
  upsertQueueItems,
  type QueueAssignee,
  type QueueItem,
  type QueuePriority
} from "../../../../../core/execution-queue";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";

const BOARD_SNAPSHOT_TYPE = String(process.env.GOVHUB_MISSIONS_MANAGE_SNAPSHOT_TYPE || "gov_manager_mission_board_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();

interface MissionPackage {
  package_id: string;
  mission_ids: string[];
  note: string;
  status: "active" | "closed";
  created_by: string;
  created_at_utc: string;
  updated_at_utc: string;
}

interface ManagedMission {
  mission_id: string;
  objective: string;
  assignee: QueueAssignee;
  priority: QueuePriority;
  status: string;
  notes: string;
  updated_at_utc: string;
  updated_by: string;
}

interface MissionBoardState {
  version: "1.0";
  updated_at_utc: string;
  packages: MissionPackage[];
  missions: ManagedMission[];
}

function nowUtc(): string {
  return new Date().toISOString();
}

function trimText(value: unknown, max = 200): string {
  return String(value || "").trim().slice(0, max);
}

function normalizeMissionId(value: unknown): string {
  return trimText(value, 120).toUpperCase();
}

function normalizePriority(value: unknown): QueuePriority {
  const clean = trimText(value, 8).toUpperCase();
  if (clean === "P0" || clean === "P1" || clean === "P2" || clean === "P3") return clean;
  return "P2";
}

function normalizeAssignee(value: unknown): QueueAssignee {
  const clean = trimText(value, 16).toUpperCase();
  if (clean === "CPP" || clean === "CPP-IA" || clean === "STAFF") return clean;
  return "STAFF";
}

function defaultBoardState(): MissionBoardState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    packages: [],
    missions: []
  };
}

function sanitizeMissionBoardState(input: unknown): MissionBoardState {
  if (!input || typeof input !== "object") return defaultBoardState();
  const obj = input as Record<string, unknown>;
  const packagesRaw = Array.isArray(obj.packages) ? obj.packages : [];
  const missionsRaw = Array.isArray(obj.missions) ? obj.missions : [];

  const packages: MissionPackage[] = packagesRaw.reduce<MissionPackage[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const row = item as Record<string, unknown>;
    const packageId = trimText(row.package_id, 120);
    if (!packageId) return acc;
    const missionIdsRaw = Array.isArray(row.mission_ids) ? row.mission_ids : [];
    const missionIds = Array.from(
      new Set(
        missionIdsRaw
          .map((missionId) => normalizeMissionId(missionId))
          .filter(Boolean)
      )
    ).slice(0, 100);
    if (missionIds.length === 0) return acc;

    const statusRaw = trimText(row.status, 16).toLowerCase();
    const status = statusRaw === "closed" ? "closed" : "active";
    acc.push({
      package_id: packageId,
      mission_ids: missionIds,
      note: trimText(row.note, 500),
      status,
      created_by: trimText(row.created_by, 120) || "staff@gov-manager",
      created_at_utc: trimText(row.created_at_utc, 64) || nowUtc(),
      updated_at_utc: trimText(row.updated_at_utc, 64) || nowUtc()
    });
    return acc;
  }, []);

  const missions: ManagedMission[] = missionsRaw.reduce<ManagedMission[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const row = item as Record<string, unknown>;
    const missionId = normalizeMissionId(row.mission_id);
    if (!missionId) return acc;
    acc.push({
      mission_id: missionId,
      objective: trimText(row.objective, 240),
      assignee: normalizeAssignee(row.assignee),
      priority: normalizePriority(row.priority),
      status: trimText(row.status, 40) || "in_progress",
      notes: trimText(row.notes, 500),
      updated_at_utc: trimText(row.updated_at_utc, 64) || nowUtc(),
      updated_by: trimText(row.updated_by, 120) || "staff@gov-manager"
    });
    return acc;
  }, []);

  return {
    version: "1.0",
    updated_at_utc: trimText(obj.updated_at_utc, 64) || nowUtc(),
    packages: packages.sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc))).slice(0, 300),
    missions: missions.sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc))).slice(0, 600)
  };
}

function upsertMissionEntry(state: MissionBoardState, entry: ManagedMission): MissionBoardState {
  const map = new Map(state.missions.map((item) => [item.mission_id, item] as const));
  map.set(entry.mission_id, entry);
  return {
    ...state,
    updated_at_utc: nowUtc(),
    missions: Array.from(map.values()).sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
  };
}

function upsertPackage(state: MissionBoardState, entry: MissionPackage): MissionBoardState {
  const map = new Map(state.packages.map((item) => [item.package_id, item] as const));
  map.set(entry.package_id, entry);
  return {
    ...state,
    updated_at_utc: nowUtc(),
    packages: Array.from(map.values()).sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
  };
}

async function loadBoardAndQueue(config: ReturnType<typeof resolveGovhubSnapshotConfig>) {
  const [boardLoaded, queueLoaded] = await Promise.all([
    loadSnapshotPayload(config, BOARD_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE)
  ]);

  const boardState =
    boardLoaded.found && boardLoaded.payload ? sanitizeMissionBoardState(boardLoaded.payload) : defaultBoardState();
  const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();

  return { boardLoaded, queueLoaded, boardState, queueState };
}

export async function GET(request: Request) {
  const auth = requireRole(request, "viewer");
  if (!auth.ok) {
    return NextResponse.json({ status: "unauthorized", error_code: auth.error_code }, { status: auth.status });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const { boardLoaded, boardState, queueState } = await loadBoardAndQueue(config);
  const inProgressMissionIds = Array.from(
    new Set(
      queueState.rows
        .filter((row) => row.status === "in_progress")
        .map((row) => normalizeMissionId(row.mission_id))
        .filter(Boolean)
    )
  );
  const knownMissionIds = Array.from(
    new Set(queueState.rows.map((row) => normalizeMissionId(row.mission_id)).filter(Boolean))
  );

  return NextResponse.json(
    {
      status: "ok",
      board_snapshot_type: BOARD_SNAPSHOT_TYPE,
      queue_snapshot_type: QUEUE_SNAPSHOT_TYPE,
      updated_at_utc: boardState.updated_at_utc,
      packages: boardState.packages,
      missions: boardState.missions,
      queue: {
        summary: summarizeQueue(queueState.rows),
        in_progress_mission_ids: inProgressMissionIds,
        known_mission_ids: knownMissionIds
      },
      payload_sha256: boardLoaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const auth = requireRole(request, "engineer");
  if (!auth.ok) {
    return NextResponse.json({ status: "forbidden", error_code: auth.error_code }, { status: auth.status });
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
  const action = trimText(data.action, 40).toLowerCase();
  const actor = auth.session.username;
  const now = nowUtc();
  const { boardState, queueState } = await loadBoardAndQueue(config);

  if (action === "group_missions") {
    const packageId = trimText(data.package_id, 120) || `PACOTE-${Date.now()}`;
    const missionIdsRaw = Array.isArray(data.mission_ids) ? data.mission_ids : [];
    const missionIds = Array.from(
      new Set(
        missionIdsRaw
          .map((missionId) => normalizeMissionId(missionId))
          .filter(Boolean)
      )
    );
    if (missionIds.length === 0) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_IDS_REQUIRED" }, { status: 400 });
    }

    const existing = boardState.packages.find((row) => row.package_id === packageId);
    const nextPackage: MissionPackage = {
      package_id: packageId,
      mission_ids: missionIds.slice(0, 100),
      note: trimText(data.note, 500),
      status: trimText(data.status, 16).toLowerCase() === "closed" ? "closed" : "active",
      created_by: existing?.created_by || actor,
      created_at_utc: existing?.created_at_utc || now,
      updated_at_utc: now
    };

    const nextBoard = upsertPackage(boardState, nextPackage);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: BOARD_SNAPSHOT_TYPE,
      payload: nextBoard,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "missions-manage-group"
    });

    await recordAuditEvent(config, {
      actor: auth.session.username,
      role: auth.session.role,
      action: "missions.group_missions",
      target: packageId,
      after_state: JSON.stringify({ mission_ids: missionIds, status: nextPackage.status }),
      correlation_id: `missions-group-${Date.now()}`,
      source: "missions-manage",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        action,
        package: nextPackage,
        govhub_http: saved.status,
        payload_sha256: saved.payload_sha256
      },
      { status: saved.ok ? 200 : 502 }
    );
  }

  if (action === "edit_mission") {
    const missionId = normalizeMissionId(data.mission_id);
    if (!missionId) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_REQUIRED" }, { status: 400 });
    }

    const missionInProgress = queueState.rows.some((row) => normalizeMissionId(row.mission_id) === missionId && row.status === "in_progress");
    if (!missionInProgress) {
      return NextResponse.json(
        { status: "conflict", error_code: "MISSION_NOT_IN_PROGRESS", message: "Missão só pode ser editada em progresso." },
        { status: 409 }
      );
    }

    const current = boardState.missions.find((row) => row.mission_id === missionId);
    const nextMission: ManagedMission = {
      mission_id: missionId,
      objective: trimText(data.objective, 240) || current?.objective || "",
      assignee: normalizeAssignee(data.assignee ?? current?.assignee),
      priority: normalizePriority(data.priority ?? current?.priority),
      status: trimText(data.status, 40) || current?.status || "in_progress",
      notes: trimText(data.notes, 500) || current?.notes || "",
      updated_at_utc: now,
      updated_by: actor
    };

    const nextBoard = upsertMissionEntry(boardState, nextMission);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: BOARD_SNAPSHOT_TYPE,
      payload: nextBoard,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "missions-manage-edit"
    });

    await recordAuditEvent(config, {
      actor: auth.session.username,
      role: auth.session.role,
      action: "missions.edit_mission",
      target: missionId,
      before_state: current ? JSON.stringify({ status: current.status, assignee: current.assignee, priority: current.priority }) : "",
      after_state: JSON.stringify({ status: nextMission.status, assignee: nextMission.assignee, priority: nextMission.priority }),
      correlation_id: `missions-edit-${Date.now()}`,
      source: "missions-manage",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        action,
        mission: nextMission,
        govhub_http: saved.status,
        payload_sha256: saved.payload_sha256
      },
      { status: saved.ok ? 200 : 502 }
    );
  }

  if (action === "add_execution") {
    const missionId = normalizeMissionId(data.mission_id);
    const title = trimText(data.title, 180);
    if (!missionId || !title) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_AND_TITLE_REQUIRED" }, { status: 400 });
    }

    const missionInProgress = queueState.rows.some((row) => normalizeMissionId(row.mission_id) === missionId && row.status === "in_progress");
    if (!missionInProgress) {
      return NextResponse.json(
        { status: "conflict", error_code: "MISSION_NOT_IN_PROGRESS", message: "Adição de execução exige missão em progresso." },
        { status: 409 }
      );
    }

    const item: QueueItem = {
      queue_id: createQueueId(missionId, title),
      mission_id: missionId,
      title,
      description: trimText(data.description, 800),
      kind: trimText(data.kind, 60) || "general",
      priority: normalizePriority(data.priority),
      assignee: normalizeAssignee(data.assignee),
      status: "open",
      created_at_utc: now,
      updated_at_utc: now
    };

    const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
    const agentState = agentsLoaded.found && agentsLoaded.payload
      ? sanitizeAgentRegistryState(agentsLoaded.payload)
      : defaultAgentRegistryState();
    if (!hasHealthyAssigneeAgent(agentState, item.assignee)) {
      return NextResponse.json(
        {
          status: "conflict",
          error_code: "ASSIGNEE_NOT_HEALTHY",
          message: `Nenhum worker saudável para ${item.assignee}.`
        },
        { status: 409 }
      );
    }

    const nextQueue = upsertQueueItems(queueState, [item]);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: nextQueue,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "missions-manage-add-exec"
    });

    await recordAuditEvent(config, {
      actor: auth.session.username,
      role: auth.session.role,
      action: "missions.add_execution",
      target: item.queue_id,
      after_state: JSON.stringify({ mission_id: missionId, assignee: item.assignee, priority: item.priority }),
      correlation_id: `missions-add-exec-${Date.now()}`,
      source: "missions-manage",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        action,
        inserted: 1,
        row: item,
        summary: summarizeQueue(nextQueue.rows.filter((row) => row.status !== "done")),
        govhub_http: saved.status,
        payload_sha256: saved.payload_sha256
      },
      { status: saved.ok ? 200 : 502 }
    );
  }

  if (action === "start_all_non_paused") {
    const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
    const agentState = agentsLoaded.found && agentsLoaded.payload
      ? sanitizeAgentRegistryState(agentsLoaded.payload)
      : defaultAgentRegistryState();

    const changed = queueState.rows.reduce<QueueItem[]>((acc, row) => {
      if (row.status !== "open") return acc;
      if (!hasHealthyAssigneeAgent(agentState, row.assignee)) return acc;
      acc.push({ ...row, status: "in_progress", updated_at_utc: now });
      return acc;
    }, []);
    const skippedUnhealthy = queueState.rows.filter(
      (row) => row.status === "open" && !hasHealthyAssigneeAgent(agentState, row.assignee)
    ).length;

    if (changed.length === 0) {
      return NextResponse.json(
        {
          status: "ok",
          action,
          changed: 0,
          skipped_unhealthy: skippedUnhealthy,
          summary: summarizeQueue(queueState.rows.filter((row) => row.status !== "done")),
          message: "Nenhum item elegível para iniciar."
        },
        { status: 200 }
      );
    }

    const nextQueue = upsertQueueItems(queueState, changed);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: nextQueue,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "missions-manage-start-bulk"
    });

    await recordAuditEvent(config, {
      actor: auth.session.username,
      role: auth.session.role,
      action: "missions.start_all_non_paused",
      target: "execution-queue",
      after_state: JSON.stringify({ changed: changed.length, skipped_unhealthy: skippedUnhealthy }),
      correlation_id: `missions-start-bulk-${Date.now()}`,
      source: "missions-manage",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        action,
        changed: changed.length,
        skipped_unhealthy: skippedUnhealthy,
        summary: summarizeQueue(nextQueue.rows.filter((row) => row.status !== "done")),
        govhub_http: saved.status,
        payload_sha256: saved.payload_sha256
      },
      { status: saved.ok ? 200 : 502 }
    );
  }

  return NextResponse.json(
    {
      status: "invalid_request",
      error_code: "ACTION_NOT_SUPPORTED",
      allowed_actions: ["group_missions", "edit_mission", "add_execution", "start_all_non_paused"]
    },
    { status: 400 }
  );
}
