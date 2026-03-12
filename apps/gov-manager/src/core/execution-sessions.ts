export type ExecutionChannel = "ssh" | "api" | "worker";
export type ExecutionSessionStatus = "registered" | "online" | "busy" | "waiting" | "stale" | "offline";
export type ExecutionRunStatus = "accepted" | "running" | "blocked" | "failed" | "done";
export type ExecutionEventType =
  | "session_registered"
  | "heartbeat"
  | "mission_accepted"
  | "start_ack"
  | "progress"
  | "warning"
  | "blocked"
  | "failed"
  | "done";

export interface ExecutionSessionRow {
  session_id: string;
  agent_id: string;
  role: string;
  office_id: string;
  host: string;
  channel: ExecutionChannel;
  session_token: string;
  status: ExecutionSessionStatus;
  current_mission_id?: string;
  current_trace_id?: string;
  current_run_id?: string;
  started_at_utc: string;
  last_heartbeat_at_utc: string;
  updated_at_utc: string;
}

export interface ExecutionEventRow {
  event_id: string;
  session_id: string;
  mission_id: string;
  trace_id: string;
  run_id: string;
  event_type: ExecutionEventType;
  stage: string;
  progress_pct?: number;
  message?: string;
  completion_proof?: string;
  created_at_utc: string;
}

export interface ExecutionSessionsState {
  version: "1.0";
  updated_at_utc: string;
  sessions: ExecutionSessionRow[];
  events: ExecutionEventRow[];
}

export type ExecutionAssignee = "STAFF" | "CPP" | "CPP-IA";

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function normalizeIso(value: unknown): string {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : nowUtc();
}

function normalizeChannel(value: unknown): ExecutionChannel {
  const clean = clampText(value, 16).toLowerCase();
  if (clean === "ssh" || clean === "api" || clean === "worker") return clean;
  return "ssh";
}

function normalizeSessionStatus(value: unknown): ExecutionSessionStatus {
  const clean = clampText(value, 16).toLowerCase();
  if (clean === "registered" || clean === "online" || clean === "busy" || clean === "waiting" || clean === "stale" || clean === "offline") return clean;
  return "registered";
}

function normalizeEventType(value: unknown): ExecutionEventType {
  const clean = clampText(value, 32).toLowerCase();
  if (
    clean === "session_registered" ||
    clean === "heartbeat" ||
    clean === "mission_accepted" ||
    clean === "start_ack" ||
    clean === "progress" ||
    clean === "warning" ||
    clean === "blocked" ||
    clean === "failed" ||
    clean === "done"
  ) {
    return clean;
  }
  return "progress";
}

export function defaultExecutionSessionsState(): ExecutionSessionsState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    sessions: [],
    events: []
  };
}

export function sanitizeExecutionSessionsState(input: unknown): ExecutionSessionsState {
  if (!input || typeof input !== "object") return defaultExecutionSessionsState();
  const obj = input as Record<string, unknown>;
  const sessionsRaw = Array.isArray(obj.sessions) ? obj.sessions : [];
  const eventsRaw = Array.isArray(obj.events) ? obj.events : [];

  const sessions = sessionsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const sessionId = clampText(row.session_id, 120);
      const agentId = clampText(row.agent_id, 120);
      if (!sessionId || !agentId) return null;
      return {
        session_id: sessionId,
        agent_id: agentId,
        role: clampText(row.role, 40) || "WORKER",
        office_id: clampText(row.office_id, 40) || "CPP",
        host: clampText(row.host, 120) || "-",
        channel: normalizeChannel(row.channel),
        session_token: clampText(row.session_token, 240),
        status: normalizeSessionStatus(row.status),
        ...(clampText(row.current_mission_id, 120) ? { current_mission_id: clampText(row.current_mission_id, 120).toUpperCase() } : {}),
        ...(clampText(row.current_trace_id, 180) ? { current_trace_id: clampText(row.current_trace_id, 180) } : {}),
        ...(clampText(row.current_run_id, 180) ? { current_run_id: clampText(row.current_run_id, 180) } : {}),
        started_at_utc: normalizeIso(row.started_at_utc),
        last_heartbeat_at_utc: normalizeIso(row.last_heartbeat_at_utc),
        updated_at_utc: normalizeIso(row.updated_at_utc)
      } satisfies ExecutionSessionRow;
    })
    .filter((row): row is ExecutionSessionRow => Boolean(row))
    .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
    .slice(0, 1000);

  const events = eventsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const eventId = clampText(row.event_id, 160);
      const sessionId = clampText(row.session_id, 120);
      const missionId = clampText(row.mission_id, 120).toUpperCase();
      const traceId = clampText(row.trace_id, 180);
      const runId = clampText(row.run_id, 180);
      if (!eventId || !sessionId || !missionId || !traceId || !runId) return null;
      const progressRaw = Number(row.progress_pct);
      const progressPct = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.trunc(progressRaw))) : null;
      return {
        event_id: eventId,
        session_id: sessionId,
        mission_id: missionId,
        trace_id: traceId,
        run_id: runId,
        event_type: normalizeEventType(row.event_type),
        stage: clampText(row.stage, 80) || "runtime",
        ...(progressPct !== null ? { progress_pct: progressPct } : {}),
        ...(clampText(row.message, 500) ? { message: clampText(row.message, 500) } : {}),
        ...(clampText(row.completion_proof, 600) ? { completion_proof: clampText(row.completion_proof, 600) } : {}),
        created_at_utc: normalizeIso(row.created_at_utc)
      } satisfies ExecutionEventRow;
    })
    .filter((row): row is ExecutionEventRow => Boolean(row))
    .sort((a, b) => String(b.created_at_utc).localeCompare(String(a.created_at_utc)))
    .slice(0, 5000);

  return {
    version: "1.0",
    updated_at_utc: normalizeIso(obj.updated_at_utc),
    sessions,
    events
  };
}

