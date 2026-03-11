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
  type QueuePriority,
  type QueueState
} from "../../../../../core/execution-queue";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";

const BOARD_SNAPSHOT_TYPE = String(process.env.GOVHUB_MISSIONS_MANAGE_SNAPSHOT_TYPE || "gov_manager_mission_board_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();

function normalizeActor(value: unknown): string {
  return String(value || "").trim().toLowerCase().slice(0, 120);
}

function isAdmin(role: string): boolean {
  return String(role || "").trim().toLowerCase() === "admin";
}

function isPrincipalArchitect(actor: string): boolean {
  const normalized = normalizeActor(actor).replace(/[^a-z0-9]+/g, "");
  return normalized === "principalarchitect" || normalized === "parq";
}

function isTechLead(actor: string): boolean {
  const normalized = normalizeActor(actor).replace(/[^a-z0-9]+/g, "");
  return normalized === "cpp" || normalized === "staff" || normalized === "techlead" || normalized === "cpptechlead";
}

function isExecutor(actor: string): boolean {
  const normalized = normalizeActor(actor).replace(/[^a-z0-9]+/g, "");
  return normalized === "cppia" || normalized.startsWith("executor");
}

function canGroupMissions(role: string, actor: string): boolean {
  return isAdmin(role) || isPrincipalArchitect(actor) || isTechLead(actor);
}

function canAddExecution(role: string, actor: string): boolean {
  return isAdmin(role) || isPrincipalArchitect(actor) || isTechLead(actor);
}

function canStartAllNonPaused(role: string, actor: string): boolean {
  return isAdmin(role) || isPrincipalArchitect(actor) || isTechLead(actor);
}

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
      notes: trimText(row.notes, 4000),
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

function appendMatrixInheritanceNotes(current: string, block: string): string {
  const base = trimText(current, 3200);
  const nextBlock = trimText(block, 700);
  if (!nextBlock) return base;
  if (base.includes(nextBlock)) return trimText(base, 4000);
  const merged = [base, nextBlock].filter(Boolean).join("\n\n---\n");
  return trimText(merged, 4000);
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

function mergeBoardWithQueue(boardState: MissionBoardState, queueState: QueueState): ManagedMission[] {
  const queueByMission = new Map<string, QueueItem[]>();
  for (const row of queueState.rows) {
    const missionId = normalizeMissionId(row.mission_id);
    if (!missionId) continue;
    const current = queueByMission.get(missionId) || [];
    current.push(row);
    queueByMission.set(missionId, current);
  }

  const merged = new Map<string, ManagedMission>();

  for (const row of boardState.missions) {
    const missionId = normalizeMissionId(row.mission_id);
    if (!missionId) continue;
    merged.set(missionId, row);
  }

  for (const [missionId, queueRows] of queueByMission.entries()) {
    const preferred =
      queueRows.find((row) => row.status === "in_progress") ||
      queueRows.find((row) => row.status === "open") ||
      queueRows[0];
    if (!preferred) continue;
    const current = merged.get(missionId);
    merged.set(missionId, {
      mission_id: missionId,
      objective: trimText(current?.objective, 240) || trimText(preferred.title || preferred.description, 240),
      assignee: normalizeAssignee(current?.assignee || preferred.assignee),
      priority: normalizePriority(current?.priority || preferred.priority),
      status: trimText(current?.status, 40) || trimText(preferred.status, 40) || "in_progress",
      notes: trimText(current?.notes, 4000),
      updated_at_utc: trimText(current?.updated_at_utc, 64) || trimText(preferred.updated_at_utc, 64) || nowUtc(),
      updated_by: trimText(current?.updated_by, 120) || "queue-sync"
    });
  }

  return Array.from(merged.values()).sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)));
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

  const mergedMissions = mergeBoardWithQueue(boardState, queueState);

  return NextResponse.json(
    {
      status: "ok",
      board_snapshot_type: BOARD_SNAPSHOT_TYPE,
      queue_snapshot_type: QUEUE_SNAPSHOT_TYPE,
      updated_at_utc: boardState.updated_at_utc,
      packages: boardState.packages,
      missions: mergedMissions,
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
  const actorId = normalizeActor(auth.session.username);
  const now = nowUtc();
  const { boardState, queueState } = await loadBoardAndQueue(config);

  if (action === "group_missions") {
    if (!canGroupMissions(auth.session.role, actorId)) {
      return NextResponse.json(
        { status: "forbidden", error_code: "MISSIONS_ACTION_FORBIDDEN", message: "Perfil sem permissão para agrupar missões." },
        { status: 403 }
      );
    }
    const matrixMissionId = normalizeMissionId(data.matrix_mission_id ?? data.package_id);
    if (!matrixMissionId) {
      return NextResponse.json(
        { status: "invalid_request", error_code: "MATRIX_MISSION_ID_REQUIRED", message: "Missão matriz é obrigatória." },
        { status: 400 }
      );
    }
    const missionIdsRaw = Array.isArray(data.mission_ids) ? data.mission_ids : [];
    const groupedMissionIds = Array.from(
      new Set(
        missionIdsRaw
          .map((missionId) => normalizeMissionId(missionId))
          .filter((missionId) => missionId !== matrixMissionId)
          .filter(Boolean)
      )
    );
    if (groupedMissionIds.length === 0) {
      return NextResponse.json(
        { status: "invalid_request", error_code: "GROUPED_MISSION_IDS_REQUIRED", message: "Informe ao menos uma missão para herdar na matriz." },
        { status: 400 }
      );
    }
    const packageId = matrixMissionId;
    const packageMissionIds = [matrixMissionId, ...groupedMissionIds].slice(0, 100);

    const existing = boardState.packages.find((row) => row.package_id === packageId);
    const nextPackage: MissionPackage = {
      package_id: packageId,
      mission_ids: packageMissionIds,
      note: trimText(data.note, 1000),
      status: trimText(data.status, 16).toLowerCase() === "closed" ? "closed" : "active",
      created_by: existing?.created_by || actor,
      created_at_utc: existing?.created_at_utc || now,
      updated_at_utc: now
    };

    const inheritedRows = queueState.rows
      .filter((row) => groupedMissionIds.includes(normalizeMissionId(row.mission_id)))
      .map((row) => ({
        mission_id: normalizeMissionId(row.mission_id),
        title: trimText(row.title, 120),
        assignee: row.assignee,
        priority: row.priority,
        status: row.status
      }));
    const inheritedPartLines = inheritedRows.length
      ? inheritedRows
          .slice(0, 10)
          .map(
            (row) =>
              `- ${row.mission_id}: ${row.title || "parte sem título"} [${row.assignee}/${row.priority}/${row.status}]`
          )
      : ["- sem partes em fila detectadas nas missões herdadas."];
    const matrixBlock = [
      `[Matriz ${matrixMissionId}] Herdanças: ${groupedMissionIds.join(", ")}`,
      ...inheritedPartLines,
      trimText(data.note, 280) ? `Obs: ${trimText(data.note, 280)}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    const matrixCurrent =
      boardState.missions.find((row) => row.mission_id === matrixMissionId) ||
      ({
        mission_id: matrixMissionId,
        objective:
          trimText(
            queueState.rows.find((row) => normalizeMissionId(row.mission_id) === matrixMissionId)?.title,
            240
          ) || "Missão matriz",
        assignee: normalizeAssignee(
          queueState.rows.find((row) => normalizeMissionId(row.mission_id) === matrixMissionId)?.assignee
        ),
        priority: normalizePriority(
          queueState.rows.find((row) => normalizeMissionId(row.mission_id) === matrixMissionId)?.priority
        ),
        status:
          trimText(queueState.rows.find((row) => normalizeMissionId(row.mission_id) === matrixMissionId)?.status, 40) || "in_progress",
        notes: "",
        updated_at_utc: now,
        updated_by: actor
      } satisfies ManagedMission);

    const matrixUpdated: ManagedMission = {
      ...matrixCurrent,
      notes: appendMatrixInheritanceNotes(matrixCurrent.notes, matrixBlock),
      updated_at_utc: now,
      updated_by: actor
    };

    let nextBoard = upsertPackage(boardState, nextPackage);
    nextBoard = upsertMissionEntry(nextBoard, matrixUpdated);
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
      target: matrixMissionId,
      after_state: JSON.stringify({
        matrix_mission_id: matrixMissionId,
        grouped_mission_ids: groupedMissionIds,
        inherited_parts: inheritedRows.length,
        status: nextPackage.status
      }),
      correlation_id: `missions-group-${Date.now()}`,
      source: "missions-manage",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        action,
        matrix_mission_id: matrixMissionId,
        grouped_mission_ids: groupedMissionIds,
        inherited_parts: inheritedRows.length,
        package: nextPackage,
        matrix_mission: matrixUpdated,
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

    const missionEditable = queueState.rows.some((row) => {
      const sameMission = normalizeMissionId(row.mission_id) === missionId;
      if (!sameMission) return false;
      return row.status === "open" || row.status === "paused_waiting_owner" || row.status === "in_progress" || row.status === "done";
    });
    if (!missionEditable) {
      return NextResponse.json(
        { status: "conflict", error_code: "MISSION_NOT_EDITABLE", message: "Missão só pode ser editada em A Fazer, pausada, em progresso ou concluída." },
        { status: 409 }
      );
    }

    const current = boardState.missions.find((row) => row.mission_id === missionId);
    const canEdit = isAdmin(auth.session.role) || isPrincipalArchitect(actorId) || isTechLead(actorId) || isExecutor(actorId);
    if (!canEdit) {
      return NextResponse.json(
        { status: "forbidden", error_code: "MISSIONS_ACTION_FORBIDDEN", message: "Perfil sem permissão para editar missão." },
        { status: 403 }
      );
    }
    if (isExecutor(actorId)) {
      if (!current) {
        return NextResponse.json(
          { status: "forbidden", error_code: "MISSIONS_ACTION_FORBIDDEN", message: "Executor só pode complementar notas em missão existente." },
          { status: 403 }
        );
      }
      const requestedObjective = trimText(data.objective, 240);
      const requestedAssignee = normalizeAssignee(data.assignee ?? current.assignee);
      const requestedPriority = normalizePriority(data.priority ?? current.priority);
      const requestedStatus = trimText(data.status, 40) || current.status;
      if (
        (requestedObjective && requestedObjective !== current.objective) ||
        requestedAssignee !== current.assignee ||
        requestedPriority !== current.priority ||
        requestedStatus !== current.status
      ) {
        return NextResponse.json(
          {
            status: "forbidden",
            error_code: "MISSIONS_EXECUTOR_EDIT_RESTRICTED",
            message: "Executor pode apenas registrar notas técnicas."
          },
          { status: 403 }
        );
      }
    }

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

    const missionQueueRows = queueState.rows.filter((row) => normalizeMissionId(row.mission_id) === missionId);
    const hasActiveQueueRows = missionQueueRows.some((row) => row.status === "in_progress" || row.status === "open");
    if (hasActiveQueueRows) {
      const assigneeChangedInQueue = missionQueueRows.some((row) => row.status !== "done" && row.assignee !== nextMission.assignee);
      if (assigneeChangedInQueue) {
        const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
        const agentState = agentsLoaded.found && agentsLoaded.payload
          ? sanitizeAgentRegistryState(agentsLoaded.payload)
          : defaultAgentRegistryState();
        if (!hasHealthyAssigneeAgent(agentState, nextMission.assignee)) {
          return NextResponse.json(
            {
              status: "conflict",
              error_code: "ASSIGNEE_NOT_HEALTHY",
              message: `Nenhum worker saudável para ${nextMission.assignee}.`
            },
            { status: 409 }
          );
        }
      }
    }

    const nextBoard = upsertMissionEntry(boardState, nextMission);
    const nextQueueRows = queueState.rows.map((row) => {
      if (normalizeMissionId(row.mission_id) !== missionId) return row;
      if (row.status === "done") return row;

      const assigneeChanged = row.assignee !== nextMission.assignee;
      if (row.status === "in_progress" && assigneeChanged) {
        const {
          assignee_agent_id: _dropAssigneeAgentId,
          last_start_ack_at_utc: _dropLastStartAckAtUtc,
          last_start_ack_http: _dropLastStartAckHttp,
          ...rowWithoutRuntimeStart
        } = row;
        return {
          ...rowWithoutRuntimeStart,
          assignee: nextMission.assignee,
          priority: nextMission.priority,
          status: "open",
          last_transition_reason_code: "MISSION_EDIT_REQUEUE",
          last_transition_reason_message: `Item reaberto por troca de executor durante in_progress (${actor}).`,
          last_transition_source: "missions-manage",
          last_transition_actor: actor,
          last_transition_at_utc: now,
          last_start_error_code: "MISSION_EDIT_REQUEUE",
          last_start_error_message: "Troca de executor exige novo start com ACK obrigatório.",
          updated_at_utc: now
        };
      }

      if (row.status === "in_progress") {
        return {
          ...row,
          assignee: nextMission.assignee,
          priority: nextMission.priority,
          last_transition_reason_code: "MISSION_EDIT_SYNC",
          last_transition_reason_message: `Fila sincronizada por edição de missão (${actor}).`,
          last_transition_source: "missions-manage",
          last_transition_actor: actor,
          last_transition_at_utc: now,
          updated_at_utc: now
        };
      }

      const { assignee_agent_id: _dropAssigneeAgentId, ...rowWithoutAssigneeAgent } = row;
      return {
        ...rowWithoutAssigneeAgent,
        assignee: nextMission.assignee,
        priority: nextMission.priority,
        last_transition_reason_code: "MISSION_EDIT_SYNC",
        last_transition_reason_message: `Fila sincronizada por edição de missão (${actor}).`,
        last_transition_source: "missions-manage",
        last_transition_actor: actor,
        last_transition_at_utc: now,
        updated_at_utc: now
      };
    });
    const nextQueue = sanitizeQueueState({
      ...queueState,
      updated_at_utc: now,
      rows: nextQueueRows
    });
    const saved = await saveSnapshotPayload(config, {
      snapshotType: BOARD_SNAPSHOT_TYPE,
      payload: nextBoard,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "missions-manage-edit"
    });
    const queueSaved = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: nextQueue,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "missions-manage-edit-queue-sync"
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
        status: saved.ok && queueSaved.ok ? "ok" : "upstream_error",
        action,
        mission: nextMission,
        queue_sync: {
          status: queueSaved.ok ? "ok" : "upstream_error",
          govhub_http: queueSaved.status,
          payload_sha256: queueSaved.payload_sha256
        },
        govhub_http: saved.status,
        payload_sha256: saved.payload_sha256
      },
      { status: saved.ok && queueSaved.ok ? 200 : 502 }
    );
  }

  if (action === "add_execution") {
    if (!canAddExecution(auth.session.role, actorId)) {
      return NextResponse.json(
        { status: "forbidden", error_code: "MISSIONS_ACTION_FORBIDDEN", message: "Perfil sem permissão para adicionar execução." },
        { status: 403 }
      );
    }
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
    if (!canStartAllNonPaused(auth.session.role, actorId)) {
      return NextResponse.json(
        { status: "forbidden", error_code: "MISSIONS_ACTION_FORBIDDEN", message: "Perfil sem permissão para iniciar itens em lote." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      {
        status: "conflict",
        action,
        error_code: "START_ACK_REQUIRED",
        message: "Início em lote via missions/manage foi bloqueado para garantir ACK obrigatório. Use operations/queue item a item."
      },
      { status: 409 }
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
