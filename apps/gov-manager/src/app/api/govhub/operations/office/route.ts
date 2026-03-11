import { NextResponse } from "next/server";
import { loadSnapshotPayload, resolveGovhubSnapshotConfig, saveSnapshotPayload } from "../../../../../core/govhub-snapshots";
import { defaultAgentRegistryState, sanitizeAgentRegistryState, upsertAgentRow } from "../../../../../core/agent-registry";
import { sanitizeGovManagerUserState } from "../../../../../core/gov-manager-users";
import { defaultOfficeHierarchyState, moveOfficeIdentity, normalizeOfficeId, sanitizeOfficeHierarchyState, upsertOfficeNode } from "../../../../../core/office-hierarchy";
import { createQueueId, defaultQueueState, sanitizeQueueState, upsertQueueItems, type QueuePriority } from "../../../../../core/execution-queue";
import { requireRole } from "../../../../../core/rbac";
import { recordAuditEvent } from "../../../../../core/audit-store";

const OFFICE_SNAPSHOT_TYPE = String(process.env.GOVHUB_OFFICE_SNAPSHOT_TYPE || "gov_manager_office_hierarchy_v1").trim();
const AGENTS_SNAPSHOT_TYPE = String(process.env.GOVHUB_AGENT_REGISTRY_SNAPSHOT_TYPE || "gov_manager_agent_registry_v1").trim();
const USERS_SNAPSHOT_TYPE = String(process.env.GOVHUB_USERS_SNAPSHOT_TYPE || "gov_manager_users_v1").trim();
const QUEUE_SNAPSHOT_TYPE = String(process.env.GOVHUB_EXECUTION_QUEUE_SNAPSHOT_TYPE || "gov_manager_execution_queue_v1").trim();

function clampText(value: unknown, max = 120): string {
  return String(value || "").trim().slice(0, max);
}

function toBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "sim", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não", "off"].includes(normalized)) return false;
  return fallback;
}

function nowUtc(): string {
  return new Date().toISOString();
}

function sanitizeIdentityList(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      rows
        .map((item) => clampText(item, 80).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 250);
}

function normalizeRole(value: unknown): "STAFF" | "CPP" | "CPP-IA" {
  const clean = clampText(value, 24).toUpperCase();
  if (clean === "STAFF" || clean === "CPP" || clean === "CPP-IA") return clean;
  return "STAFF";
}

function normalizeRoleKey(value: unknown): string {
  const normalized = String(value || "").trim().toUpperCase().replace(/_/g, "-");
  if (!normalized) return "";
  if (normalized.includes("CPP-IA") || normalized.includes("IC-EXECUTOR")) return "CPP-IA";
  if (normalized.includes("CPP") || normalized.includes("ORCHESTRATOR")) return "CPP";
  if (normalized.includes("STAFF")) return "STAFF";
  if (normalized.includes("PRINCIPAL") || normalized.includes("P-ARQ")) return "PRINCIPAL_ARCHITECT";
  if (normalized.includes("REVIEWER") || normalized.includes("ADMIN")) return "REVIEWER";
  if (normalized.includes("OWNER")) return "OWNER";
  return normalized;
}

function officeRoleAllowed(officeIdRaw: unknown, roleRaw: unknown): boolean {
  const officeId = String(officeIdRaw || "").trim().toUpperCase();
  const role = normalizeRoleKey(roleRaw);
  if (!officeId || !role) return false;
  if (officeId === "P-ARQ") return role === "PRINCIPAL_ARCHITECT" || role === "STAFF" || role === "REVIEWER" || role === "OWNER";
  if (officeId === "STAFF") return role === "STAFF" || role === "CPP";
  if (officeId === "CPP") return role === "CPP" || role === "CPP-IA";
  if (officeId === "CPP-IA") return role === "CPP-IA";
  return true;
}

function officeRolePolicyLabel(officeIdRaw: unknown): string {
  const officeId = String(officeIdRaw || "").trim().toUpperCase();
  if (officeId === "P-ARQ") return "Principal Architect / Staff / Reviewer / Owner";
  if (officeId === "STAFF") return "Staff Engineer / Orchestrator Agent";
  if (officeId === "CPP") return "Orchestrator Agent / IC Executor";
  if (officeId === "CPP-IA") return "IC Executor";
  return "Cargo compatível";
}

