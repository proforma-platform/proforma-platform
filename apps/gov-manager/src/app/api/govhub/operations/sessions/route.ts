import { NextResponse } from "next/server";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";
import { defaultQueueState, sanitizeQueueState } from "../../../../../core/execution-queue";
import { defaultMissionBoardState, sanitizeMissionBoardState, syncMissionBoardRelayStatus } from "../../../../../core/mission-board-relay";
import { validateQueueTransition } from "../../../../../core/transition-validator";
import {
  appendExecutionEvent,
  createEventId,
  createRunId,
  createSessionId,
  createTraceId,
  defaultExecutionSessionsState,
  sanitizeExecutionSessionsState,
  upsertExecutionSession,
  type ExecutionEventType,
  type ExecutionSessionRow
} from "../../../../../core/execution-sessions";

const SESSIONS_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_SESSIONS_SNAPSHOT_TYPE || "gov_manager_execution_sessions_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const BOARD_SNAPSHOT_TYPE = String(process.env.GOVHUB_MISSIONS_MANAGE_SNAPSHOT_TYPE || "gov_manager_mission_board_v1").trim();

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function normalizeRole(value: unknown): string {
  return clampText(value, 40).toUpperCase() || "WORKER";
}

function normalizeOffice(value: unknown): string {
  return clampText(value, 40).toUpperCase() || "CPP";
}

function normalizeChannel(value: unknown): "ssh" | "api" | "worker" {
  const clean = clampText(value, 16).toLowerCase();
  if (clean === "api" || clean === "worker") return clean;
  return "ssh";
}

function buildSessionToken(sessionId: string, agentId: string): string {
  return `gst_${Buffer.from(`${sessionId}:${agentId}:${Date.now()}`).toString("base64url")}`;
}

function requireSession(state: ReturnType<typeof sanitizeExecutionSessionsState>, sessionId: string, sessionToken: string) {
  const current = state.sessions.find((row) => row.session_id === sessionId);
  if (!current) return { ok: false as const, error: "SESSION_NOT_FOUND" };
  if (String(current.session_token || "") !== sessionToken) return { ok: false as const, error: "SESSION_TOKEN_INVALID" };
  return { ok: true as const, current };
}

async function saveSessionsState(config: ReturnType<typeof resolveGovhubSnapshotConfig>, state: ReturnType<typeof sanitizeExecutionSessionsState>, actor: string, sourceRef: string) {
  return saveSnapshotPayload(config, {
    snapshotType: SESSIONS_SNAPSHOT_TYPE,
    payload: state,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef
  });
}

