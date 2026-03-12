import { NextResponse } from "next/server";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import {
  defaultAgentRegistryState,
  deriveAgentState,
  hasHealthyAssigneeAgent,
  sanitizeAgentRegistryState,
  upsertAgentRow,
  type AgentRegistryState,
  type AgentRow
} from "../../../../../core/agent-registry";
import {
  createQueueId,
  decideAssignee,
  defaultQueueState,
  sanitizeQueueState,
  summarizeQueue,
  upsertQueueItems,
  type QueueAssignee,
  type QueueItem,
  type QueuePriority,
  type QueueState,
  type QueueStatus
} from "../../../../../core/execution-queue";
import {
  appendExecutionEvent,
  createEventId,
  createRunId,
  createTraceId,
  defaultExecutionSessionsState,
  resolveClaimableSession,
  sanitizeExecutionSessionsState,
  upsertExecutionSession
} from "../../../../../core/execution-sessions";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";
import { requestQueueStartAck } from "../../../../../core/queue-start-ack";
import { recomputeAndPersistOfficePresence } from "../../../../../core/office-presence";
import { defaultMissionBoardState, sanitizeMissionBoardState, syncMissionBoardRelayStatus } from "../../../../../core/mission-board-relay";
import { validateQueueTransition } from "../../../../../core/transition-validator";
import { createAlertId, defaultAlertState, sanitizeAlertState, upsertAlerts } from "../../../../../core/alerts";

const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();
const BOARD_SNAPSHOT_TYPE = String(process.env.GOVHUB_MISSIONS_MANAGE_SNAPSHOT_TYPE || "gov_manager_mission_board_v1").trim();
const SESSIONS_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_SESSIONS_SNAPSHOT_TYPE || "gov_manager_execution_sessions_v1").trim();
const ALERTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_ALERTS_SNAPSHOT_TYPE || "gov_manager_alerts_v1").trim();
const PREFERRED_EXECUTION_AGENT_BY_ASSIGNEE: Partial<Record<QueueAssignee, string>> = {
  CPP: "gov-codex-01"
};

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

function clampProgress(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.trunc(raw)));
}

function nowUtc(): string {
  return new Date().toISOString();
}

function isPriority(value: unknown): value is QueuePriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3";
}

function isStatus(value: unknown): value is QueueStatus {
  return value === "staff_validation_gate" || value === "open" || value === "in_progress" || value === "done" || value === "paused_waiting_owner";
}

function normalizePriority(value: unknown): QueuePriority {
  return isPriority(value) ? value : "P2";
}

function normalizeAssignee(value: unknown): QueueAssignee {
  const candidate = clampText(value, 24).toUpperCase();
  if (candidate === "CPP" || candidate === "CPP-IA" || candidate === "STAFF") return candidate;
  return "STAFF";
}

function normalizeStatus(value: unknown): QueueStatus | null {
  const candidate = clampText(value, 40).toLowerCase();
  if (isStatus(candidate)) return candidate;
  return null;
}

function loadAgentStatePayload(payload: unknown): AgentRegistryState {
  return payload ? sanitizeAgentRegistryState(payload) : defaultAgentRegistryState();
}

function resolveHealthyAgent(agentState: AgentRegistryState, assignee: QueueAssignee): AgentRow | null {
  if (assignee === "STAFF") return null;
  const candidates = agentState.rows.filter((row) => {
    const role = String(row.role || "").trim().toUpperCase();
    return role === assignee && (row.state === "idle" || row.state === "running") && row.health !== "down";
  });
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const loadDiff = Number(a.current_load || 0) - Number(b.current_load || 0);
    if (loadDiff !== 0) return loadDiff;
    return String(b.updated_at_utc || "").localeCompare(String(a.updated_at_utc || ""));
  })[0] || null;
}

function bumpAgentLoad(agentState: AgentRegistryState, agent: AgentRow, now: string): AgentRegistryState {
  const nextLoad = Math.max(0, Number(agent.current_load || 0) + 1);
  return upsertAgentRow(agentState, {
    ...agent,
    current_load: nextLoad,
    last_job_at_utc: now,
    last_heartbeat_at_utc: now,
    updated_at_utc: now,
    state: deriveAgentState({
      health: agent.health,
      current_load: nextLoad,
      last_heartbeat_at_utc: now
    }, Date.parse(now))
  });
}