function isQueuePriority(value: unknown): value is QueuePriority {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3";
}

type IdentityCatalog = {
  allowed: Set<string>;
  users: Set<string>;
  agentsByRole: Map<string, string[]>;
  agentRows: ReturnType<typeof sanitizeAgentRegistryState>["rows"];
  userRows: ReturnType<typeof sanitizeGovManagerUserState>["rows"];
};

function roleFromLegacyIdentity(identityRaw: string): string {
  const identity = clampText(identityRaw, 80).toLowerCase();
  if (!identity) return "";
  if (identity === "cpp" || identity.startsWith("adv-cpp-")) return "CPP";
  if (identity === "cpp-ia" || identity.startsWith("adv-cpp-ia-")) return "CPP-IA";
  if (identity === "staff" || identity.startsWith("adv-staff-")) return "STAFF";
  if (identity === "principal_architect" || identity.startsWith("adv-principal_architect-")) return "PRINCIPAL_ARCHITECT";
  if (identity === "orchestrator_agent") return "CPP";
  if (identity === "ic_executor") return "CPP-IA";
  if (identity === "staff_engineer") return "STAFF";
  return "";
}

function stateWeight(stateRaw: string): number {
  const state = String(stateRaw || "").trim().toLowerCase();
  if (state === "running") return 0;
  if (state === "idle") return 1;
  if (state === "stale") return 2;
  return 3;
}

function healthWeight(healthRaw: string): number {
  const health = String(healthRaw || "").trim().toLowerCase();
  if (health === "up") return 0;
  if (health === "degraded") return 1;
  return 2;
}

function pickCanonicalByRole(roleRaw: string, catalog: IdentityCatalog): string {
  const role = String(roleRaw || "").trim().toUpperCase();
  if (!role) return "";
  const byRole = catalog.agentsByRole.get(role) || [];
  if (byRole.length > 0) return byRole[0] || "";
  if (role === "PRINCIPAL_ARCHITECT" && catalog.users.has("principal_architect")) return "principal_architect";
  if (role === "STAFF" && catalog.users.has("staff")) return "staff";
  return "";
}

function mapIdentityToCanonical(identityRaw: string, catalog: IdentityCatalog): {
  resolved: string;
  strategy: "exact" | "role_fallback" | "unresolved";
  role: string;
} {
  const identity = clampText(identityRaw, 80).toLowerCase();
  if (!identity) {
    return { resolved: "", strategy: "unresolved", role: "" };
  }
  if (catalog.allowed.has(identity)) {
    return { resolved: identity, strategy: "exact", role: roleFromLegacyIdentity(identity) };
  }
  const role = roleFromLegacyIdentity(identity) || identity.toUpperCase();
  const resolved = pickCanonicalByRole(role, catalog);
  if (resolved) {
    return { resolved, strategy: "role_fallback", role };
  }
  return { resolved: identity, strategy: "unresolved", role };
}

