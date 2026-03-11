import { NextResponse } from "next/server";
import { recordAuditEvent } from "../../../../../../core/audit-store";
import { deriveAgentState, sanitizeAgentRegistryState, upsertAgentRow, defaultAgentRegistryState } from "../../../../../../core/agent-registry";
import { defaultQueueState, sanitizeQueueState, summarizeQueue, type QueueItem, type QueueStatus } from "../../../../../../core/execution-queue";
import { resolveGovhubSnapshotConfig, loadSnapshotPayload, saveSnapshotPayload } from "../../../../../../core/govhub-snapshots";
import { defaultMissionBoardState, sanitizeMissionBoardState, syncMissionBoardRelayStatus } from "../../../../../../core/mission-board-relay";
import { recomputeAndPersistOfficePresence } from "../../../../../../core/office-presence";
import { validateQueueTransition } from "../../../../../../core/transition-validator";

const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();
const BOARD_SNAPSHOT_TYPE = String(process.env.GOVHUB_MISSIONS_MANAGE_SNAPSHOT_TYPE || "gov_manager_mission_board_v1").trim();

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function clampInt(value: unknown, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

function clampProgressPct(value: unknown): number | null {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.trunc(raw)));
}

function isStatus(value: string): value is QueueStatus {
  return value === "staff_validation_gate" || value === "open" || value === "in_progress" || value === "done" || value === "paused_waiting_owner";
}

function normStatus(value: unknown): QueueStatus | null {
  const clean = clampText(value, 40).toLowerCase();
  if (isStatus(clean)) return clean;
  if (clean === "open" || clean === "todo" || clean === "new") return "open";
  if (clean === "failed" || clean === "pause" || clean === "paused") return "paused_waiting_owner";
  if (clean === "start" || clean === "running") return "in_progress";
  if (clean === "done" || clean === "complete" || clean === "completed" || clean === "success") return "done";
  return null;
}

function normEvent(value: unknown): "ack" | "progress" | "heartbeat" | "failed" | "done" | "" {
  const clean = clampText(value, 40).toLowerCase();
  if (clean === "ack" || clean === "progress" || clean === "heartbeat" || clean === "failed" || clean === "done") return clean;
  return "";
}

function authByGovhubToken(request: Request, token: string): boolean {
  const header = clampText(request.headers.get("x-govhub-token"), 300);
  if (!header || !token) return false;
  return header === token;
}

function resolveTargetRow(rows: QueueItem[], input: { queueId: string; missionId: string; assignee: string }): QueueItem | null {
  if (input.queueId) {
    return rows.find((row) => row.queue_id === input.queueId) || null;
  }
  const missionRows = rows
    .filter((row) => row.mission_id === input.missionId)
    .filter((row) => (input.assignee ? row.assignee === input.assignee : true))
    .sort((a, b) => String(b.updated_at_utc || "").localeCompare(String(a.updated_at_utc || "")));
  return missionRows[0] || null;
}

function releaseAgentLoad(input: {
  agentState: ReturnType<typeof sanitizeAgentRegistryState>;
  assignee: string;
  assigneeAgentId: string;
  now: string;
}) {
  const role = clampText(input.assignee, 24).toUpperCase();
  if (!role || role === "STAFF") return { changed: false, next: input.agentState };
  const targetId = clampText(input.assigneeAgentId, 80).toLowerCase();
  const candidate = input.agentState.rows.find((row) => {
    if (targetId && String(row.agent_id || "").trim().toLowerCase() !== targetId) return false;
    return String(row.role || "").trim().toUpperCase() === role;
  });
  if (!candidate) return { changed: false, next: input.agentState };

  const nextLoad = Math.max(0, Number(candidate.current_load || 0) - 1);
  const updated = {
    ...candidate,
    current_load: nextLoad,
    last_job_at_utc: input.now,
    last_heartbeat_at_utc: input.now,
    updated_at_utc: input.now,
    state: deriveAgentState(
      {
        health: candidate.health,
        current_load: nextLoad,
        last_heartbeat_at_utc: input.now
      },
      Date.parse(input.now)
    )
  };
  return { changed: true, next: upsertAgentRow(input.agentState, updated) };
}

