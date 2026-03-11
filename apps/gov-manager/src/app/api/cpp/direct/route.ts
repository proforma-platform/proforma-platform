import { NextResponse } from "next/server";
import { readSessionFromRequest } from "../../../../auth/session";
import { recordAuditEvent } from "../../../../core/audit-store";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../core/govhub-snapshots";
import {
  appendExecutionEvent,
  createEventId,
  defaultExecutionSessionsState,
  sanitizeExecutionSessionsState,
  upsertExecutionSession
} from "../../../../core/execution-sessions";

type DirectTarget = "CPP" | "CPP-IA";
const SESSIONS_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_SESSIONS_SNAPSHOT_TYPE || "gov_manager_execution_sessions_v1").trim();

function clampText(value: unknown, max = 4000): string {
  return String(value || "").trim().slice(0, max);
}

function resolveTarget(value: unknown): DirectTarget {
  const normalized = clampText(value, 20).toUpperCase();
  return normalized === "CPP-IA" ? "CPP-IA" : "CPP";
}

function resolveDispatchConfig(target: DirectTarget): { endpoint: string; token: string } {
  const baseUrl = clampText(process.env.CPP_DIRECT_BASE_URL || "", 400).replace(/\/+$/, "");
  const token = clampText(process.env.CPP_DIRECT_TOKEN || "", 300);
  const cppPath = clampText(process.env.CPP_DIRECT_CPP_PATH || "/webhook/govhub/workers/cpp/dispatch", 300);
  const cppIaPath = clampText(process.env.CPP_DIRECT_CPPIA_PATH || "/webhook/govhub/workers/cppia/dispatch", 300);
  const rawPath = target === "CPP-IA" ? cppIaPath : cppPath;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return {
    endpoint: `${baseUrl}${path}`,
    token
  };
}

