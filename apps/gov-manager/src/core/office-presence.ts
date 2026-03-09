import { defaultAgentRegistryState, sanitizeAgentRegistryState, type AgentRegistryState, type AgentRow } from "./agent-registry";
import { defaultQueueState, sanitizeQueueState, type QueueAssignee, type QueueItem, type QueueState } from "./execution-queue";
import { defaultOfficeHierarchyState, sanitizeOfficeHierarchyState, type OfficeHierarchyState } from "./office-hierarchy";
import { loadSnapshotPayload, saveSnapshotPayload, type GovhubSnapshotConfig } from "./govhub-snapshots";

export type PresenceState =
  | "EXECUTING"
  | "READY"
  | "AWAITING_OWNER"
  | "DEGRADED"
  | "AWAITING_NEXT"
  | "IDLE"
  | "STANDBY";

export type PresenceSource = "heartbeat" | "queue" | "policy" | "role_fallback" | "unknown";

export interface PresenceAssigneeRow {
  assignee: QueueAssignee;
  role: string;
  state: PresenceState;
  source: PresenceSource;
  label: string;
  online: boolean;
  stale: boolean;
  health: "up" | "degraded" | "down";
  open_count: number;
  in_progress_count: number;
  paused_count: number;
  done_count: number;
  current_load: number;
  max_concurrency: number;
  demand_total: number;
  last_activity_at_utc: string;
  updated_at_utc: string;
}

export interface PresenceIdentityRow {
  office_id: string;
  identity: string;
  resolved_agent_id: string;
  role: string;
  state: PresenceState;
  source: PresenceSource;
  label: string;
  online: boolean;
  stale: boolean;
  health: "up" | "degraded" | "down";
  last_activity_at_utc: string;
  updated_at_utc: string;
}

export interface PresenceOfficeRow {
  office_id: string;
  state: PresenceState;
  source: PresenceSource;
  label: string;
  online: boolean;
  stale: boolean;
  health: "up" | "degraded" | "down";
  members_total: number;
  open_count: number;
  in_progress_count: number;
  paused_count: number;
  done_count: number;
  demand_total: number;
  last_activity_at_utc: string;
  updated_at_utc: string;
}

export interface OfficePresenceState {
  version: "1.0";
  updated_at_utc: string;
  assignee_rows: PresenceAssigneeRow[];
  identity_rows: PresenceIdentityRow[];
  office_rows: PresenceOfficeRow[];
}

export interface PresenceComputeOptions {
  standby_after_min: number;
  awaiting_next_min: number;
}

const DEFAULT_OPTIONS: PresenceComputeOptions = {
  standby_after_min: 20,
  awaiting_next_min: 20
};

const PRESENCE_STATE_ORDER: Record<PresenceState, number> = {
  DEGRADED: 0,
  EXECUTING: 1,
  READY: 2,
  AWAITING_OWNER: 3,
  AWAITING_NEXT: 4,
  IDLE: 5,
  STANDBY: 6
};