export async function POST(request: Request) {
  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }
  if (!authByGovhubToken(request, config.token)) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_INVALID_TOKEN" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const queueId = clampText(data.queue_id, 160);
  const missionId = clampText(data.mission_id, 160).toUpperCase();
  const assignee = clampText(data.assignee, 24).toUpperCase();
  if (!queueId && !missionId) {
    return NextResponse.json({ status: "invalid_request", error_code: "QUEUE_ID_OR_MISSION_ID_REQUIRED" }, { status: 400 });
  }
  const nextStatus = normStatus(data.status);
  const relayEvent = normEvent(data.event);
  const normalizedStatus = nextStatus || (relayEvent === "failed" ? "paused_waiting_owner" : relayEvent === "done" ? "done" : relayEvent ? "in_progress" : null);
  if (!normalizedStatus) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error_code: "STATUS_INVALID",
        message: "Relay status inválido. Use: staff_validation_gate|open|in_progress|paused_waiting_owner|done."
      },
      { status: 422 }
    );
  }
  const nextStatusResolved = normalizedStatus;
  const actor = clampText(data.actor, 120).toLowerCase() || "worker-relay";
  const source = clampText(data.source, 80) || "operations-queue-relay";
  const jobId = clampText(data.job_id, 180);
  const runId = clampText(data.run_id ?? data.correlation_id, 180);
  const reasonCode = clampText(data.reason_code, 80).toUpperCase() || (relayEvent ? `EXECUTOR_${relayEvent.toUpperCase()}` : "EXECUTOR_STATUS_RELAY");
  const reasonMessageInput = clampText(data.reason_message, 280);
  const doneRequestId = nextStatusResolved === "done" ? clampText(data.request_id ?? data.correlation_id, 180) : "";
  const releaseLoad = String(data.release_load ?? (nextStatusResolved === "done" || nextStatusResolved === "paused_waiting_owner" ? "true" : "false")).trim().toLowerCase() !== "false";
  const etaDeltaMin = clampInt(data.eta_delta_min, -30, 60);
  const etaDeltaRequested = etaDeltaMin !== 0 && Math.abs(etaDeltaMin) % 5 === 0;
  const progressPctInput = clampProgressPct(data.execution_progress_pct ?? data.progress_pct ?? data.progress_percent);
  const progressLabelInput = clampText(data.execution_progress_label ?? data.progress_label, 180);
  const completionProof = clampText(data.completion_proof, 600);
  const deliverySummary = clampText(data.delivery_summary, 600);
  const validationSummary = clampText(data.validation_summary, 600);
  const reasonMessage =
    reasonMessageInput ||
    (nextStatusResolved === "in_progress" && etaDeltaRequested
      ? `ETA ajustado via relay em ${etaDeltaMin > 0 ? "+" : ""}${etaDeltaMin} min (${source}).`
      : nextStatusResolved === "done" && doneRequestId
        ? `Conclusão reportada via relay (${source}) com request_id=${doneRequestId}.`
      : relayEvent === "heartbeat"
        ? `Heartbeat do executor registrado via relay (${source}).`
      : relayEvent === "progress"
        ? `Progresso factual atualizado via relay (${source}).`
      : relayEvent === "ack"
        ? `ACK factual do executor registrado via relay (${source}).`
      : relayEvent === "failed"
        ? `Falha reportada pelo executor via relay (${source}).`
      : `Status atualizado por relay (${source}).`);
  const now = new Date().toISOString();

  const queueLoaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
  const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
  const current = resolveTargetRow(queueState.rows, { queueId, missionId, assignee });
  if (!current) {
    return NextResponse.json({ status: "not_found", error_code: "QUEUE_ITEM_NOT_FOUND" }, { status: 404 });
  }

  if (nextStatusResolved === "in_progress" && !clampText(current.execution_session_id, 180)) {
    return NextResponse.json(
      {
        status: "conflict",
        error_code: "MISSION_SESSION_BIND_REQUIRED",
        message: "Relay bloqueado: item em progresso sem execution_session_id vinculado."
      },
      { status: 409 }
    );
  }

  if (jobId && current.execution_job_id && current.execution_job_id !== jobId) {
    return NextResponse.json({ status: "conflict", error_code: "JOB_ID_MISMATCH" }, { status: 409 });
  }

  if (nextStatusResolved === "done") {
    const validation = validateQueueTransition({
      source: "operations-queue-relay",
      current_status: current.status,
      next_status: nextStatusResolved,
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
        {
          status: validation.status === 409 ? "invalid_transition" : "invalid_request",
          error_code: validation.error_code,
          message: validation.message
        },
        { status: validation.status }
      );
    }
  }

  const completionNoteInput = clampText(data.completion_note, 1400);
  const completionNote =
    nextStatusResolved === "done"
      ? completionNoteInput ||
        `Relatório GOV: executor ${current.assignee} concluiu missão. Entrega: ${deliverySummary}. Validação: ${validationSummary}. Prova: ${completionProof}. request_id=${doneRequestId || "n/a"}.`
      : "";

  const previousEtaAdjustment = clampInt(current.eta_adjustment_min, -120, 360);
  const nextEtaAdjustment =
    nextStatusResolved === "in_progress" && etaDeltaRequested
      ? Math.max(-120, Math.min(360, previousEtaAdjustment + etaDeltaMin))
      : previousEtaAdjustment;
  const nextProgressPct =
    nextStatusResolved === "done"
      ? 100
      : nextStatusResolved === "open"
        ? 0
        : relayEvent === "heartbeat"
          ? clampProgressPct(current.execution_progress_pct) ?? 3
          : relayEvent === "ack"
            ? Math.max(progressPctInput ?? 8, clampProgressPct(current.execution_progress_pct) ?? 0)
            : progressPctInput ?? clampProgressPct(current.execution_progress_pct) ?? (nextStatusResolved === "in_progress" ? 3 : 0);
  const nextProgressLabel =
    nextStatusResolved === "done"
      ? progressLabelInput || "Concluida com evidencia"
      : nextStatusResolved === "open"
        ? ""
        : progressLabelInput || clampText(current.execution_progress_label, 180) || (nextStatusResolved === "in_progress" ? "Execucao iniciada" : "");

  const nextRows = queueState.rows.map((row) => {
    if (row.queue_id !== current.queue_id) return row;
    return {
      ...row,
      ...(nextStatusResolved === "in_progress" ? row : { assignee_agent_id: undefined }),
      ...(nextStatusResolved === "in_progress" && etaDeltaRequested ? { eta_adjustment_min: nextEtaAdjustment } : {}),
      ...(nextProgressPct !== null ? { execution_progress_pct: nextProgressPct } : {}),
      ...(nextProgressLabel ? { execution_progress_label: nextProgressLabel } : {}),
      ...(jobId ? { execution_job_id: jobId } : {}),
      ...(runId ? { execution_run_id: runId } : {}),
      ...(nextStatusResolved === "in_progress" || relayEvent === "heartbeat" ? { last_executor_heartbeat_at_utc: now } : {}),
      ...(relayEvent === "ack" ? { last_start_ack_at_utc: now, last_start_ack_source: source } : {}),
      ...(nextStatusResolved === "done"
        ? {
            completion_note: completionNote,
            completion_request_id: doneRequestId,
            completion_report_by: actor,
            completion_report_at_utc: now
          }
        : {}),
      status: nextStatusResolved,
      updated_at_utc: now,
      last_transition_reason_code: reasonCode,
      last_transition_reason_message: reasonMessage,
      last_transition_source: source,
      last_transition_actor: actor,
      last_transition_at_utc: now
    };
  });
  const nextQueue = sanitizeQueueState({
    ...queueState,
    updated_at_utc: now,
    rows: nextRows
  });

  const queueSaved = await saveSnapshotPayload(config, {
    snapshotType: QUEUE_SNAPSHOT_TYPE,
    payload: nextQueue,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: source
  });
  if (!queueSaved.ok) {
    return NextResponse.json(
      {
        status: "upstream_error",
        error_code: "QUEUE_SAVE_FAILED",
        govhub_http: queueSaved.status,
        govhub_response: queueSaved.response
      },
      { status: 502 }
    );
  }

  let boardSaveStatus: number | null = null;
  if (nextStatusResolved === "done") {
    const boardLoaded = await loadSnapshotPayload(config, BOARD_SNAPSHOT_TYPE);
    const boardState = boardLoaded.found && boardLoaded.payload
      ? sanitizeMissionBoardState(boardLoaded.payload)
      : defaultMissionBoardState();
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
      sourceRef: "queue-relay-done-sync"
    });
    boardSaveStatus = boardSaved.status;
    if (!boardSaved.ok) {
      return NextResponse.json(
        {
          status: "upstream_error",
          error_code: "MISSION_BOARD_SAVE_FAILED",
          govhub_http: boardSaved.status,
          govhub_response: boardSaved.response
        },
        { status: 502 }
      );
    }
  }

  let agentSaveStatus: number | null = null;
  if (releaseLoad && current.status === "in_progress" && nextStatusResolved !== "in_progress") {
    const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
    const agentState = agentsLoaded.found && agentsLoaded.payload
      ? sanitizeAgentRegistryState(agentsLoaded.payload)
      : defaultAgentRegistryState();
    const released = releaseAgentLoad({
      agentState,
      assignee: current.assignee,
      assigneeAgentId: String(current.assignee_agent_id || ""),
      now
    });
    if (released.changed) {
      const agentsSaved = await saveSnapshotPayload(config, {
        snapshotType: AGENTS_SNAPSHOT_TYPE,
        payload: released.next,
        createdBy: actor,
        sourceRepo: "gov-manager",
        sourceRef: "queue-relay-release"
      });
      agentSaveStatus = agentsSaved.status;
    }
  }

  const presence = await recomputeAndPersistOfficePresence(config, {
    actor,
    sourceRef: "queue-relay",
    queueState: nextQueue
  });

  await recordAuditEvent(config, {
    actor,
    role: "engineer",
    action: "queue.relay_status",
    target: current.queue_id.slice(0, 180),
    before_state: JSON.stringify({ status: current.status, assignee: current.assignee }),
      after_state: JSON.stringify({
        status: nextStatusResolved,
        progress_pct: nextProgressPct,
        reason_code: reasonCode,
        ...(doneRequestId ? { request_id: doneRequestId } : {})
      }),
    correlation_id: doneRequestId || `queue-relay-${Date.now()}`,
    source,
    createdBy: actor
  });

  const activeRows = nextQueue.rows.filter((row) => row.status !== "done");
  const updatedRow = nextQueue.rows.find((row) => row.queue_id === current.queue_id) || null;
  return NextResponse.json(
    {
      status: "ok",
      queue_id: current.queue_id,
      mission_id: current.mission_id,
      updated_status: nextStatus,
      row: updatedRow,
      summary: summarizeQueue(activeRows),
      rows: activeRows.slice(0, 80),
      govhub_http: queueSaved.status,
      ...(boardSaveStatus !== null ? { board_govhub_http: boardSaveStatus } : {}),
      ...(agentSaveStatus !== null ? { agents_govhub_http: agentSaveStatus } : {}),
      presence: {
        status: presence.status,
        changed: presence.changed,
        persisted: presence.persisted,
        updated_at_utc: presence.state.updated_at_utc
      }
    },
    { status: 200 }
  );
}