export function upsertExecutionSession(state: ExecutionSessionsState, row: ExecutionSessionRow): ExecutionSessionsState {
  const map = new Map(state.sessions.map((item) => [item.session_id, item] as const));
  map.set(row.session_id, row);
  return {
    ...state,
    updated_at_utc: nowUtc(),
    sessions: Array.from(map.values())
      .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
      .slice(0, 1000)
  };
}

export function appendExecutionEvent(state: ExecutionSessionsState, row: ExecutionEventRow): ExecutionSessionsState {
  return {
    ...state,
    updated_at_utc: nowUtc(),
    events: [row, ...state.events].slice(0, 5000)
  };
}

export function createSessionId(agentId: string): string {
  return `sess-${agentId.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}-${Date.now()}`;
}

export function createRunId(missionId: string): string {
  return `run-${missionId.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}-${Date.now()}`;
}

export function createTraceId(missionId: string): string {
  return `tr-${missionId.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}-${Date.now()}`;
}

export function createEventId(sessionId: string, eventType: ExecutionEventType): string {
  return `evt-${sessionId.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}-${eventType}-${Date.now()}`;
}

export function resolveClaimableSession(
  state: ExecutionSessionsState,
  assignee: ExecutionAssignee,
  preferredAgentId?: string
): ExecutionSessionRow | null {
  const heartbeatBySession = new Map<string, number>();
  for (const event of state.events) {
    if (event.event_type !== "heartbeat") continue;
    const ts = Date.parse(String(event.created_at_utc || ""));
    if (!Number.isFinite(ts)) continue;
    const prev = heartbeatBySession.get(event.session_id) ?? -1;
    if (ts > prev) heartbeatBySession.set(event.session_id, ts);
  }
  const candidates = state.sessions.filter((row) => {
    const role = String(row.role || "").trim().toUpperCase();
    if (role !== assignee) return false;
    if (row.status !== "online" && row.status !== "registered") return false;
    if (String(row.current_mission_id || "").trim()) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  const rank = (row: ExecutionSessionRow): [number, string] => {
    const hbTs = heartbeatBySession.get(row.session_id) ?? -1;
    const hbIso = hbTs > 0 ? new Date(hbTs).toISOString() : "";
    return [hbTs, hbIso];
  };
  const preferred = String(preferredAgentId || "").trim().toLowerCase();
  if (preferred) {
    const exact = candidates
      .filter((row) => String(row.agent_id || "").trim().toLowerCase() === preferred)
      .sort((a, b) => {
        const [ahb, ahbIso] = rank(a);
        const [bhb, bhbIso] = rank(b);
        if (bhb !== ahb) return bhb - ahb;
        const updatedDiff = String(b.updated_at_utc || "").localeCompare(String(a.updated_at_utc || ""));
        if (updatedDiff !== 0) return updatedDiff;
        return String(bhbIso).localeCompare(String(ahbIso));
      })[0];
    if (exact) return exact;
  }
  return [...candidates]
    .sort((a, b) => {
      const [ahb, ahbIso] = rank(a);
      const [bhb, bhbIso] = rank(b);
      if (bhb !== ahb) return bhb - ahb;
      const updatedDiff = String(b.updated_at_utc || "").localeCompare(String(a.updated_at_utc || ""));
      if (updatedDiff !== 0) return updatedDiff;
      return String(bhbIso).localeCompare(String(ahbIso));
    })[0] || null;
}