const PRESENCE_SNAPSHOT_TYPE = String(process.env.GOVHUB_OFFICE_PRESENCE_SNAPSHOT_TYPE || "gov_manager_office_presence_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();
const OFFICE_SNAPSHOT_TYPE = String(process.env.GOVHUB_OFFICE_SNAPSHOT_TYPE || "gov_manager_office_hierarchy_v1").trim();
const PRESENCE_MIN_PERSIST_SEC = Math.max(10, Math.min(300, Number.parseInt(String(process.env.GOVHUB_PRESENCE_MIN_PERSIST_SEC || "30"), 10) || 30));

function nowUtc(): string {
  return new Date().toISOString();
}

function toEpoch(value: unknown): number {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampText(value: unknown, max = 120): string {
  return String(value || "").trim().slice(0, max);
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

function normalizePresenceState(value: unknown): PresenceState {
  const clean = String(value || "").trim().toUpperCase();
  if (
    clean === "EXECUTING" ||
    clean === "READY" ||
    clean === "AWAITING_OWNER" ||
    clean === "DEGRADED" ||
    clean === "AWAITING_NEXT" ||
    clean === "IDLE" ||
    clean === "STANDBY"
  ) {
    return clean;
  }
  return "STANDBY";
}

function normalizePresenceSource(value: unknown): PresenceSource {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "heartbeat" || clean === "queue" || clean === "policy" || clean === "role_fallback" || clean === "unknown") {
    return clean;
  }
  return "unknown";
}

function normalizeHealth(value: unknown): "up" | "degraded" | "down" {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "up" || clean === "degraded" || clean === "down") return clean;
  return "down";
}

function presenceLabel(state: PresenceState): string {
  if (state === "EXECUTING") return "Executando";
  if (state === "READY") return "Pronto";
  if (state === "AWAITING_OWNER") return "Aguardando owner";
  if (state === "DEGRADED") return "Degradado";
  if (state === "AWAITING_NEXT") return "Aguardando próxima";
  if (state === "IDLE") return "Ocioso";
  return "Standby";
}

function roleFromIdentity(identityRaw: string, agentById: Map<string, AgentRow>): string {
  const identity = String(identityRaw || "").trim().toLowerCase();
  if (!identity) return "WORKER";
  const exact = agentById.get(identity);
  if (exact) return String(exact.role || "").trim().toUpperCase() || "WORKER";
  if (identity.includes("principal")) return "PRINCIPAL_ARCHITECT";
  if (identity.includes("cpp-ia")) return "CPP-IA";
  if (identity.includes("cpp") || identity.includes("orchestrator")) return "CPP";
  if (identity.includes("staff")) return "STAFF";
  return "WORKER";
}

function assigneeFromRole(roleRaw: string): QueueAssignee {
  const role = String(roleRaw || "").trim().toUpperCase();
  if (role === "CPP-IA") return "CPP-IA";
  if (role === "CPP") return "CPP";
  return "STAFF";
}

function coalesceActivity(prevIso: string, queueIso: string, heartbeatIso: string): string {
  const prevEpoch = toEpoch(prevIso);
  const queueEpoch = toEpoch(queueIso);
  const hbEpoch = toEpoch(heartbeatIso);
  const best = Math.max(prevEpoch, queueEpoch, hbEpoch);
  if (best <= 0) return nowUtc();
  return new Date(best).toISOString();
}

function bestRoleAgentMap(agentState: AgentRegistryState): Map<string, AgentRow> {
  const grouped = new Map<string, AgentRow[]>();
  for (const row of agentState.rows) {
    const role = String(row.role || "").trim().toUpperCase();
    if (!role) continue;
    const list = grouped.get(role) || [];
    list.push(row);
    grouped.set(role, list);
  }
  const map = new Map<string, AgentRow>();
  for (const [role, rows] of grouped.entries()) {
    const sorted = [...rows].sort((a, b) => {
      const aState = String(a.state || "").toLowerCase();
      const bState = String(b.state || "").toLowerCase();
      const stateWeight = (state: string) => {
        if (state === "running") return 0;
        if (state === "idle") return 1;
        if (state === "stale") return 2;
        return 3;
      };
      const stateDelta = stateWeight(aState) - stateWeight(bState);
      if (stateDelta !== 0) return stateDelta;
      const healthWeight = (health: string) => {
        if (health === "up") return 0;
        if (health === "degraded") return 1;
        return 2;
      };
      const healthDelta = healthWeight(String(a.health || "").toLowerCase()) - healthWeight(String(b.health || "").toLowerCase());
      if (healthDelta !== 0) return healthDelta;
      const loadDelta = Number(a.current_load || 0) - Number(b.current_load || 0);
      if (loadDelta !== 0) return loadDelta;
      return toEpoch(b.updated_at_utc) - toEpoch(a.updated_at_utc);
    });
    if (sorted[0]) map.set(role, sorted[0]);
  }
  return map;
}

function materialHash(state: OfficePresenceState): string {
  return JSON.stringify({
    assignee_rows: state.assignee_rows.map((row) => ({
      assignee: row.assignee,
      state: row.state,
      source: row.source,
      online: row.online,
      stale: row.stale,
      health: row.health,
      demand_total: row.demand_total,
      open_count: row.open_count,
      in_progress_count: row.in_progress_count,
      paused_count: row.paused_count,
      done_count: row.done_count
    })),
    identity_rows: state.identity_rows.map((row) => ({
      office_id: row.office_id,
      identity: row.identity,
      resolved_agent_id: row.resolved_agent_id,
      state: row.state,
      source: row.source,
      online: row.online,
      stale: row.stale
    })),
    office_rows: state.office_rows.map((row) => ({
      office_id: row.office_id,
      state: row.state,
      source: row.source,
      online: row.online,
      stale: row.stale,
      health: row.health,
      demand_total: row.demand_total
    }))
  });
}

export function defaultOfficePresenceState(): OfficePresenceState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    assignee_rows: [],
    identity_rows: [],
    office_rows: []
  };
}

