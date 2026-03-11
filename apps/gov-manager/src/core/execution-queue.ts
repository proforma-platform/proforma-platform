export type QueuePriority = "P0" | "P1" | "P2" | "P3";
export type QueueAssignee = "STAFF" | "CPP" | "CPP-IA";
export type QueueStatus = "staff_validation_gate" | "open" | "in_progress" | "done" | "paused_waiting_owner";

export interface QueueItem {
  queue_id: string;
  mission_id: string;
  title: string;
  description: string;
  kind: string;
  priority: QueuePriority;
  assignee: QueueAssignee;
  assignee_agent_id?: string;
  execution_session_id?: string;
  execution_agent_id?: string;
  execution_trace_id?: string;
  execution_job_id?: string;
  execution_run_id?: string;
  last_start_request_id?: string;
  last_start_attempt_at_utc?: string;
  last_start_ack_at_utc?: string;
  last_start_error_code?: string;
  last_start_error_message?: string;
  last_start_ack_source?: string;
  last_start_ack_http?: number;
  last_executor_heartbeat_at_utc?: string;
  last_transition_reason_code?: string;
  last_transition_reason_message?: string;
  last_transition_source?: string;
  last_transition_actor?: string;
  last_transition_at_utc?: string;
  execution_progress_pct?: number;
  execution_progress_label?: string;
  eta_adjustment_min?: number;
  completion_note?: string;
  completion_request_id?: string;
  completion_report_by?: string;
  completion_report_at_utc?: string;
  status: QueueStatus;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface QueueState {
  version: "1.0";
  updated_at_utc: string;
  rows: QueueItem[];
}

const PRIORITY_SET = new Set<QueuePriority>(["P0", "P1", "P2", "P3"]);
const ASSIGNEE_SET = new Set<QueueAssignee>(["STAFF", "CPP", "CPP-IA"]);
const STATUS_SET = new Set<QueueStatus>(["staff_validation_gate", "open", "in_progress", "done", "paused_waiting_owner"]);

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function normPriority(value: unknown): QueuePriority {
  const candidate = clampText(value, 4).toUpperCase() as QueuePriority;
  return PRIORITY_SET.has(candidate) ? candidate : "P2";
}

function normAssignee(value: unknown): QueueAssignee {
  const candidate = clampText(value, 16).toUpperCase() as QueueAssignee;
  return ASSIGNEE_SET.has(candidate) ? candidate : "STAFF";
}

function normStatus(value: unknown): QueueStatus {
  const candidate = clampText(value, 32).toLowerCase() as QueueStatus;
  return STATUS_SET.has(candidate) ? candidate : "open";
}

function normIso(value: unknown): string {
  const date = new Date(clampText(value, 64));
  return Number.isNaN(date.getTime()) ? nowUtc() : date.toISOString();
}

function byPriority(a: QueueItem, b: QueueItem): number {
  const order: Record<QueuePriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
  return order[a.priority] - order[b.priority] || b.updated_at_utc.localeCompare(a.updated_at_utc);
}

export function defaultQueueState(): QueueState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: []
  };
}