export async function POST(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ status: "unauthorized", error_code: "AUTH_REQUIRED" }, { status: 401 });
  }
  if (session.role === "viewer") {
    return NextResponse.json({ status: "forbidden", error_code: "ROLE_NOT_ALLOWED" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const missionId = clampText(data.mission_id, 120).toUpperCase();
  const traceId = clampText(data.trace_id, 180);
  const runId = clampText(data.run_id, 180);
  const target = resolveTarget(data.target);
  const message = clampText(data.message, 2000);
  const action = clampText(data.action || "MSG", 20).toUpperCase() || "MSG";
  const completionProof = clampText(data.completion_proof, 600);
  const source = clampText(data.source || "cpp-direct-api", 60) || "cpp-direct-api";
  const correlationId = clampText(data.correlation_id || `cpp-direct-${Date.now()}`, 180);

  if (!missionId || !traceId || !runId || !action) {
    return NextResponse.json(
      { status: "invalid_request", error_code: "MISSION_TRACE_RUN_ACTION_REQUIRED" },
      { status: 400 }
    );
  }
  if (action === "DONE" && !completionProof) {
    return NextResponse.json({ status: "invalid_request", error_code: "COMPLETION_PROOF_REQUIRED" }, { status: 400 });
  }
  if (!message && action !== "DONE") {
    return NextResponse.json({ status: "invalid_request", error_code: "MESSAGE_REQUIRED" }, { status: 400 });
  }

  const { endpoint, token } = resolveDispatchConfig(target);
  if (!endpoint || !token || !endpoint.startsWith("http")) {
    return NextResponse.json(
      {
        status: "misconfigured",
        error_code: "CPP_DIRECT_ENV_REQUIRED",
        message: "Configure CPP_DIRECT_BASE_URL, CPP_DIRECT_TOKEN e paths CPP_DIRECT_CPP_PATH/CPP_DIRECT_CPPIA_PATH."
      },
      { status: 500 }
    );
  }

  const payload = {
    mission_id: missionId,
    task_id: missionId,
    queue_id: missionId,
    target,
    action,
    actor: session.username,
    message,
    source,
    correlation_id: correlationId,
    use_llm: action === "MSG"
  };
  const auditConfig = resolveGovhubSnapshotConfig();

  try {
    const sessionsLoaded = await loadSnapshotPayload(auditConfig, SESSIONS_SNAPSHOT_TYPE);
    let sessionsState = sessionsLoaded.found && sessionsLoaded.payload
      ? sanitizeExecutionSessionsState(sessionsLoaded.payload)
      : defaultExecutionSessionsState();
    const candidateSessions = sessionsState.sessions.filter((row) => {
      const role = String(row.role || "").trim().toUpperCase();
      const status = String(row.status || "").trim().toLowerCase();
      return role === target && (status === "online" || status === "busy");
    });
    const executionSession = candidateSessions[0] || null;
    if (!executionSession) {
      return NextResponse.json(
        { status: "blocked", error_code: "EXECUTION_SESSION_REQUIRED", target, mission_id: missionId },
        { status: 409 }
      );
    }
    const sessionId = String(executionSession.session_id || "").trim();
    const now = new Date().toISOString();
    const eventType = action === "DONE" ? "done" : action === "HEARTBEAT" ? "heartbeat" : "mission_accepted";
    if (action === "DONE") {
      const {
        current_mission_id: _dropMissionId,
        current_trace_id: _dropTraceId,
        current_run_id: _dropRunId,
        ...sessionWithoutRun
      } = executionSession;
      sessionsState = upsertExecutionSession(sessionsState, {
        ...sessionWithoutRun,
        status: "online",
        last_heartbeat_at_utc: now,
        updated_at_utc: now
      });
    } else {
      sessionsState = upsertExecutionSession(sessionsState, {
        ...executionSession,
        status: "busy",
        current_mission_id: missionId,
        current_trace_id: traceId,
        current_run_id: runId,
        last_heartbeat_at_utc: now,
        updated_at_utc: now
      });
    }
    sessionsState = appendExecutionEvent(sessionsState, {
      event_id: createEventId(sessionId, eventType),
      session_id: sessionId,
      mission_id: missionId,
      trace_id: traceId,
      run_id: runId,
      event_type: eventType,
      stage: action === "DONE" ? "completion" : "dispatch",
      message: message || (action === "DONE" ? "Missão concluída via cpp/direct." : "Missão roteada via cpp/direct."),
      ...(completionProof ? { completion_proof: completionProof } : {}),
      created_at_utc: now
    });
    await saveSnapshotPayload(auditConfig, {
      snapshotType: SESSIONS_SNAPSHOT_TYPE,
      payload: sessionsState,
      createdBy: session.username,
      sourceRepo: "gov-manager",
      sourceRef: "cpp-direct-dispatch"
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cpp-token": token,
        "x-govhub-token": token
      },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    let dispatchPayload: unknown = null;
    try {
      dispatchPayload = await response.json();
    } catch {
      dispatchPayload = null;
    }

    await recordAuditEvent(auditConfig, {
      actor: session.username,
      role: session.role,
      action: "cpp.direct.dispatch",
      target: `${target}:${missionId}`,
      before_state: "",
      after_state: JSON.stringify(
        {
          endpoint,
          correlation_id: correlationId,
          http_status: response.status
        },
        null,
        0
      ).slice(0, 2000),
      correlation_id: correlationId,
      source: "cpp-direct-api",
      createdBy: session.username
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: "error",
          error_code: "CPP_DIRECT_DISPATCH_FAILED",
          ack: false,
          mission_id: missionId,
          target,
          execution_session_id: sessionId,
          correlation_id: correlationId,
          dispatch_http: response.status,
          dispatch_payload: dispatchPayload
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        ack: true,
        mission_id: missionId,
        target,
        execution_session_id: sessionId,
        trace_id: traceId,
        run_id: runId,
        correlation_id: correlationId,
        dispatch_http: response.status,
        dispatch_payload: dispatchPayload
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      {
        status: "error",
        error_code: "CPP_DIRECT_NETWORK_FAILED",
        mission_id: missionId,
        target,
        correlation_id: correlationId
      },
      { status: 502 }
    );
  }
}