function releaseAgentLoad(agentState: AgentRegistryState, row: QueueItem, now: string): AgentRegistryState {
  const assignee = normalizeAssignee(row.assignee);
  if (assignee === "STAFF") return agentState;
  const agentId = clampText(row.assignee_agent_id, 80).toLowerCase();
  const candidate = agentState.rows.find((item) => {
    const role = String(item.role || "").trim().toUpperCase();
    if (role !== assignee) return false;
    if (agentId && String(item.agent_id || "").trim().toLowerCase() !== agentId) return false;
    return true;
  });
  if (!candidate) return agentState;
  const nextLoad = Math.max(0, Number(candidate.current_load || 0) - 1);
  return upsertAgentRow(agentState, {
    ...candidate,
    current_load: nextLoad,
    last_job_at_utc: now,
    last_heartbeat_at_utc: now,
    updated_at_utc: now,
    state: deriveAgentState({
      health: candidate.health,
      current_load: nextLoad,
      last_heartbeat_at_utc: now
    }, Date.parse(now))
  });
}

function updateQueueRows(state: QueueState, transform: (row: QueueItem) => QueueItem | null): QueueState {
  return sanitizeQueueState({
    ...state,
    updated_at_utc: nowUtc(),
    rows: state.rows.map(transform).filter((row): row is QueueItem => Boolean(row))
  });
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

  const loaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeQueueState(loaded.payload) : defaultQueueState();
  const url = new URL(request.url);
  const statusFilter = normalizeStatus(url.searchParams.get("status"));
  const assigneeFilter = clampText(url.searchParams.get("assignee"), 24).toUpperCase();
  const missionFilter = clampText(url.searchParams.get("mission_id"), 120).toUpperCase();

  const rows = state.rows.filter((row) => {
    if (statusFilter && row.status !== statusFilter) return false;
    if (assigneeFilter && row.assignee !== assigneeFilter) return false;
    if (missionFilter && String(row.mission_id || "").trim().toUpperCase() !== missionFilter) return false;
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
  const action = clampText(data.action, 40) || "create_plan";
  const actor = auth.session.username;
  const actorRole = auth.session.role;
  const now = nowUtc();

  const loaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
  const base = loaded.found && loaded.payload ? sanitizeQueueState(loaded.payload) : defaultQueueState();

  const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
  let agentState = loadAgentStatePayload(agentsLoaded.found ? agentsLoaded.payload : null);

  if (action === "create_item") {
    const missionId = clampText(data.mission_id, 120).toUpperCase();
    const title = clampText(data.title, 180);
    if (!missionId || !title) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_AND_TITLE_REQUIRED" }, { status: 400 });
    }
    const kind = clampText(data.kind, 60) || "general";
    const priority = normalizePriority(data.priority);
    const assignee = normalizeAssignee(data.assignee || decideAssignee(kind));
    const status = assignee === "STAFF" ? "open" : "staff_validation_gate";
    const item: QueueItem = {
      queue_id: createQueueId(missionId, title),
      mission_id: missionId,
      title,
      description: clampText(data.description, 800),
      kind,
      priority,
      assignee,
      status,
      execution_progress_pct: 0,
      created_at_utc: now,
      updated_at_utc: now
    };
    const next = upsertQueueItems(base, [item]);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: next,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "execution-queue-create-item"
    });
    return NextResponse.json({
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: QUEUE_SNAPSHOT_TYPE,
      updated_at_utc: next.updated_at_utc,
      inserted: 1,
      ...(status === "staff_validation_gate"
        ? { gate_required: true, gate_reason_code: "STAFF_VALIDATION_GATE_REQUIRED" }
        : {}),
      summary: summarizeQueue(next.rows),
      rows: next.rows.slice(0, 80),
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    }, { status: saved.ok ? 200 : 502 });
  }

  if (action === "create_plan") {
    const missionId = clampText(data.mission_id, 120).toUpperCase();
    if (!missionId) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_REQUIRED" }, { status: 400 });
    }
    const tasksRaw = Array.isArray(data.tasks) ? data.tasks : [];
    if (tasksRaw.length === 0) {
      return NextResponse.json({ status: "invalid_request", error_code: "TASKS_REQUIRED" }, { status: 400 });
    }
    const items = tasksRaw.reduce<QueueItem[]>((acc, task, idx) => {
      if (!task || typeof task !== "object") return acc;
      const row = task as Record<string, unknown>;
      const title = clampText(row.title || row.goal, 180);
      if (!title) return acc;
      const kind = clampText(row.kind || row.executor, 60) || "general";
      const priority = normalizePriority(row.priority);
      const assignee = normalizeAssignee(row.assignee || decideAssignee(kind));
      const status = assignee === "STAFF" ? "open" : "staff_validation_gate";
      acc.push({
        queue_id: createQueueId(missionId, title, idx + 1),
        mission_id: missionId,
        title,
        description: clampText(row.description || row.goal, 800),
        kind,
        priority,
        assignee,
        status,
        execution_progress_pct: 0,
        created_at_utc: now,
        updated_at_utc: now
      });
      return acc;
    }, []);
    if (items.length === 0) {
      return NextResponse.json({ status: "invalid_request", error_code: "TASKS_EMPTY_AFTER_SANITIZE" }, { status: 400 });
    }
    const next = upsertQueueItems(base, items);
    const saved = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: next,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "execution-queue-create-plan"
    });
    return NextResponse.json({
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: QUEUE_SNAPSHOT_TYPE,
      updated_at_utc: next.updated_at_utc,
      inserted: items.length,
      summary: summarizeQueue(next.rows),
      rows: next.rows.slice(0, 80),
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    }, { status: saved.ok ? 200 : 502 });
  }

  if (action === "remove_item") {
    const queueId = clampText(data.queue_id, 160);
    if (!queueId) {
      return NextResponse.json({ status: "invalid_request", error_code: "QUEUE_ID_REQUIRED" }, { status: 400 });
    }
    const removed = base.rows.filter((row) => row.queue_id === queueId).length;
    const next = sanitizeQueueState({ ...base, updated_at_utc: now, rows: base.rows.filter((row) => row.queue_id !== queueId) });
    const saved = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: next,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "execution-queue-remove-item"
    });
    await recomputeAndPersistOfficePresence(config, { actor, sourceRef: "queue-remove", queueState: next });
    return NextResponse.json({
      status: saved.ok ? "ok" : "upstream_error",
      removed,
      summary: summarizeQueue(next.rows),
      rows: next.rows.slice(0, 80),
      govhub_http: saved.status,
      payload_sha256: saved.payload_sha256
    }, { status: saved.ok ? 200 : 502 });
  }

  if (action === "clear_done") {
    const removed = base.rows.filter((row) => row.status === "done").length;
    const next = sanitizeQueueState({ ...base, updated_at_utc: now, rows: base.rows.filter((row) => row.status !== "done") });
    const saved = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: next,
      createdBy: actor,
      sourceRepo: "gov-manager",
      sourceRef: "execution-queue-clear-done"
    });
    await recomputeAndPersistOfficePresence(config, { actor, sourceRef: "queue-clear-done", queueState: next });
    return NextResponse.json({
      status: saved.ok ? "ok" : "upstream_error",
      removed,
      summary: summarizeQueue(next.rows),
      rows: next.rows.slice(0, 80),
      govhub_http: saved.status,
      payload_sha256: saved.payload_sha256
    }, { status: saved.ok ? 200 : 502 });
  }

  if (action !== "update_status") {
    return NextResponse.json(
      { status: "invalid_request", error_code: "ACTION_NOT_SUPPORTED", allowed_actions: ["create_item", "create_plan", "update_status", "remove_item", "clear_done"] },
      { status: 400 }
    );
  }

  const queueId = clampText(data.queue_id, 160);
  let nextStatus = normalizeStatus(data.status);
  if (!queueId || !nextStatus) {
    return NextResponse.json({ status: "invalid_request", error_code: "QUEUE_ID_AND_VALID_STATUS_REQUIRED" }, { status: 400 });
  }

  const current = base.rows.find((row) => row.queue_id === queueId);
  if (!current) {
    return NextResponse.json({ status: "not_found", error_code: "QUEUE_ITEM_NOT_FOUND" }, { status: 404 });
  }

  const etaDeltaMin = clampInt(data.eta_delta_min, 0, -30, 60);
  const etaDeltaAllowed = etaDeltaMin !== 0 && Math.abs(etaDeltaMin) % 5 === 0;
  const etaReason = clampText(data.eta_reason, 180);
  const completionNoteInput = clampText(data.completion_note, 1400);
  const progressPctInput = clampProgress(data.execution_progress_pct);
  const completionProof = clampText(data.completion_proof, 600);
  const deliverySummary = clampText(data.delivery_summary, 600);
  const validationSummary = clampText(data.validation_summary, 600);
  const doneRequestId = clampText(data.request_id ?? data.correlation_id, 180);

  let nextRow: QueueItem = { ...current };
  let nextQueue = base;
  let boardStatus: number | null = null;
  let agentsStatus: number | null = null;
  let sessionsStatus: number | null = null;
  let handledStaffValidationDecision = false;

  const validationDecision = clampText(data.validation_decision, 40).toLowerCase();
  if ((current.status === "staff_validation_gate") && (nextStatus === "open" || nextStatus === "in_progress")) {
    if (!validationDecision) {
      // Canonical default: Gate Staff auto-binds to CPP when no explicit decision is provided.
      const autoAssignee = normalizeAssignee(data.assignee || current.assignee || "CPP");
      const requestedAssignee = autoAssignee === "STAFF" ? "CPP" : autoAssignee;
      if (!hasHealthyAssigneeAgent(agentState, requestedAssignee)) {
        const alertsLoaded = await loadSnapshotPayload(config, ALERTS_SNAPSHOT_TYPE);
        const alertsState = alertsLoaded.found && alertsLoaded.payload ? sanitizeAlertState(alertsLoaded.payload) : defaultAlertState();
        const existing = alertsState.rows.find((row) => {
          return (
            (row.status === "open" || row.status === "ack") &&
            String(row.type || "") === "governance" &&
            String(row.queue_id || "") === current.queue_id &&
            String(row.mission_id || "") === current.mission_id &&
            String(row.message || "").includes("STAFF_VALIDATION_DECISION_REQUIRED")
          );
        });
        if (!existing) {
          const nextAlerts = upsertAlerts(alertsState, [
            {
              alert_id: createAlertId("GOV"),
              type: "governance",
              severity: "critical",
              mission_id: current.mission_id,
              queue_id: current.queue_id,
              message: `STAFF_VALIDATION_DECISION_REQUIRED: auto bind_cpp indisponível sem executor saudável para ${requestedAssignee}.`,
              status: "open",
              source: "operations-queue",
              created_at_utc: now,
              updated_at_utc: now
            }
          ]);
          await saveSnapshotPayload(config, {
            snapshotType: ALERTS_SNAPSHOT_TYPE,
            payload: nextAlerts,
            createdBy: actor,
            sourceRepo: "gov-manager",
            sourceRef: "queue-staff-validation-alert"
          });
        }
        return NextResponse.json(
          {
            status: "conflict",
            error_code: "STAFF_VALIDATION_DECISION_REQUIRED",
            message: "Gate de validação automática falhou. Use decision explícita: bind_cpp | reassign_cpp | staff_fallback."
          },
          { status: 409 }
        );
      }
      nextRow = {
        ...current,
        assignee: requestedAssignee,
        status: "open",
        last_transition_reason_code: "STAFF_VALIDATION_BIND_CPP_AUTO",
        last_transition_reason_message: `Gate validado automaticamente e pronto para esteira A Fazer (${actor}).`,
        last_transition_source: "operations-queue",
        last_transition_actor: actor,
        last_transition_at_utc: now,
        updated_at_utc: now
      };
      nextStatus = "open";
      handledStaffValidationDecision = true;
    }
    if (!handledStaffValidationDecision) {
      if (validationDecision === "staff_fallback") {
        const { assignee_agent_id: _dropAssigneeAgentId, execution_session_id: _dropSessionId, execution_agent_id: _dropExecAgent, ...fallbackBase } = current;
        nextRow = {
          ...fallbackBase,
          assignee: "STAFF",
          status: "open",
          last_transition_reason_code: "STAFF_FALLBACK_ACTIVE",
          last_transition_reason_message: `Staff assumiu execução por fallback (${actor}).`,
          last_transition_source: "operations-queue",
          last_transition_actor: actor,
          last_transition_at_utc: now,
          updated_at_utc: now
        };
        nextStatus = "open";
        handledStaffValidationDecision = true;
      } else if (validationDecision === "reassign_cpp") {
        const requestedAssignee = normalizeAssignee(data.assignee || current.assignee);
        if (requestedAssignee !== "CPP" && requestedAssignee !== "CPP-IA") {
          return NextResponse.json(
            {
              status: "invalid_request",
              error_code: "REASSIGN_CPP_REQUIRES_CPP",
              message: "Reassign CPP exige assignee=CPP ou CPP-IA."
            },
            { status: 400 }
          );
        }
        if (!hasHealthyAssigneeAgent(agentState, requestedAssignee)) {
          return NextResponse.json(
            { status: "conflict", error_code: "EXECUTOR_NOT_BINDABLE", message: `Sem executor saudável para ${requestedAssignee}.` },
            { status: 409 }
          );
        }
        nextRow = {
          ...current,
          assignee: requestedAssignee,
          status: "open",
          last_transition_reason_code: "STAFF_VALIDATION_REASSIGN_CPP",
          last_transition_reason_message: `Gate validado com reassign para ${requestedAssignee} por ${actor}.`,
          last_transition_source: "operations-queue",
          last_transition_actor: actor,
          last_transition_at_utc: now,
          updated_at_utc: now
        };
        nextStatus = "open";
        handledStaffValidationDecision = true;
      } else if (validationDecision === "bind_cpp") {
        const requestedAssignee = normalizeAssignee(data.assignee || current.assignee);
        if (requestedAssignee !== "CPP" && requestedAssignee !== "CPP-IA") {
          return NextResponse.json(
            { status: "invalid_request", error_code: "BIND_CPP_REQUIRES_CPP", message: "Bind CPP exige assignee=CPP ou CPP-IA." },
            { status: 400 }
          );
        }
        if (!hasHealthyAssigneeAgent(agentState, requestedAssignee)) {
          return NextResponse.json(
            { status: "conflict", error_code: "EXECUTOR_NOT_BINDABLE", message: `Sem executor saudável para ${requestedAssignee}.` },
            { status: 409 }
          );
        }
        nextRow = {
          ...current,
          assignee: requestedAssignee,
          status: "open",
          last_transition_reason_code: "STAFF_VALIDATION_BIND_CPP",
          last_transition_reason_message: `Gate validado e pronto para esteira A Fazer (${actor}).`,
          last_transition_source: "operations-queue",
          last_transition_actor: actor,
          last_transition_at_utc: now,
          updated_at_utc: now
        };
        nextStatus = "open";
        handledStaffValidationDecision = true;
      } else {
        return NextResponse.json(
          {
            status: "invalid_request",
            error_code: "STAFF_VALIDATION_DECISION_INVALID",
            message: "Decision inválida. Use: bind_cpp | reassign_cpp | staff_fallback."
          },
          { status: 400 }
        );
      }
    }
  }

  if (nextStatus === "in_progress") {
    if (!hasHealthyAssigneeAgent(agentState, current.assignee)) {
      return NextResponse.json(
        { status: "conflict", error_code: "ASSIGNEE_NOT_HEALTHY", message: `Nenhum worker saudável para ${current.assignee}.` },
        { status: 409 }
      );
    }

    if (current.status === "in_progress" && !clampText(current.execution_session_id, 180)) {
      return NextResponse.json(
        {
          status: "conflict",
          error_code: "MISSION_SESSION_BIND_REQUIRED",
          message: "Missão em progresso sem execution_session_id. Regularize o vínculo da sessão antes de continuar."
        },
        { status: 409 }
      );
    }

    if (current.status !== "in_progress") {
      const selectedAgent = resolveHealthyAgent(agentState, current.assignee);
      const startAck = await requestQueueStartAck(config, {
        queueItem: current,
        actor,
        actorRole,
        ...(selectedAgent?.agent_id || current.assignee_agent_id
          ? { assigneeAgentId: selectedAgent?.agent_id || current.assignee_agent_id }
          : {}),
        startedAtUtc: now
      });
      if (!startAck.ok) {
        const httpStatus = startAck.error_code === "START_ACK_TIMEOUT" ? 504 : startAck.error_code === "WORKER_UNREACHABLE" ? 502 : 409;
        return NextResponse.json(
          {
            status: "conflict",
            error_code: startAck.error_code,
            message: startAck.message,
            request_id: startAck.request_id,
            ack_source: startAck.ack_source,
            ack_http_status: startAck.ack_http_status,
            ack_payload: startAck.ack_payload
          },
          { status: httpStatus }
        );
      }

      if (selectedAgent) {
        agentState = bumpAgentLoad(agentState, selectedAgent, now);
        const agentSaved = await saveSnapshotPayload(config, {
          snapshotType: AGENTS_SNAPSHOT_TYPE,
          payload: agentState,
          createdBy: actor,
          sourceRepo: "gov-manager",
          sourceRef: "execution-queue-start-load"
        });
        agentsStatus = agentSaved.status;
      }

      nextRow = {
        ...current,
        status: "in_progress",
        ...(selectedAgent?.agent_id || current.assignee_agent_id
          ? { assignee_agent_id: selectedAgent?.agent_id || current.assignee_agent_id }
          : {}),
        execution_job_id: startAck.job_id,
        execution_run_id: startAck.run_id,
        last_start_request_id: startAck.request_id,
        last_start_attempt_at_utc: startAck.started_at_utc,
        last_start_ack_at_utc: startAck.ack_at_utc,
        last_start_ack_source: startAck.ack_source,
        ...(startAck.ack_http_status !== null ? { last_start_ack_http: startAck.ack_http_status } : {}),
        last_start_error_code: "",
        last_start_error_message: "",
        last_transition_reason_code: "MANUAL_START",
        last_transition_reason_message: `Transição manual open -> in_progress por ${actor}. ACK=${startAck.ack_source}.`,
        last_transition_source: "operations-queue",
        last_transition_actor: actor,
        last_transition_at_utc: now,
        execution_progress_pct: Math.max(progressPctInput ?? 3, clampProgress(current.execution_progress_pct) ?? 0),
        execution_progress_label: clampText(current.execution_progress_label, 180) || "Execução iniciada",
        updated_at_utc: now,
        last_executor_heartbeat_at_utc: now
      };

      const sessionsLoaded = await loadSnapshotPayload(config, SESSIONS_SNAPSHOT_TYPE);
      let sessionsState = sessionsLoaded.found && sessionsLoaded.payload ? sanitizeExecutionSessionsState(sessionsLoaded.payload) : defaultExecutionSessionsState();
      const preferredAgentId = String(PREFERRED_EXECUTION_AGENT_BY_ASSIGNEE[current.assignee] || "").trim().toLowerCase();
      const missionBoundSession =
        sessionsState.sessions.find((session) => {
          const role = String(session.role || "").trim().toUpperCase();
          if (role !== current.assignee) return false;
          if (String(session.current_mission_id || "").trim().toUpperCase() !== String(current.mission_id || "").trim().toUpperCase()) return false;
          if (preferredAgentId && String(session.agent_id || "").trim().toLowerCase() !== preferredAgentId) return false;
          return true;
        }) || null;
      const claimableSession = missionBoundSession || resolveClaimableSession(
        sessionsState,
        current.assignee,
        PREFERRED_EXECUTION_AGENT_BY_ASSIGNEE[current.assignee]
      );
      if (!claimableSession) {
        return NextResponse.json(
          {
            status: "conflict",
            error_code: "MISSION_SESSION_BIND_REQUIRED",
            message: `Transição para in_progress bloqueada: não há sessão ativa disponível para ${current.assignee}.`
          },
          { status: 409 }
        );
      }
      {
        const traceId = clampText(claimableSession.current_trace_id, 180) || createTraceId(current.mission_id);
        const runId = clampText(claimableSession.current_run_id, 180) || createRunId(current.mission_id);
        const claimedSession = {
          ...claimableSession,
          status: "busy" as const,
          current_mission_id: current.mission_id,
          current_trace_id: traceId,
          current_run_id: runId,
          last_heartbeat_at_utc: now,
          updated_at_utc: now
        };
        sessionsState = upsertExecutionSession(sessionsState, claimedSession);
        sessionsState = appendExecutionEvent(sessionsState, {
          event_id: createEventId(claimedSession.session_id, "mission_accepted"),
          session_id: claimedSession.session_id,
          mission_id: current.mission_id,
          trace_id: traceId,
          run_id: runId,
          event_type: "mission_accepted",
          stage: "dispatch",
          message: `Missão ${current.mission_id} assumida automaticamente pela sessão ${claimedSession.session_id}.`,
          created_at_utc: now
        });
        sessionsState = appendExecutionEvent(sessionsState, {
          event_id: createEventId(claimedSession.session_id, "start_ack"),
          session_id: claimedSession.session_id,
          mission_id: current.mission_id,
          trace_id: traceId,
          run_id: runId,
          event_type: "start_ack",
          stage: "dispatch",
          message: "Start ACK automático a partir da esteira.",
          created_at_utc: now
        });
        const sessionSaved = await saveSnapshotPayload(config, {
          snapshotType: SESSIONS_SNAPSHOT_TYPE,
          payload: sessionsState,
          createdBy: actor,
          sourceRepo: "gov-manager",
          sourceRef: "execution-queue-auto-claim"
        });
        sessionsStatus = sessionSaved.status;
        if (!sessionSaved.ok) {
          return NextResponse.json(
            {
              status: "upstream_error",
              error_code: "MISSION_SESSION_BIND_REQUIRED",
              message: "Transição para in_progress bloqueada: falha ao persistir vínculo da sessão.",
              govhub_http: sessionSaved.status,
              govhub_response: sessionSaved.response
            },
            { status: 502 }
          );
        }
        nextRow = {
          ...nextRow,
          assignee_agent_id: claimedSession.agent_id,
          execution_trace_id: traceId,
          execution_run_id: runId,
          execution_session_id: claimedSession.session_id,
          execution_agent_id: claimedSession.agent_id
        } as QueueItem;
      }
    } else {
      nextRow = {
        ...current,
        ...(current.execution_agent_id || current.assignee_agent_id
          ? { assignee_agent_id: current.execution_agent_id || current.assignee_agent_id }
          : {}),
        ...(etaDeltaAllowed ? { eta_adjustment_min: Math.max(-120, Math.min(360, clampInt(current.eta_adjustment_min, 0, -120, 360) + etaDeltaMin)) } : {}),
        ...(progressPctInput !== null ? { execution_progress_pct: progressPctInput } : {}),
        ...(etaDeltaAllowed || progressPctInput !== null ? {
          last_transition_reason_code: etaDeltaAllowed ? "ETA_ADJUSTMENT" : "PROGRESS_SYNC",
          last_transition_reason_message: etaDeltaAllowed
            ? `ETA ajustado em ${etaDeltaMin > 0 ? "+" : ""}${etaDeltaMin} min${etaReason ? ` (${etaReason})` : ""}.`
            : `Progresso sincronizado por ${actor}.`,
          last_transition_source: "operations-queue",
          last_transition_actor: actor,
          last_transition_at_utc: now
        } : {}),
        updated_at_utc: now,
        ...(progressPctInput !== null || etaDeltaAllowed ? { last_executor_heartbeat_at_utc: now } : {})
      };
    }
  } else {
    if (current.status === "in_progress") {
      agentState = releaseAgentLoad(agentState, current, now);
      const agentSaved = await saveSnapshotPayload(config, {
        snapshotType: AGENTS_SNAPSHOT_TYPE,
        payload: agentState,
        createdBy: actor,
        sourceRepo: "gov-manager",
        sourceRef: "execution-queue-release-load"
      });
      agentsStatus = agentSaved.status;
    }

    if (nextStatus === "done") {
      const validation = validateQueueTransition({
        source: "operations-queue",
        current_status: current.status,
        next_status: nextStatus,
        completion: {
          completion_ack: data.completion_ack,
          completion_proof: completionProof,
          delivery_summary: deliverySummary,
          validation_summary: validationSummary,
          request_id: doneRequestId
        }
      });
      if (!validation.ok) {
        return NextResponse.json(
          { status: validation.status === 409 ? "invalid_transition" : "invalid_request", error_code: validation.error_code, message: validation.message },
          { status: validation.status }
        );
      }
      const completionNote =
        completionNoteInput ||
        `Relatório GOV: missão concluída por ${current.assignee}. Entrega: ${deliverySummary}. Validação: ${validationSummary}. Prova: ${completionProof}. request_id=${doneRequestId}.`;
      nextRow = {
        ...current,
        status: "done",
        execution_progress_pct: 100,
        execution_progress_label: "Concluída",
        completion_note: completionNote,
        completion_request_id: doneRequestId,
        completion_report_by: actor,
        completion_report_at_utc: now,
        last_transition_reason_code: "MANUAL_DONE",
        last_transition_reason_message: `Conclusão manual validada por contrato canônico (${actor}).`,
        last_transition_source: "operations-queue",
        last_transition_actor: actor,
        last_transition_at_utc: now,
        updated_at_utc: now,
        last_executor_heartbeat_at_utc: now
      };

      const boardLoaded = await loadSnapshotPayload(config, BOARD_SNAPSHOT_TYPE);
      const boardState = boardLoaded.found && boardLoaded.payload ? sanitizeMissionBoardState(boardLoaded.payload) : defaultMissionBoardState();
      const nextBoard = syncMissionBoardRelayStatus(boardState, {
        missionId: current.mission_id,
        objective: current.title,
        assignee: current.assignee,
        priority: current.priority,
        status: "done",
        actor,
        now,
        completionNote
      });
      const boardSaved = await saveSnapshotPayload(config, {
        snapshotType: BOARD_SNAPSHOT_TYPE,
        payload: nextBoard,
        createdBy: actor,
        sourceRepo: "gov-manager",
        sourceRef: "execution-queue-done-sync"
      });
      boardStatus = boardSaved.status;
    } else {
      if (!handledStaffValidationDecision) {
        const { assignee_agent_id: _dropAssigneeAgentId, ...rowWithoutAgent } = current;
        nextRow = {
          ...rowWithoutAgent,
          status: nextStatus,
          ...(nextStatus === "open" ? { execution_progress_pct: 0, execution_progress_label: "" } : {}),
          last_transition_reason_code: nextStatus === "paused_waiting_owner" ? "MANUAL_PAUSE" : "MANUAL_REOPEN",
          last_transition_reason_message: nextStatus === "paused_waiting_owner"
            ? `Item pausado manualmente por ${actor}.`
            : `Item reaberto manualmente por ${actor}.`,
          last_transition_source: "operations-queue",
          last_transition_actor: actor,
          last_transition_at_utc: now,
          updated_at_utc: now
        };
      }
    }
  }

  nextQueue = updateQueueRows(base, (row) => (row.queue_id === queueId ? nextRow : row));
  const saved = await saveSnapshotPayload(config, {
    snapshotType: QUEUE_SNAPSHOT_TYPE,
    payload: nextQueue,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "execution-queue-update-status"
  });

  await recomputeAndPersistOfficePresence(config, { actor, sourceRef: "queue-update", queueState: nextQueue });

  await recordAuditEvent(config, {
    actor,
    role: actorRole,
    action: "queue.update_status",
    target: queueId.slice(0, 180),
    before_state: JSON.stringify({ status: current.status, assignee: current.assignee }),
    after_state: JSON.stringify({ status: nextRow.status, assignee: nextRow.assignee, progress: nextRow.execution_progress_pct ?? 0 }),
    correlation_id: clampText(nextRow.last_start_request_id, 180) || `queue-${Date.now()}`,
    source: "operations-queue",
    createdBy: actor
  });

  const activeRows = nextQueue.rows;
  return NextResponse.json({
    status: saved.ok ? "ok" : "upstream_error",
    govhub_http: saved.status,
    snapshot_type: QUEUE_SNAPSHOT_TYPE,
    updated_at_utc: nextQueue.updated_at_utc,
    row: nextRow,
    summary: summarizeQueue(activeRows),
    rows: activeRows.slice(0, 80),
    ...(boardStatus !== null ? { board_govhub_http: boardStatus } : {}),
    ...(agentsStatus !== null ? { agents_govhub_http: agentsStatus } : {}),
    ...(sessionsStatus !== null ? { sessions_govhub_http: sessionsStatus } : {}),
    payload_sha256: saved.payload_sha256,
    govhub_response: saved.response
  }, { status: saved.ok ? 200 : 502 });
}
