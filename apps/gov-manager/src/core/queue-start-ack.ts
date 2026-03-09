import type { QueueAssignee, QueueItem } from "./execution-queue";
import type { GovhubSnapshotConfig } from "./govhub-snapshots";

export type QueueStartAckErrorCode =
  | "START_ACK_TIMEOUT"
  | "WORKER_UNREACHABLE"
  | "START_ACK_REJECTED"
  | "START_ACK_INVALID_RESPONSE"
  | "START_ACK_ENV_MISSING";

export interface QueueStartAckSuccess {
  ok: true;
  request_id: string;
  job_id: string;
  run_id: string;
  idempotency_key: string;
  started_at_utc: string;
  ack_at_utc: string;
  ack_source: string;
  ack_http_status: number | null;
  ack_payload: unknown;
}

export interface QueueStartAckFailure {
  ok: false;
  request_id: string;
  job_id: string;
  run_id: string;
  idempotency_key: string;
  started_at_utc: string;
  failed_at_utc: string;
  ack_source: string;
  ack_http_status: number | null;
  error_code: QueueStartAckErrorCode;
  message: string;
  retriable: boolean;
  ack_payload: unknown;
}

export type QueueStartAckResult = QueueStartAckSuccess | QueueStartAckFailure;

interface QueueStartAckEnvConfig {
  timeout_ms: number;
  cpp_endpoint: string;
  cppia_endpoint: string;
  staff_local_ack: boolean;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.trunc(parsed);
  return Math.min(max, Math.max(min, intValue));
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function normalizeEndpoint(baseUrl: string, rawValue: string): string {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (!baseUrl) return "";
  const base = baseUrl.replace(/\/+$/, "");
  const path = value.startsWith("/") ? value : `/${value}`;
  return `${base}${path}`;
}

function resolveStartAckEnv(config: GovhubSnapshotConfig): QueueStartAckEnvConfig {
  const timeoutMs = clampInt(process.env.GOVHUB_QUEUE_START_ACK_TIMEOUT_MS, 30000, 1000, 120000);
  const cppPath = String(process.env.GOVHUB_QUEUE_START_ACK_CPP_PATH || "/webhook/govhub/workers/cpp/dispatch").trim();
  const cppiaPath = String(process.env.GOVHUB_QUEUE_START_ACK_CPPIA_PATH || "/webhook/govhub/workers/cppia/dispatch").trim();
  const staffLocalAck = String(process.env.GOVHUB_QUEUE_START_ACK_STAFF_LOCAL || "true").trim().toLowerCase() !== "false";
  return {
    timeout_ms: timeoutMs,
    cpp_endpoint: normalizeEndpoint(config.baseUrl, cppPath),
    cppia_endpoint: normalizeEndpoint(config.baseUrl, cppiaPath),
    staff_local_ack: staffLocalAck
  };
}

function endpointForAssignee(assignee: QueueAssignee, env: QueueStartAckEnvConfig): string {
  if (assignee === "CPP") return env.cpp_endpoint;
  if (assignee === "CPP-IA") return env.cppia_endpoint;
  return "";
}

function safeObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function parseAckPayload(input: unknown): { ack: boolean; source: string } {
  const obj = safeObject(input);
  if (obj.ack === true) return { ack: true, source: "ack:true" };
  const status = String(obj.status || "").trim().toLowerCase();
  if (status === "ok" || status === "accepted" || status === "assigned" || status === "dispatched") {
    return { ack: true, source: `status:${status}` };
  }
  const dispatch = String(obj.dispatch || "").trim().toLowerCase();
  if (dispatch === "sent" || dispatch === "accepted") {
    return { ack: true, source: `dispatch:${dispatch}` };
  }
  return { ack: false, source: "ack:missing" };
}

function parseJobIdentity(input: unknown, fallbackRequestId: string, queueId: string): { job_id: string; run_id: string } {
  const obj = safeObject(input);
  const jobId = String(obj.job_id || obj.request_id || fallbackRequestId || queueId).trim().slice(0, 180) || queueId;
  const runId = String(obj.run_id || obj.execution_run_id || obj.correlation_id || jobId).trim().slice(0, 180) || jobId;
  return { job_id: jobId, run_id: runId };
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return text ? { raw_text: String(text).slice(0, 500) } : null;
    } catch {
      return null;
    }
  }
}

function buildStartRequestId(queueId: string, startedAtUtc: string): string {
  const token = queueId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 90) || "queue";
  return `start-${token}-${Date.parse(startedAtUtc) || Date.now()}`;
}