export function sanitizeQueueState(input: unknown): QueueState {
  if (!input || typeof input !== "object") return defaultQueueState();
  const obj = input as Record<string, unknown>;
  const rows = Array.isArray(obj.rows) ? obj.rows : [];
  const sanitized = rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const src = row as Record<string, unknown>;
      const queueId = clampText(src.queue_id, 120);
      const missionId = clampText(src.mission_id, 120);
      const title = clampText(src.title, 180);
      if (!queueId || !missionId || !title) return null;
      const assigneeAgentId = clampText(src.assignee_agent_id, 80);
      const executionSessionId = clampText(src.execution_session_id, 180);
      const executionAgentId = clampText(src.execution_agent_id, 120);
      const executionTraceId = clampText(src.execution_trace_id, 180);
      const executionJobId = clampText(src.execution_job_id, 180);
      const executionRunId = clampText(src.execution_run_id, 180);
      const lastStartRequestId = clampText(src.last_start_request_id, 120);
      const lastStartErrorCode = clampText(src.last_start_error_code, 80).toUpperCase();
      const lastStartErrorMessage = clampText(src.last_start_error_message, 240);
      const lastStartAckSource = clampText(src.last_start_ack_source, 80);
      const lastStartAckHttpRaw = Number(src.last_start_ack_http);
      const lastStartAckHttp = Number.isFinite(lastStartAckHttpRaw) ? Math.max(0, Math.trunc(lastStartAckHttpRaw)) : null;
      const lastTransitionReasonCode = clampText(src.last_transition_reason_code, 80).toUpperCase();
      const lastTransitionReasonMessage = clampText(src.last_transition_reason_message, 280);
      const lastTransitionSource = clampText(src.last_transition_source, 80);
      const lastTransitionActor = clampText(src.last_transition_actor, 120).toLowerCase();
      const executionProgressRaw = Number(src.execution_progress_pct);
      const executionProgressPct = Number.isFinite(executionProgressRaw)
        ? Math.max(0, Math.min(100, Math.trunc(executionProgressRaw)))
        : null;
      const executionProgressLabel = clampText(src.execution_progress_label, 180);
      const etaAdjustmentRaw = Number(src.eta_adjustment_min);
      const etaAdjustmentMin = Number.isFinite(etaAdjustmentRaw)
        ? Math.max(-120, Math.min(360, Math.trunc(etaAdjustmentRaw)))
        : 0;
      const completionNote = clampText(src.completion_note, 1400);
      const completionRequestId = clampText(src.completion_request_id, 180);
      const completionReportBy = clampText(src.completion_report_by, 120).toLowerCase();
      return {
        queue_id: queueId,
        mission_id: missionId,
        title,
        description: clampText(src.description, 800),
        kind: clampText(src.kind, 60) || "general",
        priority: normPriority(src.priority),
        assignee: normAssignee(src.assignee),
        ...(assigneeAgentId ? { assignee_agent_id: assigneeAgentId } : {}),
        ...(executionSessionId ? { execution_session_id: executionSessionId } : {}),
        ...(executionAgentId ? { execution_agent_id: executionAgentId } : {}),
        ...(executionTraceId ? { execution_trace_id: executionTraceId } : {}),
        ...(executionJobId ? { execution_job_id: executionJobId } : {}),
        ...(executionRunId ? { execution_run_id: executionRunId } : {}),
        ...(lastStartRequestId ? { last_start_request_id: lastStartRequestId } : {}),
        ...(clampText(src.last_start_attempt_at_utc, 64) ? { last_start_attempt_at_utc: normIso(src.last_start_attempt_at_utc) } : {}),
        ...(clampText(src.last_start_ack_at_utc, 64) ? { last_start_ack_at_utc: normIso(src.last_start_ack_at_utc) } : {}),
        ...(lastStartErrorCode ? { last_start_error_code: lastStartErrorCode } : {}),
        ...(lastStartErrorMessage ? { last_start_error_message: lastStartErrorMessage } : {}),
        ...(lastStartAckSource ? { last_start_ack_source: lastStartAckSource } : {}),
        ...(lastStartAckHttp !== null ? { last_start_ack_http: lastStartAckHttp } : {}),
        ...(clampText(src.last_executor_heartbeat_at_utc, 64)
          ? { last_executor_heartbeat_at_utc: normIso(src.last_executor_heartbeat_at_utc) }
          : {}),
        ...(lastTransitionReasonCode ? { last_transition_reason_code: lastTransitionReasonCode } : {}),
        ...(lastTransitionReasonMessage ? { last_transition_reason_message: lastTransitionReasonMessage } : {}),
        ...(lastTransitionSource ? { last_transition_source: lastTransitionSource } : {}),
        ...(lastTransitionActor ? { last_transition_actor: lastTransitionActor } : {}),
        ...(clampText(src.last_transition_at_utc, 64) ? { last_transition_at_utc: normIso(src.last_transition_at_utc) } : {}),
        ...(executionProgressPct !== null ? { execution_progress_pct: executionProgressPct } : {}),
        ...(executionProgressLabel ? { execution_progress_label: executionProgressLabel } : {}),
        ...(etaAdjustmentMin !== 0 ? { eta_adjustment_min: etaAdjustmentMin } : {}),
        ...(completionNote ? { completion_note: completionNote } : {}),
        ...(completionRequestId ? { completion_request_id: completionRequestId } : {}),
        ...(completionReportBy ? { completion_report_by: completionReportBy } : {}),
        ...(clampText(src.completion_report_at_utc, 64)
          ? { completion_report_at_utc: normIso(src.completion_report_at_utc) }
          : {}),
        status: normStatus(src.status),
        created_at_utc: normIso(src.created_at_utc),
        updated_at_utc: normIso(src.updated_at_utc)
      } satisfies QueueItem;
    })
    .filter((row): row is QueueItem => Boolean(row))
    .sort(byPriority)
    .slice(0, 1000);

  return {
    version: "1.0",
    updated_at_utc: normIso(obj.updated_at_utc),
    rows: sanitized
  };
}

export function decideAssignee(kind: string): QueueAssignee {
  const normalized = String(kind || "").toLowerCase();
  if (/(arquitetura|analysis|analise|planejamento|spec|risk|requisito)/.test(normalized)) return "CPP-IA";
  if (/(implement|codigo|code|fix|deploy|infra|runtime|api)/.test(normalized)) return "CPP";
  return "STAFF";
}

export function createQueueId(missionId: string, title: string, indexHint = 0): string {
  const base = `${clampText(missionId, 64)}-${clampText(title, 32).replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  return `${base || "queue"}-${Date.now()}-${Math.max(0, indexHint)}`;
}

export function upsertQueueItems(state: QueueState, items: QueueItem[]): QueueState {
  const map = new Map(state.rows.map((row) => [row.queue_id, row] as const));
  for (const item of items) map.set(item.queue_id, item);
  const rows = Array.from(map.values()).sort(byPriority).slice(0, 1000);
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows
  };
}

export function summarizeQueue(rows: QueueItem[]): {
  total: number;
  by_assignee: Record<QueueAssignee, number>;
  by_priority: Record<QueuePriority, number>;
  by_status: Record<QueueStatus, number>;
} {
  const by_assignee: Record<QueueAssignee, number> = { STAFF: 0, CPP: 0, "CPP-IA": 0 };
  const by_priority: Record<QueuePriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const by_status: Record<QueueStatus, number> = { staff_validation_gate: 0, open: 0, in_progress: 0, done: 0, paused_waiting_owner: 0 };
  for (const row of rows) {
    by_assignee[row.assignee] += 1;
    by_priority[row.priority] += 1;
    by_status[row.status] += 1;
  }
  return { total: rows.length, by_assignee, by_priority, by_status };
}
