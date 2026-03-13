import { NextResponse } from "next/server";
import { readSessionFromRequest } from "../../../../auth/session";
import { recordAuditEvent } from "../../../../core/audit-store";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../core/govhub-snapshots";
import { defaultQueueState, sanitizeQueueState, upsertQueueItems, type QueueItem } from "../../../../core/execution-queue";
import {
  appendExecutionEvent,
  createEventId,
  defaultExecutionSessionsState,
  resolveClaimableSession,
  sanitizeExecutionSessionsState,
  upsertExecutionSession,
  type ExecutionSessionRow
} from "../../../../core/execution-sessions";
import { nowUtc, sanitizeChatState, toOpsUdn, type ChatMessage } from "../../../../core/operations-chat";

type DirectTarget = "CPP" | "CPP-IA";
const SESSIONS_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_SESSIONS_SNAPSHOT_TYPE || "gov_manager_execution_sessions_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const CHAT_SNAPSHOT_TYPE = String(process.env.GOVHUB_CHAT_SNAPSHOT_TYPE || "gov_manager_ops_chat_v1").trim();

function clampText(value: unknown, max = 4000): string {
  return String(value || "").trim().slice(0, max);
}

function resolveTarget(value: unknown): DirectTarget {
  const normalized = clampText(value, 20).toUpperCase();
  return normalized === "CPP-IA" ? "CPP-IA" : "CPP";
}