export function sanitizeOfficePresenceState(input: unknown): OfficePresenceState {
  if (!input || typeof input !== "object") return defaultOfficePresenceState();
  const obj = input as Record<string, unknown>;
  const assigneeRowsRaw = Array.isArray(obj.assignee_rows) ? obj.assignee_rows : [];
  const identityRowsRaw = Array.isArray(obj.identity_rows) ? obj.identity_rows : [];
  const officeRowsRaw = Array.isArray(obj.office_rows) ? obj.office_rows : [];
  const updated = toEpoch(obj.updated_at_utc) > 0 ? new Date(toEpoch(obj.updated_at_utc)).toISOString() : nowUtc();

  const assignee_rows = assigneeRowsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const assignee = String(row.assignee || "").trim().toUpperCase() as QueueAssignee;
      if (assignee !== "STAFF" && assignee !== "CPP" && assignee !== "CPP-IA") return null;
      return {
        assignee,
        role: String(row.role || assignee).trim().toUpperCase(),
        state: normalizePresenceState(row.state),
        source: normalizePresenceSource(row.source),
        label: clampText(row.label, 80) || presenceLabel(normalizePresenceState(row.state)),
        online: row.online === true,
        stale: row.stale === true,
        health: normalizeHealth(row.health),
        open_count: clampInt(row.open_count, 0, 0, 999999),
        in_progress_count: clampInt(row.in_progress_count, 0, 0, 999999),
        paused_count: clampInt(row.paused_count, 0, 0, 999999),
        done_count: clampInt(row.done_count, 0, 0, 999999),
        current_load: clampInt(row.current_load, 0, 0, 999999),
        max_concurrency: clampInt(row.max_concurrency, 1, 1, 999999),
        demand_total: clampInt(row.demand_total, 0, 0, 999999),
        last_activity_at_utc: toEpoch(row.last_activity_at_utc) > 0 ? new Date(toEpoch(row.last_activity_at_utc)).toISOString() : updated,
        updated_at_utc: toEpoch(row.updated_at_utc) > 0 ? new Date(toEpoch(row.updated_at_utc)).toISOString() : updated
      } satisfies PresenceAssigneeRow;
    })
    .filter((row): row is PresenceAssigneeRow => Boolean(row))
    .slice(0, 20);

  const identity_rows = identityRowsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const identity = clampText(row.identity, 80).toLowerCase();
      if (!identity) return null;
      return {
        office_id: clampText(row.office_id, 32).toUpperCase(),
        identity,
        resolved_agent_id: clampText(row.resolved_agent_id, 80).toLowerCase(),
        role: clampText(row.role, 32).toUpperCase(),
        state: normalizePresenceState(row.state),
        source: normalizePresenceSource(row.source),
        label: clampText(row.label, 80) || presenceLabel(normalizePresenceState(row.state)),
        online: row.online === true,
        stale: row.stale === true,
        health: normalizeHealth(row.health),
        last_activity_at_utc: toEpoch(row.last_activity_at_utc) > 0 ? new Date(toEpoch(row.last_activity_at_utc)).toISOString() : updated,
        updated_at_utc: toEpoch(row.updated_at_utc) > 0 ? new Date(toEpoch(row.updated_at_utc)).toISOString() : updated
      } satisfies PresenceIdentityRow;
    })
    .filter((row): row is PresenceIdentityRow => Boolean(row))
    .slice(0, 5000);

  const office_rows = officeRowsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const office_id = clampText(row.office_id, 32).toUpperCase();
      if (!office_id) return null;
      return {
        office_id,
        state: normalizePresenceState(row.state),
        source: normalizePresenceSource(row.source),
        label: clampText(row.label, 80) || presenceLabel(normalizePresenceState(row.state)),
        online: row.online === true,
        stale: row.stale === true,
        health: normalizeHealth(row.health),
        members_total: clampInt(row.members_total, 0, 0, 999999),
        open_count: clampInt(row.open_count, 0, 0, 999999),
        in_progress_count: clampInt(row.in_progress_count, 0, 0, 999999),
        paused_count: clampInt(row.paused_count, 0, 0, 999999),
        done_count: clampInt(row.done_count, 0, 0, 999999),
        demand_total: clampInt(row.demand_total, 0, 0, 999999),
        last_activity_at_utc: toEpoch(row.last_activity_at_utc) > 0 ? new Date(toEpoch(row.last_activity_at_utc)).toISOString() : updated,
        updated_at_utc: toEpoch(row.updated_at_utc) > 0 ? new Date(toEpoch(row.updated_at_utc)).toISOString() : updated
      } satisfies PresenceOfficeRow;
    })
    .filter((row): row is PresenceOfficeRow => Boolean(row))
    .slice(0, 1000);

  return {
    version: "1.0",
    updated_at_utc: updated,
    assignee_rows,
    identity_rows,
    office_rows
  };
}