export async function GET(request: Request) {
  const auth = requireRole(request, "viewer");
  if (!auth.ok) {
    return NextResponse.json({ status: "unauthorized", error_code: auth.error_code }, { status: auth.status });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json({ status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED" }, { status: 500 });
  }

  const loaded = await loadSnapshotPayload(config, SESSIONS_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeExecutionSessionsState(loaded.payload) : defaultExecutionSessionsState();
  const url = new URL(request.url);
  const missionId = clampText(url.searchParams.get("mission_id"), 120).toUpperCase();
  const agentId = clampText(url.searchParams.get("agent_id"), 120);
  const sessionId = clampText(url.searchParams.get("session_id"), 120);

  const sessions = state.sessions.filter((row) => {
    if (agentId && row.agent_id !== agentId) return false;
    if (sessionId && row.session_id !== sessionId) return false;
    if (missionId && String(row.current_mission_id || "").toUpperCase() !== missionId) return false;
    return true;
  });
  const visibleSessionIds = new Set(sessions.map((row) => row.session_id));
  const events = state.events.filter((row) => {
    if (missionId && row.mission_id !== missionId) return false;
    if (sessionId && row.session_id !== sessionId) return false;
    if (agentId && !visibleSessionIds.has(row.session_id) && !sessions.some((session) => session.agent_id === agentId && session.session_id === row.session_id)) return false;
    return true;
  });

  return NextResponse.json({
    status: "ok",
    snapshot_type: SESSIONS_SNAPSHOT_TYPE,
    updated_at_utc: state.updated_at_utc,
    sessions,
    events,
    payload_sha256: loaded.payload_sha256 || null
  });
}

export async function POST(request: Request) {
  const auth = requireRole(request, "engineer");
  if (!auth.ok) {
    return NextResponse.json({ status: "forbidden", error_code: auth.error_code }, { status: auth.status });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json({ status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = clampText(data.action, 40).toLowerCase();
  const actor = auth.session.username;
  const now = nowUtc();

  const loaded = await loadSnapshotPayload(config, SESSIONS_SNAPSHOT_TYPE);
  let state = loaded.found && loaded.payload ? sanitizeExecutionSessionsState(loaded.payload) : defaultExecutionSessionsState();

  if (action === "register_session") {
    const agentId = clampText(data.agent_id, 120);
    if (!agentId) {
      return NextResponse.json({ status: "invalid_request", error_code: "AGENT_ID_REQUIRED" }, { status: 400 });
    }
    const sessionId = createSessionId(agentId);
    const sessionToken = buildSessionToken(sessionId, agentId);
    const row: ExecutionSessionRow = {
      session_id: sessionId,
      agent_id: agentId,
      role: normalizeRole(data.role),
      office_id: normalizeOffice(data.office_id),
      host: clampText(data.host, 120) || "-",
      channel: normalizeChannel(data.channel),
      session_token: sessionToken,
      status: "online",
      started_at_utc: now,
      last_heartbeat_at_utc: now,
      updated_at_utc: now
    };
    state = upsertExecutionSession(state, row);
    state = appendExecutionEvent(state, {
      event_id: createEventId(sessionId, "session_registered"),
      session_id: sessionId,
      mission_id: "GOV-SESSION",
      trace_id: sessionId,
      run_id: sessionId,
      event_type: "session_registered",
      stage: "bootstrap",
      message: `Sessão registrada para ${agentId}.`,
      created_at_utc: now
    });
    const saved = await saveSessionsState(config, state, actor, "execution-sessions-register");
    await recordAuditEvent(config, {
      actor,
      role: auth.session.role,
      action: "sessions.register_session",
      target: sessionId,
      after_state: JSON.stringify({ agent_id: agentId, role: row.role, office_id: row.office_id }),
      correlation_id: sessionId,
      source: "operations-sessions",
      createdBy: actor
    });
    return NextResponse.json({
      status: saved.ok ? "ok" : "upstream_error",
      row,
      session_token: sessionToken,
      govhub_http: saved.status,
      payload_sha256: saved.payload_sha256
    }, { status: saved.ok ? 200 : 502 });
  }

  const sessionId = clampText(data.session_id, 120);
  const sessionToken = clampText(data.session_token, 240);
  if (!sessionId || !sessionToken) {
    return NextResponse.json({ status: "invalid_request", error_code: "SESSION_ID_AND_TOKEN_REQUIRED" }, { status: 400 });
  }

  const required = requireSession(state, sessionId, sessionToken);
  if (!required.ok) {
    return NextResponse.json({ status: "forbidden", error_code: required.error }, { status: 403 });
  }
  let current = required.current;

  if (action === "heartbeat_session") {
    current = { ...current, status: current.current_mission_id ? "busy" : "online", last_heartbeat_at_utc: now, updated_at_utc: now };
    state = upsertExecutionSession(state, current);
    state = appendExecutionEvent(state, {
      event_id: createEventId(sessionId, "heartbeat"),
      session_id: sessionId,
      mission_id: String(current.current_mission_id || "GOV-SESSION"),
      trace_id: String(current.current_trace_id || sessionId),
      run_id: String(current.current_run_id || sessionId),
      event_type: "heartbeat",
      stage: "runtime",
      message: "Heartbeat da sessão.",
      created_at_utc: now
    });
    const saved = await saveSessionsState(config, state, actor, "execution-sessions-heartbeat");
    return NextResponse.json({ status: saved.ok ? "ok" : "upstream_error", row: current, govhub_http: saved.status }, { status: saved.ok ? 200 : 502 });
  }

  if (action === "start_mission") {
    const missionId = clampText(data.mission_id, 120).toUpperCase();
    if (!missionId) {
      return NextResponse.json({ status: "invalid_request", error_code: "MISSION_ID_REQUIRED" }, { status: 400 });
    }
    const queueLoaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
    const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
    const queueRow = queueState.rows.find((row) => String(row.mission_id || "").toUpperCase() === missionId);
    if (!queueRow) {
      return NextResponse.json({ status: "not_found", error_code: "MISSION_NOT_IN_QUEUE" }, { status: 404 });
    }
    const traceId = createTraceId(missionId);
    const runId = createRunId(missionId);
    current = {
      ...current,
      status: "busy",
      current_mission_id: missionId,
      current_trace_id: traceId,
      current_run_id: runId,
      last_heartbeat_at_utc: now,
      updated_at_utc: now
    };
    state = upsertExecutionSession(state, current);
    state = appendExecutionEvent(state, {
      event_id: createEventId(sessionId, "mission_accepted"),
      session_id: sessionId,
      mission_id: missionId,
      trace_id: traceId,
      run_id: runId,
      event_type: "mission_accepted",
      stage: "dispatch",
      message: `Missão ${missionId} aceita pela sessão ${sessionId}.`,
      created_at_utc: now
    });
    const saved = await saveSessionsState(config, state, actor, "execution-sessions-start-mission");
    await recordAuditEvent(config, {
      actor,
      role: auth.session.role,
      action: "sessions.start_mission",
      target: missionId,
      after_state: JSON.stringify({ session_id: sessionId, trace_id: traceId, run_id: runId }),
      correlation_id: runId,
      source: "operations-sessions",
      createdBy: actor
    });
    return NextResponse.json({
      status: saved.ok ? "ok" : "upstream_error",
      row: current,
      trace_id: traceId,
      run_id: runId,
      queue_id: queueRow.queue_id,
      govhub_http: saved.status
    }, { status: saved.ok ? 200 : 502 });
  }

  if (action === "release_session") {
    const reason = clampText(data.reason, 240) || "Sessão liberada manualmente.";
    {
      const {
        current_mission_id: _dropMissionId,
        current_trace_id: _dropTraceId,
        current_run_id: _dropRunId,
        ...sessionWithoutRun
      } = current;
      current = {
        ...sessionWithoutRun,
        status: "online",
        last_heartbeat_at_utc: now,
        updated_at_utc: now
      };
    }
    state = upsertExecutionSession(state, current);
    state = appendExecutionEvent(state, {
      event_id: createEventId(sessionId, "warning"),
      session_id: sessionId,
      mission_id: "GOV-SESSION",
      trace_id: sessionId,
      run_id: sessionId,
      event_type: "warning",
      stage: "release",
      message: reason,
      created_at_utc: now
    });
    const saved = await saveSessionsState(config, state, actor, "execution-sessions-release");
    await recordAuditEvent(config, {
      actor,
      role: auth.session.role,
      action: "sessions.release_session",
      target: sessionId,
      after_state: JSON.stringify({ status: "online", reason }),
      correlation_id: sessionId,
      source: "operations-sessions",
      createdBy: actor
    });
    return NextResponse.json({ status: saved.ok ? "ok" : "upstream_error", row: current, govhub_http: saved.status }, { status: saved.ok ? 200 : 502 });
  }

  if (action === "complete_mission") {
    const missionId = clampText(data.mission_id, 120).toUpperCase();
    const traceId = clampText(data.trace_id, 180);
    const runId = clampText(data.run_id, 180);
    const completionProof = clampText(data.completion_proof, 600);
    const deliverySummary = clampText(data.delivery_summary, 600);
    const validationSummary = clampText(data.validation_summary, 600);
    const doneRequestId = clampText(data.request_id ?? data.correlation_id ?? runId, 180);
    const queueLoaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
    const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
    const queueRow = queueState.rows.find((row) => String(row.mission_id || "").toUpperCase() === missionId);
    if (!queueRow) {
      return NextResponse.json({ status: "not_found", error_code: "MISSION_NOT_IN_QUEUE" }, { status: 404 });
    }
    const validation = validateQueueTransition({
      source: "operations-sessions",
      current_status: queueRow.status,
      next_status: "done",
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
    const completionNote = `Relatório GOV: missão concluída por ${current.agent_id}. Entrega: ${deliverySummary}. Validação: ${validationSummary}. Prova registrada: ${completionProof}.`;
    {
      const {
        current_mission_id: _dropMissionId,
        current_trace_id: _dropTraceId,
        current_run_id: _dropRunId,
        ...sessionWithoutRun
      } = current;
      current = {
        ...sessionWithoutRun,
        status: "online",
        last_heartbeat_at_utc: now,
        updated_at_utc: now
      };
    }
    state = upsertExecutionSession(state, current);
    state = appendExecutionEvent(state, {
      event_id: createEventId(sessionId, "done"),
      session_id: sessionId,
      mission_id: missionId,
      trace_id: traceId,
      run_id: runId,
      event_type: "done",
      stage: "completion",
      message: "Missão concluída pela sessão.",
      completion_proof: completionProof,
      created_at_utc: now
    });

    if (queueRow) {
      const nextQueue = sanitizeQueueState({
        ...queueState,
        updated_at_utc: now,
        rows: queueState.rows.map((row) => {
          if (String(row.mission_id || "").toUpperCase() !== missionId) return row;
          return {
            ...row,
            status: "done",
            assignee_agent_id: current.agent_id,
            execution_agent_id: current.agent_id,
            execution_progress_pct: 100,
            execution_progress_label: "Concluída",
            completion_note: completionNote,
            completion_request_id: doneRequestId,
            completion_report_by: current.agent_id,
            completion_report_at_utc: now,
            last_transition_reason_code: "SESSION_DONE",
            last_transition_reason_message: `Conclusão reportada pela sessão ${sessionId}.`,
            last_transition_source: "operations-sessions",
            last_transition_actor: current.agent_id,
            last_transition_at_utc: now,
            last_executor_heartbeat_at_utc: now,
            updated_at_utc: now
          };
        })
      });
      await saveSnapshotPayload(config, {
        snapshotType: QUEUE_SNAPSHOT_TYPE,
        payload: nextQueue,
        createdBy: actor,
        sourceRepo: "gov-manager",
        sourceRef: "execution-sessions-complete-sync-queue"
      });

      const boardLoaded = await loadSnapshotPayload(config, BOARD_SNAPSHOT_TYPE);
      const boardState = boardLoaded.found && boardLoaded.payload ? sanitizeMissionBoardState(boardLoaded.payload) : defaultMissionBoardState();
      const nextBoard = syncMissionBoardRelayStatus(boardState, {
        missionId,
        objective: queueRow.title,
        assignee: queueRow.assignee,
        priority: queueRow.priority,
        status: "done",
        actor: current.agent_id,
        now,
        completionNote
      });
      await saveSnapshotPayload(config, {
        snapshotType: BOARD_SNAPSHOT_TYPE,
        payload: nextBoard,
        createdBy: actor,
        sourceRepo: "gov-manager",
        sourceRef: "execution-sessions-complete-sync-board"
      });
    }

    const saved = await saveSessionsState(config, state, actor, "execution-sessions-complete");
    await recordAuditEvent(config, {
      actor,
      role: auth.session.role,
      action: "sessions.complete_mission",
      target: missionId,
      after_state: JSON.stringify({ session_id: sessionId, trace_id: traceId, run_id: runId }),
      correlation_id: runId,
      source: "operations-sessions",
      createdBy: actor
    });
    return NextResponse.json({ status: saved.ok ? "ok" : "upstream_error", row: current, govhub_http: saved.status }, { status: saved.ok ? 200 : 502 });
  }

  return NextResponse.json(
    { status: "invalid_request", error_code: "ACTION_NOT_SUPPORTED", allowed_actions: ["register_session", "heartbeat_session", "start_mission", "complete_mission", "release_session"] },
    { status: 400 }
  );
}