export async function requestQueueStartAck(
  config: GovhubSnapshotConfig,
  input: {
    queueItem: QueueItem;
    actor: string;
    actorRole: string;
    assigneeAgentId?: string;
    requestId?: string;
    startedAtUtc?: string;
  }
): Promise<QueueStartAckResult> {
  const env = resolveStartAckEnv(config);
  const startedAtUtc = String(input.startedAtUtc || "").trim() || toIsoNow();
  const requestId = String(input.requestId || "").trim() || buildStartRequestId(input.queueItem.queue_id, startedAtUtc);
  const idempotencyKey = `queue-start:${input.queueItem.queue_id}`;
  const assignee = input.queueItem.assignee;
  const endpoint = endpointForAssignee(assignee, env);

  if (assignee === "STAFF" && env.staff_local_ack) {
    return {
      ok: true,
      request_id: requestId,
      job_id: requestId,
      run_id: requestId,
      idempotency_key: idempotencyKey,
      started_at_utc: startedAtUtc,
      ack_at_utc: toIsoNow(),
      ack_source: "staff-local",
      ack_http_status: null,
      ack_payload: { ack: true, source: "staff-local" }
    };
  }

  if (!endpoint || !config.token) {
    return {
      ok: false,
      request_id: requestId,
      job_id: requestId,
      run_id: requestId,
      idempotency_key: idempotencyKey,
      started_at_utc: startedAtUtc,
      failed_at_utc: toIsoNow(),
      ack_source: "config",
      ack_http_status: null,
      error_code: "START_ACK_ENV_MISSING",
      message: "Endpoint/token de ACK de start não configurado.",
      retriable: false,
      ack_payload: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.timeout_ms);
  const payload = {
    ack: "start",
    mission_id: input.queueItem.mission_id,
    task_id: input.queueItem.queue_id,
    queue_id: input.queueItem.queue_id,
    assignee: input.queueItem.assignee,
    assignee_agent_id: String(input.assigneeAgentId || "").trim() || String(input.queueItem.assignee_agent_id || "").trim(),
    title: input.queueItem.title,
    description: input.queueItem.description,
    kind: input.queueItem.kind,
    priority: input.queueItem.priority,
    status: "in_progress",
    started_at_utc: startedAtUtc,
    started_by: String(input.actor || "").trim(),
    actor_role: String(input.actorRole || "").trim(),
    start_request_id: requestId,
    idempotency_key: idempotencyKey
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-govhub-token": config.token,
        "x-idempotency-key": idempotencyKey
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal
    });
    const ackPayload = await parseResponsePayload(response);
    const parsed = parseAckPayload(ackPayload);
    if (response.ok && parsed.ack) {
      const ids = parseJobIdentity(ackPayload, requestId, input.queueItem.queue_id);
      return {
        ok: true,
        request_id: requestId,
        job_id: ids.job_id,
        run_id: ids.run_id,
        idempotency_key: idempotencyKey,
        started_at_utc: startedAtUtc,
        ack_at_utc: toIsoNow(),
        ack_source: parsed.source,
        ack_http_status: response.status,
        ack_payload: ackPayload
      };
    }
    if (response.ok) {
      const ids = parseJobIdentity(ackPayload, requestId, input.queueItem.queue_id);
      return {
        ok: false,
        request_id: requestId,
        job_id: ids.job_id,
        run_id: ids.run_id,
        idempotency_key: idempotencyKey,
        started_at_utc: startedAtUtc,
        failed_at_utc: toIsoNow(),
        ack_source: parsed.source,
        ack_http_status: response.status,
        error_code: "START_ACK_INVALID_RESPONSE",
        message: "Executor não confirmou ACK de início.",
        retriable: false,
        ack_payload: ackPayload
      };
    }
    return {
      ok: false,
      request_id: requestId,
      job_id: requestId,
      run_id: requestId,
      idempotency_key: idempotencyKey,
      started_at_utc: startedAtUtc,
      failed_at_utc: toIsoNow(),
      ack_source: "http-error",
      ack_http_status: response.status,
      error_code: "START_ACK_REJECTED",
      message: "Worker/n8n rejeitou ACK de início.",
      retriable: response.status >= 500,
      ack_payload: ackPayload
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      request_id: requestId,
      job_id: requestId,
      run_id: requestId,
      idempotency_key: idempotencyKey,
      started_at_utc: startedAtUtc,
      failed_at_utc: toIsoNow(),
      ack_source: aborted ? "timeout" : "fetch-error",
      ack_http_status: null,
      error_code: aborted ? "START_ACK_TIMEOUT" : "WORKER_UNREACHABLE",
      message: aborted ? "Timeout aguardando ACK de início." : "Worker/n8n indisponível para ACK de início.",
      retriable: true,
      ack_payload: null
    };
  } finally {
    clearTimeout(timeout);
  }
}