function computeAssigneeRows(
  queueState: QueueState,
  agentState: AgentRegistryState,
  prevState: OfficePresenceState,
  options: PresenceComputeOptions,
  nowIso: string
): PresenceAssigneeRow[] {
  const nowEpoch = toEpoch(nowIso);
  const rows: PresenceAssigneeRow[] = [];
  const assignees: QueueAssignee[] = ["STAFF", "CPP", "CPP-IA"];
  const prevByAssignee = new Map(prevState.assignee_rows.map((row) => [row.assignee, row] as const));

  for (const assignee of assignees) {
    const queueRows = queueState.rows.filter((row) => row.assignee === assignee);
    const open_count = queueRows.filter((row) => row.status === "open").length;
    const in_progress_count = queueRows.filter((row) => row.status === "in_progress").length;
    const paused_count = queueRows.filter((row) => row.status === "paused_waiting_owner").length;
    const done_count = queueRows.filter((row) => row.status === "done").length;
    const demand_total = open_count + in_progress_count;

    const roleAgents = agentState.rows.filter((row) => String(row.role || "").trim().toUpperCase() === assignee);
    const healthy = assignee === "STAFF" || roleAgents.some((row) => row.state === "idle" || row.state === "running");
    const stale = roleAgents.some((row) => row.state === "stale");
    const current_load = roleAgents.reduce((sum, row) => sum + Math.max(0, Number(row.current_load || 0)), 0);
    const max_concurrency = Math.max(1, roleAgents.reduce((sum, row) => sum + Math.max(1, Number(row.max_concurrency || 1)), 0));
    const roleHealth = roleAgents.length === 0
      ? "down"
      : roleAgents.some((row) => String(row.health || "").toLowerCase() === "down")
        ? "down"
        : roleAgents.some((row) => String(row.health || "").toLowerCase() === "degraded")
          ? "degraded"
          : "up";
    const health: "up" | "degraded" | "down" =
      assignee === "STAFF" ? "up" : (healthy ? "up" : stale ? "degraded" : roleHealth);

    const queueActivityIso = queueRows
      .map((row) => (toEpoch(row.updated_at_utc) > 0 ? row.updated_at_utc : row.created_at_utc))
      .sort((a, b) => toEpoch(b) - toEpoch(a))[0] || "";
    const heartbeatIso = roleAgents
      .map((row) => String(row.last_heartbeat_at_utc || row.updated_at_utc || ""))
      .sort((a, b) => toEpoch(b) - toEpoch(a))[0] || "";
    const prev = prevByAssignee.get(assignee);
    const last_activity_at_utc = coalesceActivity(String(prev?.last_activity_at_utc || ""), queueActivityIso, heartbeatIso);
    const idleMin = Math.max(0, Math.round((nowEpoch - toEpoch(last_activity_at_utc)) / 60000));

    let state: PresenceState = "STANDBY";
    let source: PresenceSource = "policy";
    let online = false;
    let staleFlag = false;

    if (in_progress_count > 0) {
      if (healthy) {
        state = "EXECUTING";
        source = "queue";
        online = true;
      } else {
        state = "DEGRADED";
        source = "heartbeat";
        online = false;
        staleFlag = stale;
      }
    } else if (demand_total > 0) {
      if (healthy) {
        state = "READY";
        source = "queue";
        online = true;
      } else {
        state = "DEGRADED";
        source = "heartbeat";
        online = false;
        staleFlag = stale;
      }
    } else if (paused_count > 0) {
      state = "AWAITING_OWNER";
      source = "queue";
      online = false;
    } else if (done_count > 0) {
      if (idleMin <= options.awaiting_next_min) {
        state = "AWAITING_NEXT";
        source = "queue";
        online = true;
      } else {
        state = "STANDBY";
        source = "policy";
        online = false;
      }
    } else if (healthy && idleMin <= options.standby_after_min) {
      state = "IDLE";
      source = roleAgents.length > 0 ? "heartbeat" : "policy";
      online = true;
    } else {
      state = "STANDBY";
      source = "policy";
      online = false;
      staleFlag = false;
    }

    rows.push({
      assignee,
      role: assignee,
      state,
      source,
      label: presenceLabel(state),
      online,
      stale: staleFlag,
      health,
      open_count,
      in_progress_count,
      paused_count,
      done_count,
      current_load,
      max_concurrency,
      demand_total,
      last_activity_at_utc,
      updated_at_utc: nowIso
    });
  }

  return rows;
}

