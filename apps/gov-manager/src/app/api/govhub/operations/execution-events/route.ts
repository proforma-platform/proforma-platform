import { NextResponse } from "next/server";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";
import {
  appendExecutionEvent,
  createEventId,
  defaultExecutionSessionsState,
  sanitizeExecutionSessionsState,
  upsertExecutionSession
} from "../../../../../core/execution-sessions";

const SESSIONS_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_SESSIONS_SNAPSHOT_TYPE || "gov_manager_execution_sessions_v1").trim();

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function truthy(value: unknown): boolean {
  const clean = String(value ?? "").trim().toLowerCase();
  return clean === "true" || clean === "1" || clean === "yes" || clean === "ok";
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
  const sessionId = clampText(data.session_id, 120);
  const sessionToken = clampText(data.session_token, 240);
  const missionId = clampText(data.mission_id, 120).toUpperCase();
  const traceId = clampText(data.trace_id, 180);
  const runId = clampText(data.run_id, 180);
  const eventType = clampText(data.event_type, 32).toLowerCase();
  if (!sessionId || !sessionToken || !missionId || !traceId || !runId || !eventType) {
    return NextResponse.json({ status: "invalid_request", error_code: "SESSION_MISSION_TRACE_RUN_EVENT_REQUIRED" }, { status: 400 });
  }

  const loaded = await loadSnapshotPayload(config, SESSIONS_SNAPSHOT_TYPE);
  let state = loaded.found && loaded.payload ? sanitizeExecutionSessionsState(loaded.payload) : defaultExecutionSessionsState();
  const session = state.sessions.find((row) => row.session_id === sessionId);
  if (!session) {
    return NextResponse.json({ status: "forbidden", error_code: "SESSION_NOT_FOUND" }, { status: 403 });
  }
  if (String(session.session_token || "") !== sessionToken) {
    return NextResponse.json({ status: "forbidden", error_code: "SESSION_TOKEN_INVALID" }, { status: 403 });
  }

  const now = nowUtc();
  const progressRaw = Number(data.progress_pct);
  const progressPct = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.trunc(progressRaw))) : undefined;
  const nextSessionStatus =
    eventType === "blocked"
      ? "waiting"
      : eventType === "failed"
        ? "stale"
        : missionId
          ? "busy"
          : "online";
  state = upsertExecutionSession(state, {
    ...session,
    status: nextSessionStatus,
    current_mission_id: missionId,
    current_trace_id: traceId,
    current_run_id: runId,
    last_heartbeat_at_utc: now,
    updated_at_utc: now
  });
  state = appendExecutionEvent(state, {
    event_id: createEventId(sessionId, eventType as never),
    session_id: sessionId,
    mission_id: missionId,
    trace_id: traceId,
    run_id: runId,
    event_type: eventType as never,
    stage: clampText(data.stage, 80) || "runtime",
    ...(typeof progressPct === "number" ? { progress_pct: progressPct } : {}),
    ...(clampText(data.message, 500) ? { message: clampText(data.message, 500) } : {}),
    ...(clampText(data.completion_proof, 600) ? { completion_proof: clampText(data.completion_proof, 600) } : {}),
    created_at_utc: now
  });

  const saved = await saveSnapshotPayload(config, {
    snapshotType: SESSIONS_SNAPSHOT_TYPE,
    payload: state,
    createdBy: auth.session.username,
    sourceRepo: "gov-manager",
    sourceRef: "execution-events"
  });

  await recordAuditEvent(config, {
    actor: auth.session.username,
    role: auth.session.role,
    action: `execution_events.${eventType}`,
    target: missionId,
    after_state: JSON.stringify({ session_id: sessionId, trace_id: traceId, run_id: runId, ...(typeof progressPct === "number" ? { progress_pct: progressPct } : {}) }),
    correlation_id: runId,
    source: "operations-execution-events",
    createdBy: auth.session.username
  });

  const shouldRelease = eventType === "done" || eventType === "failed" || truthy(data.release_session);
  if (shouldRelease) {
    const current = state.sessions.find((row) => row.session_id === sessionId);
    if (current) {
      const {
        current_mission_id: _dropMissionId,
        current_trace_id: _dropTraceId,
        current_run_id: _dropRunId,
        ...sessionWithoutRun
      } = current;
      state = upsertExecutionSession(state, {
        ...sessionWithoutRun,
        status: "online",
        updated_at_utc: now
      });
    }
  }

  return NextResponse.json({
    status: saved.ok ? "ok" : "upstream_error",
    govhub_http: saved.status,
    session_id: sessionId,
    mission_id: missionId,
    trace_id: traceId,
    run_id: runId
  }, { status: saved.ok ? 200 : 502 });
}
