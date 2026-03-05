export type AgentHealth = "up" | "degraded" | "down";
export type AgentState = "running" | "idle" | "stale" | "down";

export interface AgentRow {
  agent_id: string;
  role: string;
  group: string;
  capabilities: string[];
  heartbeat_interval_sec: number;
  max_concurrency: number;
  current_load: number;
  health: AgentHealth;
  last_heartbeat_at_utc: string;
  last_job_at_utc: string;
  state: AgentState;
  updated_at_utc: string;
}

export interface AgentRegistryState {
  version: "1.0";
  updated_at_utc: string;
  rows: AgentRow[];
}

function nowUtc(): string {
  return new Date().toISOString();
}

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function toIso(value: unknown): string {
  const parsed = Date.parse(String(value || "").trim());
  if (!Number.isFinite(parsed)) return nowUtc();
  return new Date(parsed).toISOString();
}

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  const rounded = Math.trunc(raw);
  return Math.max(min, Math.min(max, rounded));
}

function sanitizeHealth(value: unknown): AgentHealth {
  const normalized = clampText(value, 16).toLowerCase();
  if (normalized === "up" || normalized === "degraded" || normalized === "down") return normalized;
  return "up";
}

function sanitizeCapabilities(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      arr
        .map((entry) => clampText(entry, 40).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 40);
}

export function deriveAgentState(
  row: Pick<AgentRow, "health" | "current_load" | "last_heartbeat_at_utc">,
  nowEpoch = Date.now(),
  staleAfterSec = 90,
  downAfterSec = 300
): AgentState {
  if (row.health === "down") return "down";
  const hbEpoch = Date.parse(String(row.last_heartbeat_at_utc || ""));
  if (!Number.isFinite(hbEpoch)) return "down";
  const ageSec = Math.max(0, Math.round((nowEpoch - hbEpoch) / 1000));
  if (ageSec > downAfterSec) return "down";
  if (ageSec > staleAfterSec) return "stale";
  return row.current_load > 0 ? "running" : "idle";
}

export function defaultAgentRegistryState(): AgentRegistryState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: []
  };
}

export function sanitizeAgentRegistryState(input: unknown): AgentRegistryState {
  if (!input || typeof input !== "object") return defaultAgentRegistryState();
  const obj = input as Record<string, unknown>;
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
  const now = Date.now();
  const rows = rowsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const agentId = clampText(row.agent_id, 80);
      if (!agentId) return null;
      const currentLoad = toInt(row.current_load, 0, 0, 999);
      const lastHeartbeat = toIso(row.last_heartbeat_at_utc);
      const health = sanitizeHealth(row.health);
      const derived = deriveAgentState(
        { health, current_load: currentLoad, last_heartbeat_at_utc: lastHeartbeat },
        now
      );
      return {
        agent_id: agentId,
        role: clampText(row.role, 24) || "worker",
        group: clampText(row.group, 40) || "default",
        capabilities: sanitizeCapabilities(row.capabilities),
        heartbeat_interval_sec: toInt(row.heartbeat_interval_sec, 30, 5, 3600),
        max_concurrency: toInt(row.max_concurrency, 1, 1, 200),
        current_load: currentLoad,
        health,
        last_heartbeat_at_utc: lastHeartbeat,
        last_job_at_utc: toIso(row.last_job_at_utc || row.last_heartbeat_at_utc),
        state: derived,
        updated_at_utc: toIso(row.updated_at_utc || row.last_heartbeat_at_utc)
      } satisfies AgentRow;
    })
    .filter((row): row is AgentRow => Boolean(row))
    .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
    .slice(0, 2000);

  return {
    version: "1.0",
    updated_at_utc: toIso(obj.updated_at_utc),
    rows
  };
}

export function upsertAgentRow(state: AgentRegistryState, row: AgentRow): AgentRegistryState {
  const map = new Map(state.rows.map((item) => [item.agent_id, item] as const));
  map.set(row.agent_id, row);
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: Array.from(map.values())
      .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
      .slice(0, 2000)
  };
}

export function hasHealthyAssigneeAgent(state: AgentRegistryState, assignee: string): boolean {
  const role = String(assignee || "").trim().toUpperCase();
  if (!role) return false;
  // STAFF represents manual/human execution in GOV and should not be blocked by worker heartbeat.
  if (role === "STAFF") return true;
  return state.rows.some((row) => {
    const rowRole = String(row.role || "").trim().toUpperCase();
    if (rowRole !== role) return false;
    return row.state === "running" || row.state === "idle";
  });
}

export function summarizeAgents(state: AgentRegistryState): {
  total: number;
  running: number;
  idle: number;
  stale: number;
  down: number;
  by_role: Record<string, number>;
} {
  const byRole: Record<string, number> = {};
  let running = 0;
  let idle = 0;
  let stale = 0;
  let down = 0;
  for (const row of state.rows) {
    const role = String(row.role || "worker").toUpperCase();
    byRole[role] = (byRole[role] || 0) + 1;
    if (row.state === "running") running += 1;
    else if (row.state === "idle") idle += 1;
    else if (row.state === "stale") stale += 1;
    else down += 1;
  }
  return {
    total: state.rows.length,
    running,
    idle,
    stale,
    down,
    by_role: byRole
  };
}