export function computeOfficePresenceState(input: {
  queueState: QueueState;
  agentState: AgentRegistryState;
  officeState: OfficeHierarchyState;
  previousState?: OfficePresenceState;
  options?: Partial<PresenceComputeOptions>;
  nowUtc?: string;
}): OfficePresenceState {
  const nowIso = String(input.nowUtc || nowUtc()).trim() || nowUtc();
  const options: PresenceComputeOptions = {
    standby_after_min: Math.max(5, Math.min(480, Number(input.options?.standby_after_min ?? DEFAULT_OPTIONS.standby_after_min))),
    awaiting_next_min: Math.max(5, Math.min(480, Number(input.options?.awaiting_next_min ?? DEFAULT_OPTIONS.awaiting_next_min)))
  };
  const previousState = input.previousState ? sanitizeOfficePresenceState(input.previousState) : defaultOfficePresenceState();
  const agentById = new Map(
    input.agentState.rows.map((row) => [String(row.agent_id || "").trim().toLowerCase(), row] as const).filter((entry) => entry[0])
  );
  const bestByRole = bestRoleAgentMap(input.agentState);
  const assigneeRows = computeAssigneeRows(input.queueState, input.agentState, previousState, options, nowIso);
  const assigneeById = new Map(assigneeRows.map((row) => [row.assignee, row] as const));

  const identityRows: PresenceIdentityRow[] = [];
  for (const office of input.officeState.rows) {
    const office_id = String(office.office_id || "").trim().toUpperCase();
    if (!office_id) continue;
    const identities = [
      String(office.leader_id || "").trim().toLowerCase(),
      ...(Array.isArray(office.subordinate_ids) ? office.subordinate_ids : []).map((item) => String(item || "").trim().toLowerCase())
    ].filter(Boolean);
    const uniqueIdentities = Array.from(new Set(identities));

    for (const identity of uniqueIdentities) {
      const exact = agentById.get(identity);
      const role = roleFromIdentity(identity, agentById);
      const assignee = assigneeFromRole(role);
      const assigneePresence = assigneeById.get(assignee);
      const fallbackAgent = bestByRole.get(role);
      const resolved_agent_id = String(exact?.agent_id || fallbackAgent?.agent_id || "").trim().toLowerCase();
      const source: PresenceSource = exact ? "heartbeat" : assigneePresence ? "role_fallback" : "unknown";
      const state: PresenceState = assigneePresence?.state || (exact ? "IDLE" : "STANDBY");
      const health: "up" | "degraded" | "down" =
        assigneePresence?.health ||
        (exact ? normalizeHealth(exact.health) : "down");
      const online = assigneePresence ? assigneePresence.online : Boolean(exact && exact.state !== "down");
      const stale = assigneePresence ? assigneePresence.stale : Boolean(exact && exact.state === "stale");
      const last_activity_at_utc = assigneePresence?.last_activity_at_utc || String(exact?.updated_at_utc || exact?.last_heartbeat_at_utc || nowIso);

      identityRows.push({
        office_id,
        identity,
        resolved_agent_id,
        role,
        state,
        source,
        label: presenceLabel(state),
        online,
        stale,
        health,
        last_activity_at_utc,
        updated_at_utc: nowIso
      });
    }
  }

  const officeRows: PresenceOfficeRow[] = [];
  for (const office of input.officeState.rows) {
    const office_id = String(office.office_id || "").trim().toUpperCase();
    if (!office_id) continue;
    const members = identityRows.filter((row) => row.office_id === office_id);
    const members_total = members.length;
    const sortedStates = members
      .map((row) => row.state)
      .sort((a, b) => PRESENCE_STATE_ORDER[a] - PRESENCE_STATE_ORDER[b]);
    const state: PresenceState = sortedStates[0] || "STANDBY";
    const firstMember = members[0] || null;
    const source: PresenceSource =
      members.find((row) => row.state === state)?.source ||
      (firstMember?.source || "policy");
    const online = members.some((row) => row.online);
    const stale = members.some((row) => row.stale);
    const health: "up" | "degraded" | "down" = members.some((row) => row.health === "down")
      ? "down"
      : members.some((row) => row.health === "degraded")
        ? "degraded"
        : "up";
    const roles = Array.from(new Set(members.map((row) => assigneeFromRole(row.role))));
    const open_count = roles.reduce((sum, role) => sum + (assigneeById.get(role)?.open_count || 0), 0);
    const in_progress_count = roles.reduce((sum, role) => sum + (assigneeById.get(role)?.in_progress_count || 0), 0);
    const paused_count = roles.reduce((sum, role) => sum + (assigneeById.get(role)?.paused_count || 0), 0);
    const done_count = roles.reduce((sum, role) => sum + (assigneeById.get(role)?.done_count || 0), 0);
    const demand_total = roles.reduce((sum, role) => sum + (assigneeById.get(role)?.demand_total || 0), 0);
    const lastActivityEpoch = members.reduce((max, row) => Math.max(max, toEpoch(row.last_activity_at_utc)), 0);

    officeRows.push({
      office_id,
      state,
      source,
      label: presenceLabel(state),
      online,
      stale,
      health,
      members_total,
      open_count,
      in_progress_count,
      paused_count,
      done_count,
      demand_total,
      last_activity_at_utc: lastActivityEpoch > 0 ? new Date(lastActivityEpoch).toISOString() : nowIso,
      updated_at_utc: nowIso
    });
  }

  return {
    version: "1.0",
    updated_at_utc: nowIso,
    assignee_rows: assigneeRows,
    identity_rows: identityRows,
    office_rows: officeRows
  };
}