async function loadIdentityCatalog(config: ReturnType<typeof resolveGovhubSnapshotConfig>): Promise<IdentityCatalog> {
  const [agentsLoaded, usersLoaded] = await Promise.all([
    loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE),
    loadSnapshotPayload(config, USERS_SNAPSHOT_TYPE)
  ]);

  const agentRows =
    agentsLoaded.found && agentsLoaded.payload ? sanitizeAgentRegistryState(agentsLoaded.payload).rows : [];
  const userRows = usersLoaded.found && usersLoaded.payload ? sanitizeGovManagerUserState(usersLoaded.payload).rows : [];

  const users = new Set<string>(
    userRows
      .map((row) => String(row.username || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const allowed = new Set<string>(["principal_architect", "staff", "admin", "owner"]);
  const agentsByRole = new Map<string, string[]>();

  for (const user of users) allowed.add(user);
  for (const row of agentRows) {
    const agentId = String(row.agent_id || "").trim().toLowerCase();
    const role = String(row.role || "").trim().toUpperCase();
    if (!agentId) continue;
    allowed.add(agentId);
    if (!role) continue;
    const list = agentsByRole.get(role) || [];
    list.push(agentId);
    agentsByRole.set(role, list);
  }

  for (const [role, ids] of agentsByRole.entries()) {
    const sorted = [...ids].sort((a, b) => {
      const aRow = agentRows.find((row) => String(row.agent_id || "").trim().toLowerCase() === a);
      const bRow = agentRows.find((row) => String(row.agent_id || "").trim().toLowerCase() === b);
      const aState = stateWeight(String(aRow?.state || ""));
      const bState = stateWeight(String(bRow?.state || ""));
      if (aState !== bState) return aState - bState;
      const aHealth = healthWeight(String(aRow?.health || ""));
      const bHealth = healthWeight(String(bRow?.health || ""));
      if (aHealth !== bHealth) return aHealth - bHealth;
      const aLoad = Number(aRow?.current_load || 0);
      const bLoad = Number(bRow?.current_load || 0);
      if (aLoad !== bLoad) return aLoad - bLoad;
      const aUpdated = Date.parse(String(aRow?.updated_at_utc || "")) || 0;
      const bUpdated = Date.parse(String(bRow?.updated_at_utc || "")) || 0;
      return bUpdated - aUpdated;
    });
    agentsByRole.set(role, sorted);
  }

  return { allowed, users, agentsByRole, agentRows, userRows };
}

async function loadIdentitySuggestions(config: ReturnType<typeof resolveGovhubSnapshotConfig>) {
  const catalog = await loadIdentityCatalog(config);

  const identities = Array.from(
    new Set(
      [
        "principal_architect",
        ...catalog.agentRows.map((row) => String(row.agent_id || "").trim().toLowerCase()),
        ...catalog.userRows.map((row) => String(row.username || "").trim().toLowerCase())
      ].filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  return { identities };
}

function resolveIdentityRole(identityRaw: unknown, catalog: IdentityCatalog): string {
  const identity = clampText(identityRaw, 80).toLowerCase();
  if (!identity) return "";

  const agentRole = catalog.agentRows.find((row) => String(row.agent_id || "").trim().toLowerCase() === identity)?.role;
  if (agentRole) {
    const normalized = normalizeRoleKey(agentRole);
    if (normalized) return normalized;
  }

  if (identity === "principal_architect") return "PRINCIPAL_ARCHITECT";
  if (identity === "staff") return "STAFF";
  if (identity === "owner") return "OWNER";
  if (identity === "admin") return "REVIEWER";

  const fromLegacy = normalizeRoleKey(roleFromLegacyIdentity(identity));
  if (fromLegacy) return fromLegacy;

  return "";
}

async function safeRecordAuditEvent(
  config: ReturnType<typeof resolveGovhubSnapshotConfig>,
  input: Parameters<typeof recordAuditEvent>[1]
): Promise<void> {
  try {
    await recordAuditEvent(config, input);
  } catch {
    // Non-blocking: audit failure must not break operational endpoint.
  }
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

  const loaded = await loadSnapshotPayload(config, OFFICE_SNAPSHOT_TYPE);
  const state = loaded.found && loaded.payload ? sanitizeOfficeHierarchyState(loaded.payload) : defaultOfficeHierarchyState();
  const suggestions = await loadIdentitySuggestions(config);

  return NextResponse.json(
    {
      status: "ok",
      snapshot_type: OFFICE_SNAPSHOT_TYPE,
      updated_at_utc: state.updated_at_utc,
      rows: state.rows,
      identities: suggestions.identities,
      payload_sha256: loaded.payload_sha256 || null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const auth = requireRole(request, "admin");
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
  const action = clampText(data.action, 40).toLowerCase();

  const officeLoaded = await loadSnapshotPayload(config, OFFICE_SNAPSHOT_TYPE);
  const officeState = officeLoaded.found && officeLoaded.payload ? sanitizeOfficeHierarchyState(officeLoaded.payload) : defaultOfficeHierarchyState();

  if (action === "upsert_node") {
    const officeId = normalizeOfficeId(data.office_id);
    const leaderId = clampText(data.leader_id, 80).toLowerCase();
    if (!leaderId) {
      return NextResponse.json({ status: "invalid_request", error_code: "LEADER_REQUIRED" }, { status: 400 });
    }
    const subordinateIds = sanitizeIdentityList(data.subordinate_ids);
    const catalog = await loadIdentityCatalog(config);
    const invalidIds = Array.from(
      new Set(
        [leaderId, ...subordinateIds]
          .map((item) => String(item || "").trim().toLowerCase())
          .filter((item) => item && !catalog.allowed.has(item))
      )
    );
    if (invalidIds.length > 0) {
      const suggestions = invalidIds
        .map((identity) => {
          const mapped = mapIdentityToCanonical(identity, catalog);
          if (mapped.strategy === "role_fallback" && mapped.resolved) {
            return { identity, suggested: mapped.resolved, strategy: mapped.strategy };
          }
          return { identity, suggested: null, strategy: mapped.strategy };
        })
        .slice(0, 20);
      return NextResponse.json(
        {
          status: "invalid_request",
          error_code: "AGENT_ID_INVALID",
          invalid_ids: invalidIds,
          suggestions
        },
        { status: 400 }
      );
    }
    const governanceViolations: Array<{ identity: string; role: string; office_id: string; policy: string }> = [];
    const roleMissing: string[] = [];
    for (const identity of Array.from(new Set([leaderId, ...subordinateIds]))) {
      const effectiveRole = resolveIdentityRole(identity, catalog);
      if (!effectiveRole) {
        roleMissing.push(identity);
        continue;
      }
      if (!officeRoleAllowed(officeId, effectiveRole)) {
        governanceViolations.push({
          identity,
          role: effectiveRole,
          office_id: officeId,
          policy: officeRolePolicyLabel(officeId)
        });
      }
    }
    if (governanceViolations.length > 0 || roleMissing.length > 0) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.upsert_node.denied",
        target: officeId.slice(0, 180),
        after_state: JSON.stringify({
          error_code: governanceViolations.length > 0 ? "OFFICE_ROLE_POLICY_VIOLATION" : "OFFICE_ROLE_UNRESOLVED",
          governance_violations: governanceViolations,
          role_missing: roleMissing
        }),
        correlation_id: `office-upsert-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json(
        {
          status: "invalid_request",
          error_code: governanceViolations.length > 0 ? "OFFICE_ROLE_POLICY_VIOLATION" : "OFFICE_ROLE_UNRESOLVED",
          office_id: officeId,
          governance_violations: governanceViolations.slice(0, 20),
          role_missing: roleMissing.slice(0, 20),
          policy: officeRolePolicyLabel(officeId)
        },
        { status: 409 }
      );
    }
    const previousNode = officeState.rows.find((row) => String(row.office_id || "").trim().toUpperCase() === officeId) || null;

    const nextState = upsertOfficeNode(officeState, {
      office_id: officeId,
      leader_id: leaderId,
      subordinate_ids: subordinateIds,
      updated_by: auth.session.username
    });

    const saved = await saveSnapshotPayload(config, {
      snapshotType: OFFICE_SNAPSHOT_TYPE,
      payload: nextState,
      createdBy: auth.session.username,
      sourceRepo: "gov-manager",
      sourceRef: "operations-office"
    });

    if (saved.ok) {
      const nextNode = nextState.rows.find((row) => String(row.office_id || "").trim().toUpperCase() === officeId) || null;
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.upsert_node",
        target: officeId.slice(0, 180),
        before_state: JSON.stringify(previousNode || {}),
        after_state: JSON.stringify(nextNode || {}),
        correlation_id: `office-upsert-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
    }

    return NextResponse.json(
      {
        status: saved.ok ? "ok" : "upstream_error",
        snapshot_type: OFFICE_SNAPSHOT_TYPE,
        office_id: officeId,
        rows: nextState.rows,
        govhub_http: saved.status,
        payload_sha256: saved.payload_sha256,
        govhub_response: saved.response
      },
      { status: saved.ok ? 200 : 502 }
    );
  }

  if (action === "normalize_identities") {
    const catalog = await loadIdentityCatalog(config);
    const now = nowUtc();
    const changes: Array<{
      office_id: string;
      field: "leader_id" | "subordinate_ids";
      from: string;
      to: string;
      strategy: "exact" | "role_fallback" | "unresolved";
      role: string;
    }> = [];
    const unresolved: string[] = [];

    const nextRows = officeState.rows.map((row) => {
      const officeId = String(row.office_id || "").trim().toUpperCase();
      const leaderRaw = String(row.leader_id || "").trim().toLowerCase();
      const leaderMapped = mapIdentityToCanonical(leaderRaw, catalog);
      const leaderId = leaderMapped.resolved || leaderRaw;
      if (leaderMapped.strategy === "unresolved") unresolved.push(leaderRaw);
      if (leaderId && leaderId !== leaderRaw) {
        changes.push({
          office_id: officeId,
          field: "leader_id",
          from: leaderRaw,
          to: leaderId,
          strategy: leaderMapped.strategy,
          role: leaderMapped.role
        });
      }

      const subsRaw = Array.isArray(row.subordinate_ids) ? row.subordinate_ids : [];
      const mappedSubs: string[] = [];
      for (const sub of subsRaw) {
        const subRaw = String(sub || "").trim().toLowerCase();
        if (!subRaw) continue;
        const mapped = mapIdentityToCanonical(subRaw, catalog);
        const subId = mapped.resolved || subRaw;
        if (mapped.strategy === "unresolved") unresolved.push(subRaw);
        if (subId && subId !== subRaw) {
          changes.push({
            office_id: officeId,
            field: "subordinate_ids",
            from: subRaw,
            to: subId,
            strategy: mapped.strategy,
            role: mapped.role
          });
        }
        if (subId && subId !== leaderId) mappedSubs.push(subId);
      }

      const subordinate_ids = Array.from(new Set(mappedSubs));
      return {
        ...row,
        leader_id: leaderId,
        subordinate_ids,
        updated_at_utc: now,
        updated_by: auth.session.username
      };
    });

    const nextState = sanitizeOfficeHierarchyState({
      version: "1.0",
      updated_at_utc: now,
      rows: nextRows
    });

    const saved = await saveSnapshotPayload(config, {
      snapshotType: OFFICE_SNAPSHOT_TYPE,
      payload: nextState,
      createdBy: auth.session.username,
      sourceRepo: "gov-manager",
      sourceRef: "operations-office"
    });

    if (!saved.ok) {
      return NextResponse.json(
        {
          status: "upstream_error",
          error_code: "OFFICE_SAVE_FAILED",
          govhub_http: saved.status,
          govhub_response: saved.response
        },
        { status: 502 }
      );
    }

    await safeRecordAuditEvent(config, {
      actor: auth.session.username,
      role: auth.session.role,
      action: "office.normalize_identities",
      target: "office-hierarchy".slice(0, 180),
      after_state: JSON.stringify({
        changed_count: changes.length,
        unresolved_count: Array.from(new Set(unresolved.filter(Boolean))).length
      }),
      correlation_id: `office-normalize-${Date.now()}`,
      source: "operations-office",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: "ok",
        action: "normalize_identities",
        changed_count: changes.length,
        changes: changes.slice(0, 200),
        unresolved: Array.from(new Set(unresolved.filter(Boolean))).slice(0, 100),
        rows: nextState.rows,
        payload_sha256: saved.payload_sha256
      },
      { status: 200 }
    );
  }

  if (action === "move_member") {
    const agentId = clampText(data.agent_id, 80).toLowerCase();
    const targetOfficeId = normalizeOfficeId(data.target_office_id);
    if (!agentId) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.move_member.denied",
        target: String(targetOfficeId || "UNKNOWN").slice(0, 180),
        after_state: JSON.stringify({ error_code: "AGENT_ID_REQUIRED" }),
        correlation_id: `office-move-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json({ status: "invalid_request", error_code: "AGENT_ID_REQUIRED" }, { status: 400 });
    }

    const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
    const agentsState = agentsLoaded.found && agentsLoaded.payload ? sanitizeAgentRegistryState(agentsLoaded.payload) : defaultAgentRegistryState();
    const agent = agentsState.rows.find((row) => String(row.agent_id || "").trim().toLowerCase() === agentId);
    if (!agent) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.move_member.denied",
        target: `${agentId}->${targetOfficeId}`.slice(0, 180),
        after_state: JSON.stringify({ error_code: "AGENT_NOT_FOUND" }),
        correlation_id: `office-move-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json({ status: "not_found", error_code: "AGENT_NOT_FOUND" }, { status: 404 });
    }
    const sourceOffice = officeState.rows.find((row) => {
      const leader = String(row.leader_id || "").trim().toLowerCase();
      if (leader === agentId) return true;
      const subs = Array.isArray(row.subordinate_ids) ? row.subordinate_ids : [];
      return subs.some((item) => String(item || "").trim().toLowerCase() === agentId);
    });
    const sourceOfficeId = String(sourceOffice?.office_id || "").trim().toUpperCase();
    if (sourceOfficeId && sourceOfficeId === targetOfficeId) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.move_member.denied",
        target: `${agentId}->${targetOfficeId}`.slice(0, 180),
        after_state: JSON.stringify({ error_code: "NO_CHANGE", source_office_id: sourceOfficeId }),
        correlation_id: `office-move-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json(
        { status: "conflict", error_code: "NO_CHANGE", message: "Agente já está no escritório alvo." },
        { status: 409 }
      );
    }
    if (sourceOffice && String(sourceOffice.leader_id || "").trim().toLowerCase() === agentId) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.move_member.denied",
        target: `${agentId}->${targetOfficeId}`.slice(0, 180),
        after_state: JSON.stringify({
          error_code: "LEADER_MOVE_FORBIDDEN",
          source_office_id: sourceOfficeId,
          message: "Líder de escritório não pode ser movido sem redefinir liderança."
        }),
        correlation_id: `office-move-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json(
        {
          status: "conflict",
          error_code: "LEADER_MOVE_FORBIDDEN",
          message: "Líder de escritório não pode ser movido sem redefinir liderança."
        },
        { status: 409 }
      );
    }
    const normalizedRole = normalizeRoleKey(agent.role);
    if (!officeRoleAllowed(targetOfficeId, normalizedRole)) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.move_member.denied",
        target: `${agentId}->${targetOfficeId}`.slice(0, 180),
        before_state: JSON.stringify({
          source_office_id: sourceOfficeId || null,
          role: normalizedRole || String(agent.role || "").trim().toUpperCase()
        }),
        after_state: JSON.stringify({
          error_code: "OFFICE_ROLE_POLICY_VIOLATION",
          target_office_id: targetOfficeId,
          policy: officeRolePolicyLabel(targetOfficeId)
        }),
        correlation_id: `office-move-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json(
        {
          status: "conflict",
          error_code: "OFFICE_ROLE_POLICY_VIOLATION",
          message: `Cargo ${normalizedRole || "-"} não compatível com ${targetOfficeId}. Regra: ${officeRolePolicyLabel(targetOfficeId)}.`,
          policy: officeRolePolicyLabel(targetOfficeId)
        },
        { status: 409 }
      );
    }
    if (String(agent.state || "").toLowerCase() === "running" || Number(agent.current_load || 0) > 0) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.move_member.denied",
        target: `${agentId}->${targetOfficeId}`.slice(0, 180),
        before_state: JSON.stringify({
          source_office_id: sourceOfficeId || null,
          role: normalizedRole || String(agent.role || "").trim().toUpperCase(),
          state: String(agent.state || "").toLowerCase(),
          current_load: Number(agent.current_load || 0)
        }),
        after_state: JSON.stringify({ error_code: "AGENT_BUSY" }),
        correlation_id: `office-move-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json(
        { status: "conflict", error_code: "AGENT_BUSY", message: "Agente em execução. Pause/conclua antes de mover." },
        { status: 409 }
      );
    }

    const moved = moveOfficeIdentity(officeState, {
      identity: agentId,
      target_office_id: targetOfficeId,
      updated_by: auth.session.username
    });
    if (!moved.ok) {
      await safeRecordAuditEvent(config, {
        actor: auth.session.username,
        role: auth.session.role,
        action: "office.move_member.denied",
        target: `${agentId}->${targetOfficeId}`.slice(0, 180),
        before_state: JSON.stringify({
          source_office_id: sourceOfficeId || null,
          role: normalizedRole || String(agent.role || "").trim().toUpperCase()
        }),
        after_state: JSON.stringify({ error_code: moved.error_code, message: moved.message }),
        correlation_id: `office-move-denied-${Date.now()}`,
        source: "operations-office",
        createdBy: auth.session.username
      });
      return NextResponse.json({ status: "conflict", error_code: moved.error_code, message: moved.message }, { status: 409 });
    }

    const saved = await saveSnapshotPayload(config, {
      snapshotType: OFFICE_SNAPSHOT_TYPE,
      payload: moved.next,
      createdBy: auth.session.username,
      sourceRepo: "gov-manager",
      sourceRef: "operations-office"
    });
    if (!saved.ok) {
      return NextResponse.json(
        { status: "upstream_error", error_code: "OFFICE_SAVE_FAILED", govhub_http: saved.status, govhub_response: saved.response },
        { status: 502 }
      );
    }

    await safeRecordAuditEvent(config, {
      actor: auth.session.username,
      role: auth.session.role,
      action: "office.move_member",
      target: `${agentId}->${targetOfficeId}`.slice(0, 180),
      before_state: JSON.stringify({
        from_office_id: moved.from_office_id,
        role: normalizedRole || String(agent.role || "").trim().toUpperCase()
      }),
      after_state: JSON.stringify({
        to_office_id: moved.to_office_id,
        policy_validated: true
      }),
      correlation_id: `office-move-${Date.now()}`,
      source: "operations-office",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: "ok",
        snapshot_type: OFFICE_SNAPSHOT_TYPE,
        moved: {
          agent_id: agentId,
          from_office_id: moved.from_office_id || null,
          to_office_id: moved.to_office_id
        },
        rows: moved.next.rows,
        payload_sha256: saved.payload_sha256
      },
      { status: 200 }
    );
  }

  if (action === "request_onboarding") {
    const agentId = clampText(data.agent_id, 80).toLowerCase();
    if (!agentId) {
      return NextResponse.json({ status: "invalid_request", error_code: "AGENT_ID_REQUIRED" }, { status: 400 });
    }
    const role = normalizeRole(data.role);
    const targetOfficeId = normalizeOfficeId(data.office_id || (role === "STAFF" ? "STAFF" : "CPP"));
    const priority: QueuePriority = isQueuePriority(data.priority) ? data.priority : "P1";
    const notes = clampText(data.notes, 400);
    const ownerAckRequired = toBool(data.owner_ack_required, true);
    const now = nowUtc();

    const agentsLoaded = await loadSnapshotPayload(config, AGENTS_SNAPSHOT_TYPE);
    const agentsState = agentsLoaded.found && agentsLoaded.payload ? sanitizeAgentRegistryState(agentsLoaded.payload) : defaultAgentRegistryState();
    const exists = agentsState.rows.some((row) => String(row.agent_id || "").trim().toLowerCase() === agentId);
    if (exists) {
      return NextResponse.json(
        { status: "conflict", error_code: "AGENT_ALREADY_EXISTS", message: "Agente já cadastrado." },
        { status: 409 }
      );
    }

    const nextAgents = upsertAgentRow(agentsState, {
      agent_id: agentId,
      role,
      group: "office",
      capabilities: ["queue", "mission", "office"],
      created_at_utc: now,
      heartbeat_interval_sec: 30,
      max_concurrency: 1,
      current_load: 0,
      health: "down",
      last_heartbeat_at_utc: now,
      last_job_at_utc: now,
      state: "down",
      updated_at_utc: now
    });
    const saveAgent = await saveSnapshotPayload(config, {
      snapshotType: AGENTS_SNAPSHOT_TYPE,
      payload: nextAgents,
      createdBy: auth.session.username,
      sourceRepo: "gov-manager",
      sourceRef: "operations-office"
    });
    if (!saveAgent.ok) {
      return NextResponse.json(
        { status: "upstream_error", error_code: "AGENT_SAVE_FAILED", govhub_http: saveAgent.status, govhub_response: saveAgent.response },
        { status: 502 }
      );
    }

    const moved = moveOfficeIdentity(officeState, {
      identity: agentId,
      target_office_id: targetOfficeId,
      updated_by: auth.session.username
    });
    if (!moved.ok) {
      return NextResponse.json({ status: "conflict", error_code: moved.error_code, message: moved.message }, { status: 409 });
    }
    const saveOffice = await saveSnapshotPayload(config, {
      snapshotType: OFFICE_SNAPSHOT_TYPE,
      payload: moved.next,
      createdBy: auth.session.username,
      sourceRepo: "gov-manager",
      sourceRef: "operations-office"
    });
    if (!saveOffice.ok) {
      return NextResponse.json(
        {
          status: "upstream_error",
          error_code: "OFFICE_SAVE_FAILED",
          partial_applied: true,
          partial: { agent_registered: true, office_moved: false },
          govhub_http: saveOffice.status,
          govhub_response: saveOffice.response
        },
        { status: 502 }
      );
    }

    const queueLoaded = await loadSnapshotPayload(config, QUEUE_SNAPSHOT_TYPE);
    const queueState = queueLoaded.found && queueLoaded.payload ? sanitizeQueueState(queueLoaded.payload) : defaultQueueState();
    const missionProvided = clampText(data.mission_id, 120).toUpperCase();
    const stamp = now.replace(/[-:TZ.]/g, "").slice(0, 14);
    const missionId = missionProvided || `GOV-ONBOARD-${stamp}-${agentId.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 16)}`;
    const title = clampText(data.title, 180) || `Onboarding agente ${agentId}`;
    const description = `Solicitação de onboarding para ${agentId} (role ${role}) no escritório ${targetOfficeId}.${notes ? ` Notas: ${notes}` : ""}`;
    const queueStatus: "paused_waiting_owner" | "open" = ownerAckRequired ? "paused_waiting_owner" : "open";
    const queueItem = {
      queue_id: createQueueId(missionId, title, 1),
      mission_id: missionId,
      title,
      description,
      kind: "office_onboarding",
      priority,
      assignee: "STAFF" as const,
      status: queueStatus,
      created_at_utc: now,
      updated_at_utc: now
    };
    const nextQueue = upsertQueueItems(queueState, [queueItem]);
    const saveQueue = await saveSnapshotPayload(config, {
      snapshotType: QUEUE_SNAPSHOT_TYPE,
      payload: nextQueue,
      createdBy: auth.session.username,
      sourceRepo: "gov-manager",
      sourceRef: "operations-office"
    });
    if (!saveQueue.ok) {
      return NextResponse.json(
        {
          status: "upstream_error",
          error_code: "QUEUE_SAVE_FAILED",
          partial_applied: true,
          partial: { agent_registered: true, office_moved: true, queue_created: false },
          govhub_http: saveQueue.status,
          govhub_response: saveQueue.response
        },
        { status: 502 }
      );
    }

    await recordAuditEvent(config, {
      actor: auth.session.username,
      role: auth.session.role,
      action: "office.request_onboarding",
      target: `${agentId}|${missionId}`.slice(0, 180),
      after_state: JSON.stringify({
        role,
        office_id: targetOfficeId,
        mission_id: missionId,
        queue_id: queueItem.queue_id,
        queue_status: queueItem.status,
        owner_ack_required: ownerAckRequired
      }),
      correlation_id: `office-onboard-${Date.now()}`,
      source: "operations-office",
      createdBy: auth.session.username
    });

    return NextResponse.json(
      {
        status: "ok",
        action: "request_onboarding",
        office_id: targetOfficeId,
        agent_id: agentId,
        role,
        owner_ack_required: ownerAckRequired,
        mission_id: missionId,
        queue_item: queueItem,
        partial_applied: false,
        snapshots: {
          agents: saveAgent.payload_sha256,
          office: saveOffice.payload_sha256,
          queue: saveQueue.payload_sha256
        }
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      status: "invalid_request",
      error_code: "ACTION_NOT_SUPPORTED",
      allowed_actions: ["upsert_node", "move_member", "request_onboarding", "normalize_identities"]
    },
    { status: 400 }
  );
}