function resolveRequestedAgentId(data: Record<string, unknown>): string {
  return clampText(data.assignee_agent_id || data.agent_id, 120);
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

function shouldAutoReleaseFromDispatch(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const row = data as Record<string, unknown>;
  const nextAction = clampText(row.next_action, 40).toLowerCase();
  const progress = Number(row.execution_progress_pct);
  const label = clampText(row.execution_progress_label, 120).toLowerCase();
  const status = clampText(row.status, 40).toLowerCase();
  if (nextAction === "done" || nextAction === "online") return true;
  if (status === "done" || status === "completed") return true;
  if (Number.isFinite(progress) && progress >= 100) return true;
  if (label.includes("conclu")) return true;
  return false;
}

function appendChatRows(rows: ChatMessage[], additions: ChatMessage[]) {
  return {
    version: "1.0" as const,
    updated_at_utc: nowUtc(),
    rows: [...additions, ...rows].slice(0, 500)
  };
}

async function reconcileBusySessionIfQueueDone(
  auditConfig: ReturnType<typeof resolveGovhubSnapshotConfig>,
  sessionsState: ReturnType<typeof sanitizeExecutionSessionsState>,
  executionSession: ExecutionSessionRow,
  actor: string
) {
  const missionId = String(executionSession.current_mission_id || "").trim().toUpperCase();
  if (!missionId) return { sessionsState, executionSession, released: false };

  const queueLoaded = await loadSnapshotPayload(auditConfig, QUEUE_SNAPSHOT_TYPE);
  const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
  const queueRow = queueState.rows.find((row) => String(row.mission_id || "").trim().toUpperCase() === missionId);
  if (!queueRow || queueRow.status !== "done") {
    return { sessionsState, executionSession, released: false };
  }

  const now = new Date().toISOString();
  const {
    current_mission_id: _dropMissionId,
    current_trace_id: _dropTraceId,
    current_run_id: _dropRunId,
    ...sessionWithoutRun
  } = executionSession;
  const releasedSession: ExecutionSessionRow = {
    ...sessionWithoutRun,
    status: "online",
    last_heartbeat_at_utc: now,
    updated_at_utc: now
  };
  let nextSessionsState = upsertExecutionSession(sessionsState, releasedSession);
  nextSessionsState = appendExecutionEvent(nextSessionsState, {
    event_id: createEventId(String(executionSession.session_id || ""), "warning"),
    session_id: String(executionSession.session_id || ""),
    mission_id: missionId,
    trace_id: String(executionSession.current_trace_id || executionSession.session_id || ""),
    run_id: String(executionSession.current_run_id || executionSession.session_id || ""),
    event_type: "warning",
    stage: "reconcile",
    message: `Sessão reconciliada automaticamente no cpp/direct após detectar missão concluída na fila: ${missionId}.`,
    created_at_utc: now
  });
  await saveSnapshotPayload(auditConfig, {
    snapshotType: SESSIONS_SNAPSHOT_TYPE,
    payload: nextSessionsState,
    createdBy: actor,
    sourceRepo: "gov-manager",
    sourceRef: "cpp-direct-auto-reconcile"
  });

  return { sessionsState: nextSessionsState, executionSession: releasedSession, released: true };
}

function maybeReconcileMpbCanonicalClosure(queueRows: QueueItem[], missionId: string, now: string, actor: string) {
  const parentMissionId = missionId.replace(/-(STAFF|PA|CPP1|CPP2)$/u, "");
  if (parentMissionId === missionId) return { rows: queueRows, completed: false };
  const paId = `${parentMissionId}-PA`;
  const staffId = `${parentMissionId}-STAFF`;
  const cpp1Id = `${parentMissionId}-CPP1`;
  const cpp2Id = `${parentMissionId}-CPP2`;
  const parentId = parentMissionId;
  const childMissionIds = [staffId, paId, cpp1Id, cpp2Id];
  const childRows = queueRows.filter((row) => childMissionIds.includes(String(row.mission_id || "").trim().toUpperCase()));
  if (childRows.length < 4) return { rows: queueRows, completed: false };

  const cpp1 = childRows.find((row) => String(row.mission_id || "").trim().toUpperCase() === cpp1Id);
  const cpp2 = childRows.find((row) => String(row.mission_id || "").trim().toUpperCase() === cpp2Id);
  if (!cpp1 || !cpp2 || cpp1.status !== "done" || cpp2.status !== "done") {
    return { rows: queueRows, completed: false };
  }

  let changed = false;
  const reconciledRows = queueRows.map((row) => {
    const rowMission = String(row.mission_id || "").trim().toUpperCase();
    if ((rowMission === paId || rowMission === staffId) && row.status === "open") {
      changed = true;
      return {
        ...row,
        status: "done" as const,
        execution_progress_pct: 100,
        execution_progress_label: "Concluída",
        completion_note: "Fechamento canônico MPB após conclusão de CPP1 e CPP2.",
        completion_report_by: actor,
        completion_report_at_utc: now,
        last_transition_reason_code: "MPB_CANONICAL_FORCE_CLOSE",
        last_transition_reason_message: "Subtarefa PA/STAFF auto-fechada no cpp/direct (CPP1+CPP2 concluídos).",
        last_transition_source: "cpp-direct-api",
        last_transition_actor: actor,
        last_transition_at_utc: now,
        updated_at_utc: now,
        last_executor_heartbeat_at_utc: now
      } satisfies QueueItem;
    }
    return row;
  });

  const finalizedChildRows = reconciledRows.filter((row) => childMissionIds.includes(String(row.mission_id || "").trim().toUpperCase()));
  if (finalizedChildRows.length < 4 || finalizedChildRows.some((row) => row.status !== "done")) {
    return { rows: reconciledRows, completed: changed };
  }

  const parentRow = reconciledRows.find((row) => String(row.mission_id || "").trim().toUpperCase() === parentId);
  if (!parentRow || parentRow.status === "done") {
    return { rows: reconciledRows, completed: changed };
  }

  return {
    rows: reconciledRows.map((row) => {
      if (row.queue_id !== parentRow.queue_id) return row;
      return {
        ...row,
        status: "done" as const,
        execution_progress_pct: 100,
        execution_progress_label: "Concluída",
        completion_note: "Bloco MPB concluído com subtarefas nominais finalizadas.",
        completion_report_by: actor,
        completion_report_at_utc: now,
        last_transition_reason_code: "MPB_PARENT_DONE",
        last_transition_reason_message: "Bloco MPB concluído após fechamento nominal das subtarefas.",
        last_transition_source: "cpp-direct-api",
        last_transition_actor: actor,
        last_transition_at_utc: now,
        updated_at_utc: now,
        last_executor_heartbeat_at_utc: now
      } satisfies QueueItem;
    }),
    completed: true
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
  const requestedAgentId = resolveRequestedAgentId(data);
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
    agent_id: requestedAgentId || undefined,
    assignee_agent_id: requestedAgentId || undefined,
    action,
    actor: session.username,
    message,
    source,
    correlation_id: correlationId,
    use_llm: action === "MSG"
  };
  const auditConfig = resolveGovhubSnapshotConfig();

  try {
    const [sessionsLoaded, queueLoaded, chatLoaded] = await Promise.all([
      loadSnapshotPayload(auditConfig, SESSIONS_SNAPSHOT_TYPE),
      loadSnapshotPayload(auditConfig, QUEUE_SNAPSHOT_TYPE),
      loadSnapshotPayload(auditConfig, CHAT_SNAPSHOT_TYPE)
    ]);
    let sessionsState = sessionsLoaded.found && sessionsLoaded.payload
      ? sanitizeExecutionSessionsState(sessionsLoaded.payload)
      : defaultExecutionSessionsState();
    let queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
    const chatState = chatLoaded.found && chatLoaded.payload ? sanitizeChatState(chatLoaded.payload) : sanitizeChatState(null);
    const chatRows: ChatMessage[] = [];

    let executionSession: ExecutionSessionRow | null = null;
    if (requestedAgentId) {
      let exact = sessionsState.sessions.find((row) => {
        const role = String(row.role || "").trim().toUpperCase();
        const agentId = String(row.agent_id || "").trim().toLowerCase();
        return role === target && agentId === requestedAgentId.toLowerCase();
      });
      if (exact && exact.current_mission_id && exact.current_mission_id !== missionId) {
        const reconciled = await reconcileBusySessionIfQueueDone(auditConfig, sessionsState, exact, session.username);
        sessionsState = reconciled.sessionsState;
        exact = reconciled.executionSession;
      }
      if (exact && exact.current_mission_id && exact.current_mission_id !== missionId) {
        return NextResponse.json(
          {
            status: "blocked",
            error_code: "EXECUTION_SESSION_BUSY",
            target,
            requested_agent_id: requestedAgentId,
            execution_session_id: exact.session_id,
            current_mission_id: exact.current_mission_id,
            mission_id: missionId
          },
          { status: 409 }
        );
      }
      if (exact && (exact.status === "online" || exact.status === "registered" || exact.status === "busy")) {
        executionSession = exact;
      }
    }

    if (!executionSession) {
      executionSession = resolveClaimableSession(sessionsState, target, requestedAgentId);
    }

    if (!executionSession) {
      return NextResponse.json(
        {
          status: "blocked",
          error_code: requestedAgentId ? "EXECUTION_SESSION_FOR_AGENT_REQUIRED" : "EXECUTION_SESSION_REQUIRED",
          target,
          requested_agent_id: requestedAgentId || null,
          mission_id: missionId
        },
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

    if (response.ok && action !== "DONE" && shouldAutoReleaseFromDispatch(dispatchPayload)) {
      const releaseNow = new Date().toISOString();
      const {
        current_mission_id: _dropMissionId,
        current_trace_id: _dropTraceId,
        current_run_id: _dropRunId,
        ...sessionWithoutRun
      } = executionSession;
      sessionsState = upsertExecutionSession(sessionsState, {
        ...sessionWithoutRun,
        status: "online",
        last_heartbeat_at_utc: releaseNow,
        updated_at_utc: releaseNow
      });
      sessionsState = appendExecutionEvent(sessionsState, {
        event_id: createEventId(sessionId, "done"),
        session_id: sessionId,
        mission_id: missionId,
        trace_id: traceId,
        run_id: runId,
        event_type: "done",
        stage: "completion",
        message: "Missão concluída e sessão liberada automaticamente via cpp/direct.",
        created_at_utc: releaseNow
      });
      await saveSnapshotPayload(auditConfig, {
        snapshotType: SESSIONS_SNAPSHOT_TYPE,
        payload: sessionsState,
        createdBy: session.username,
        sourceRepo: "gov-manager",
        sourceRef: "cpp-direct-auto-release"
      });
    }

    const queueRow = queueState.rows.find((row) => String(row.mission_id || "").trim().toUpperCase() === missionId);
    if (queueRow && response.ok) {
      const syncNow = new Date().toISOString();
      if (action === "DONE" || shouldAutoReleaseFromDispatch(dispatchPayload)) {
        const completionProofText =
          completionProof ||
          clampText((dispatchPayload as Record<string, unknown> | null)?.completion_proof, 600) ||
          `proof://cpp-direct/${String(executionSession.agent_id || target).toLowerCase()}/${missionId}`;
        const deliverySummary =
          clampText((dispatchPayload as Record<string, unknown> | null)?.delivery_summary, 600) ||
          `Missão ${missionId} concluída por ${String(executionSession.agent_id || target).toLowerCase()}.`;
        const validationSummary =
          clampText((dispatchPayload as Record<string, unknown> | null)?.validation_summary, 600) ||
          "Concluída via dispatch direto com resposta final positiva.";
        const doneRow: QueueItem = {
          ...queueRow,
          assignee: target,
          ...(requestedAgentId ? { assignee_agent_id: requestedAgentId.toLowerCase() } : {}),
          ...(String(executionSession.agent_id || "").trim()
            ? { execution_agent_id: String(executionSession.agent_id || "").trim().toLowerCase() }
            : {}),
          execution_session_id: sessionId,
          execution_trace_id: traceId,
          execution_run_id: runId,
          status: "done",
          execution_progress_pct: 100,
          execution_progress_label: "Concluída",
          completion_note: `Relatório GOV: missão concluída por ${String(executionSession.agent_id || target).toLowerCase()}. Entrega: ${deliverySummary}. Validação: ${validationSummary}. Prova: ${completionProofText}. request_id=${correlationId}.`,
          completion_request_id: correlationId,
          completion_report_by: session.username,
          completion_report_at_utc: syncNow,
          last_transition_reason_code: "CPP_DIRECT_DONE_SYNC",
          last_transition_reason_message: "Conclusão sincronizada automaticamente a partir do dispatch direto.",
          last_transition_source: "cpp-direct-api",
          last_transition_actor: session.username,
          last_transition_at_utc: syncNow,
          updated_at_utc: syncNow,
          last_executor_heartbeat_at_utc: syncNow
        };
        queueState = upsertQueueItems(queueState, [doneRow]);
        const finalized = maybeReconcileMpbCanonicalClosure(queueState.rows, missionId, syncNow, session.username);
        queueState = {
          ...queueState,
          updated_at_utc: syncNow,
          rows: finalized.rows
        };
        void finalized;
      } else {
        const openRow: QueueItem = {
          ...queueRow,
          assignee: target,
          ...(requestedAgentId ? { assignee_agent_id: requestedAgentId.toLowerCase() } : {}),
          ...(String(executionSession.agent_id || "").trim()
            ? { execution_agent_id: String(executionSession.agent_id || "").trim().toLowerCase() }
            : {}),
          execution_session_id: sessionId,
          execution_trace_id: traceId,
          execution_run_id: runId,
          last_transition_reason_code: "CPP_DIRECT_ACK",
          last_transition_reason_message: "Dispatch direto confirmado para executor nominal.",
          last_transition_source: "cpp-direct-api",
          last_transition_actor: session.username,
          last_transition_at_utc: syncNow,
          updated_at_utc: syncNow,
          last_executor_heartbeat_at_utc: syncNow
        };
        queueState = upsertQueueItems(queueState, [openRow]);
      }
      await Promise.all([
        saveSnapshotPayload(auditConfig, {
          snapshotType: QUEUE_SNAPSHOT_TYPE,
          payload: queueState,
          createdBy: session.username,
          sourceRepo: "gov-manager",
          sourceRef: "cpp-direct-queue-sync"
        }),
        chatRows.length > 0
          ? saveSnapshotPayload(auditConfig, {
            snapshotType: CHAT_SNAPSHOT_TYPE,
            payload: appendChatRows(chatState.rows, chatRows),
            createdBy: session.username,
            sourceRepo: "gov-manager",
            sourceRef: "cpp-direct-chat-sync"
          })
          : Promise.resolve({ ok: true, status: 200 })
      ]);
    }

    await recordAuditEvent(auditConfig, {
      actor: session.username,
      role: session.role,
      action: "cpp.direct.dispatch",
      target: `${String(executionSession.agent_id || target)}:${missionId}`,
      before_state: "",
      after_state: JSON.stringify(
        {
          endpoint,
          requested_agent_id: requestedAgentId || null,
          execution_agent_id: executionSession.agent_id,
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
          requested_agent_id: requestedAgentId || null,
          execution_agent_id: executionSession.agent_id,
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
        requested_agent_id: requestedAgentId || null,
        execution_agent_id: executionSession.agent_id,
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