export async function recomputeAndPersistOfficePresence(
  config: GovhubSnapshotConfig,
  input: {
    actor: string;
    sourceRef: string;
    queueState?: QueueState;
    agentState?: AgentRegistryState;
    officeState?: OfficeHierarchyState;
    forcePersist?: boolean;
    options?: Partial<PresenceComputeOptions>;
  }
): Promise<{
  status: "ok" | "upstream_error";
  changed: boolean;
  persisted: boolean;
  snapshot_type: string;
  payload_sha256: string | null;
  state: OfficePresenceState;
}> {
  const [queueLoaded, agentsLoaded, officeLoaded, previousLoaded] = await Promise.all([
    input.queueState
      ? Promise.resolve({ found: true, payload: input.queueState, payload_sha256: "" })
      : loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE),
    input.agentState
      ? Promise.resolve({ found: true, payload: input.agentState, payload_sha256: "" })
      : loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE),
    input.officeState
      ? Promise.resolve({ found: true, payload: input.officeState, payload_sha256: "" })
      : loadSnapshotPayload(config, OFFICE_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, PRESENCE_SNAPSHOT_TYPE)
  ]);

  const queueState =
    queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
  const agentState =
    agentsLoaded.found && agentsLoaded.payload ? sanitizeAgentRegistryState(agentsLoaded.payload) : defaultAgentRegistryState();
  const officeState =
    officeLoaded.found && officeLoaded.payload ? sanitizeOfficeHierarchyState(officeLoaded.payload) : defaultOfficeHierarchyState();
  const previousState =
    previousLoaded.found && previousLoaded.payload ? sanitizeOfficePresenceState(previousLoaded.payload) : defaultOfficePresenceState();

  const nextState = computeOfficePresenceState({
    queueState,
    agentState,
    officeState,
    previousState,
    ...(input.options ? { options: input.options } : {})
  });

  const changed = materialHash(previousState) !== materialHash(nextState);
  const ageSec = Math.max(0, Math.round((Date.now() - toEpoch(previousState.updated_at_utc)) / 1000));
  const shouldPersist = input.forcePersist === true || changed || ageSec >= PRESENCE_MIN_PERSIST_SEC;
  if (!shouldPersist) {
    return {
      status: "ok",
      changed,
      persisted: false,
      snapshot_type: PRESENCE_SNAPSHOT_TYPE,
      payload_sha256: previousLoaded.payload_sha256 || null,
      state: nextState
    };
  }

  const saved = await saveSnapshotPayload(config, {
    snapshotType: PRESENCE_SNAPSHOT_TYPE,
    payload: nextState,
    createdBy: clampText(input.actor, 120) || "system",
    sourceRepo: "gov-manager",
    sourceRef: clampText(input.sourceRef, 120) || "presence-engine"
  });

  return {
    status: saved.ok ? "ok" : "upstream_error",
    changed,
    persisted: saved.ok,
    snapshot_type: PRESENCE_SNAPSHOT_TYPE,
    payload_sha256: saved.payload_sha256 || null,
    state: nextState
  };
}
