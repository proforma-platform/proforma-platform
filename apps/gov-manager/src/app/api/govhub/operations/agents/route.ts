import { NextResponse } from "next/server";
import { resolveGovhubSnapshotConfig, loadSnapshotPayload, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import {
  defaultAgentRegistryState,
  deriveAgentState,
  hasHealthyAssigneeAgent,
  sanitizeAgentRegistryState,
  summarizeAgents,
  upsertAgentRow,
  type AgentRow,
  type AgentState
} from "../../../../../core/agent-registry";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";

const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();

function clampText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function normalizeRole(value: unknown): string {
  const clean = clampText(value, 24).toUpperCase();
  if (clean === "STAFF" || clean === "CPP" || clean === "CPP-IA") return clean;
  return clean || "WORKER";
}

function normalizeHealth(value: unknown): "up" | "degraded" | "down" {
  const clean = clampText(value, 16).toLowerCase();
  if (clean === "up" || clean === "degraded" || clean === "down") return clean;
  return "up";
}

function normalizeCapabilities(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : [];
  return Array.from(new Set(rows.map((row) => clampText(row, 40).toLowerCase()).filter(Boolean))).slice(0, 40);
}

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

function nowUtc(): string {
  return new Date().toISOString();
}

export async function GET(request: Request) {
  const auth = requireRole(request, "viewer");
  if (!auth.ok) {
    return NextResponse.json({ status: "unauthorized", error_code: auth.error_code }, { status: auth.status });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  const loaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeAgentRegistryState(loaded.payload) : defaultAgentRegistryState();

  const url = new URL(request.url);
  const roleFilter = clampText(url.searchParams.get("role"), 24).toUpperCase();
  const stateFilter = clampText(url.searchParams.get("state"), 24).toLowerCase();
  const rows = state.rows.filter((row) => {
    if (roleFilter && String(row.role || "").toUpperCase() !== roleFilter) return false;
    if (stateFilter && String(row.state || "").toLowerCase() !== stateFilter) return false;
    return true;
  });

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: AGENTS_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
      summary: summarizeAgents({ ...state, rows }),
      rows,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const auth = requireRole(request, "engineer");
  if (!auth.ok) {
    return NextResponse.json({ status: "forbidden", error_code: auth.error_code }, { status: auth.status });
  }

  const config = resolveGovhubSnapshotConfig();
  if (!config.baseUrl || !config.token) {
    return NextResponse.json(
      { status: "misconfigured", error_code: "GOVHUB_ENV_REQUIRED", message: "GOVHUB_BASE_URL and GOVHUB_TOKEN are required" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_request", error_code: "JSON_INVALID" }, { status: 400 });
  }

  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = clampText(data.action, 40).toLowerCase() || "heartbeat";
  const agentId = clampText(data.agent_id, 80);
  if (!agentId) {
    return NextResponse.json({ status: "invalid_request", error_code: "AGENT_ID_REQUIRED" }, { status: 400 });
  }

  const loaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
  const base = loaded.found && loaded.payload ? sanitizeAgentRegistryState(loaded.payload) : defaultAgentRegistryState();
  const current = base.rows.find((row) => row.agent_id === agentId);
  const now = nowUtc();

  const baseRow: AgentRow = current || {
    agent_id: agentId,
    role: normalizeRole(data.role),
    group: clampText(data.group, 40) || "default",
    capabilities: normalizeCapabilities(data.capabilities),
    heartbeat_interval_sec: toInt(data.heartbeat_interval_sec, 30, 5, 3600),
    max_concurrency: toInt(data.max_concurrency, 1, 1, 200),
    current_load: 0,
    health: "up",
    last_heartbeat_at_utc: now,
    last_job_at_utc: now,
    state: "idle",
    updated_at_utc: now
  };

  let next: AgentRow;
  if (action === "register") {
    next = {
      ...baseRow,
      role: normalizeRole(data.role || baseRow.role),
      group: clampText(data.group, 40) || baseRow.group,
      capabilities: normalizeCapabilities(data.capabilities || baseRow.capabilities),
      heartbeat_interval_sec: toInt(data.heartbeat_interval_sec, baseRow.heartbeat_interval_sec, 5, 3600),
      max_concurrency: toInt(data.max_concurrency, baseRow.max_concurrency, 1, 200),
      current_load: toInt(data.current_load, baseRow.current_load, 0, 999),
      health: normalizeHealth(data.health || baseRow.health),
      last_heartbeat_at_utc: now,
      updated_at_utc: now,
      state: "idle"
    };
  } else if (action === "heartbeat") {
    next = {
      ...baseRow,
      current_load: toInt(data.current_load, baseRow.current_load, 0, 999),
      health: normalizeHealth(data.health || baseRow.health),
      last_heartbeat_at_utc: now,
      updated_at_utc: now,
      state: "idle"
    };
  } else if (action === "set_job") {
    const mode = clampText(data.mode, 20).toLowerCase() || "start";
    const load = mode === "finish" ? 0 : toInt(data.current_load, 1, 0, 999);
    next = {
      ...baseRow,
      current_load: load,
      health: normalizeHealth(data.health || baseRow.health),
      last_job_at_utc: now,
      last_heartbeat_at_utc: now,
      updated_at_utc: now,
      state: load > 0 ? "running" : "idle"
    };
  } else if (action === "set_health") {
    next = {
      ...baseRow,
      health: normalizeHealth(data.health),
      last_heartbeat_at_utc: now,
      updated_at_utc: now,
      state: "idle"
    };
  } else {
    return NextResponse.json(
      { status: "invalid_request", error_code: "ACTION_NOT_SUPPORTED", allowed_actions: ["register", "heartbeat", "set_job", "set_health"] },
      { status: 400 }
    );
  }

  const derivedState: AgentState = deriveAgentState(next);
  next = { ...next, state: derivedState, updated_at_utc: now };

  const nextState = upsertAgentRow(base, next);
  const saved = await saveSnapshotPayload(config, {
    snapshotType: AGENTS_SNAPSHOT_TYPE,
    payload: nextState,
    createdBy: auth.session.username,
    sourceRepo: "gov-manager",
    sourceRef: "operations-agents"
  });

  await recordAuditEvent(config, {
    actor: auth.session.username,
    role: auth.session.role,
    action: `agents.${action}`,
    target: agentId,
    before_state: current ? JSON.stringify({ state: current.state, load: current.current_load, health: current.health }) : "",
    after_state: JSON.stringify({ state: next.state, load: next.current_load, health: next.health }),
    correlation_id: `${agentId}-${Date.now()}`,
    source: "operations-agents",
    createdBy: auth.session.username
  });

  return NextResponse.json(
    {
      status: saved.ok ? "ok" : "upstream_error",
      govhub_http: saved.status,
      snapshot_type: AGENTS_SNAPSHOT_TYPE,
      row: next,
      summary: summarizeAgents(nextState),
      has_healthy_worker_for_role: hasHealthyAssigneeAgent(nextState, next.role),
      payload_sha256: saved.payload_sha256,
      govhub_response: saved.response
    },
    { status: saved.ok ? 200 : 502 }
  );
}
