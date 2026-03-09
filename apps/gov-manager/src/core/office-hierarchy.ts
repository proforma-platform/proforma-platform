export type OfficeId = string;

export interface OfficeNode {
  office_id: OfficeId;
  leader_id: string;
  subordinate_ids: string[];
  updated_at_utc: string;
  updated_by: string;
}

export interface OfficeHierarchyState {
  version: "1.0";
  updated_at_utc: string;
  rows: OfficeNode[];
}

const DEFAULT_OFFICES: OfficeNode[] = [
  {
    office_id: "P-ARQ",
    leader_id: "principal_architect",
    subordinate_ids: ["staff"],
    updated_at_utc: "",
    updated_by: "system"
  },
  {
    office_id: "STAFF",
    leader_id: "staff",
    subordinate_ids: [],
    updated_at_utc: "",
    updated_by: "system"
  },
  {
    office_id: "CPP",
    leader_id: "staff",
    subordinate_ids: [],
    updated_at_utc: "",
    updated_by: "system"
  }
];

function nowUtc(): string {
  return new Date().toISOString();
}

function trimText(value: unknown, max = 120): string {
  return String(value || "").trim().slice(0, max);
}

export function normalizeOfficeId(value: unknown): OfficeId {
  const clean = trimText(value, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!clean) return "STAFF";
  if (clean === "PARQ" || clean === "P_ARQ" || clean === "PRINCIPAL_ARCHITECT") return "P-ARQ";
  return clean;
}

function sortOfficeRows(rows: OfficeNode[]): OfficeNode[] {
  const priority = new Map<string, number>([
    ["P-ARQ", 0],
    ["STAFF", 1],
    ["CPP", 2]
  ]);
  return [...rows].sort((a, b) => {
    const aId = String(a.office_id || "").toUpperCase();
    const bId = String(b.office_id || "").toUpperCase();
    const aPriority = priority.get(aId) ?? 100;
    const bPriority = priority.get(bId) ?? 100;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return aId.localeCompare(bId);
  });
}

export function defaultOfficeHierarchyState(): OfficeHierarchyState {
  const now = nowUtc();
  return {
    version: "1.0",
    updated_at_utc: now,
    rows: DEFAULT_OFFICES.map((row) => ({
      ...row,
      updated_at_utc: now
    }))
  };
}

function sanitizeIdentityList(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      rows
        .map((item) => trimText(item, 80).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 200);
}

export function sanitizeOfficeHierarchyState(input: unknown): OfficeHierarchyState {
  const base = defaultOfficeHierarchyState();
  if (!input || typeof input !== "object") return base;
  const obj = input as Record<string, unknown>;
  const rawRows = Array.isArray(obj.rows) ? obj.rows : [];
  if (rawRows.length === 0) return base;

  const rows = rawRows.reduce<OfficeNode[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const row = item as Record<string, unknown>;
    const officeId = normalizeOfficeId(row.office_id);
    const leaderId = trimText(row.leader_id, 80).toLowerCase();
    if (!leaderId) return acc;
    const subordinateIds = sanitizeIdentityList(row.subordinate_ids).filter((id) => id !== leaderId);
    acc.push({
      office_id: officeId,
      leader_id: leaderId,
      subordinate_ids: subordinateIds,
      updated_at_utc: trimText(row.updated_at_utc, 64) || nowUtc(),
      updated_by: trimText(row.updated_by, 120) || "system"
    });
    return acc;
  }, []);

  if (rows.length === 0) return base;
  const byOffice = new Map<OfficeId, OfficeNode>();
  for (const row of rows) byOffice.set(row.office_id, row);
  for (const row of DEFAULT_OFFICES) {
    if (!byOffice.has(row.office_id)) {
      byOffice.set(row.office_id, {
        ...row,
        updated_at_utc: nowUtc(),
        updated_by: "system"
      });
    }
  }
  const mergedRows = sortOfficeRows(Array.from(byOffice.values()));

  return {
    version: "1.0",
    updated_at_utc: trimText(obj.updated_at_utc, 64) || nowUtc(),
    rows: mergedRows
  };
}

export function upsertOfficeNode(
  state: OfficeHierarchyState,
  input: { office_id: OfficeId; leader_id: string; subordinate_ids: string[]; updated_by: string }
): OfficeHierarchyState {
  const now = nowUtc();
  const normalizedLeader = trimText(input.leader_id, 80).toLowerCase();
  const normalizedSubs = sanitizeIdentityList(input.subordinate_ids).filter((id) => id !== normalizedLeader);
  const byOffice = new Map<OfficeId, OfficeNode>(state.rows.map((row) => [row.office_id, row]));
  byOffice.set(input.office_id, {
    office_id: input.office_id,
    leader_id: normalizedLeader,
    subordinate_ids: normalizedSubs,
    updated_at_utc: now,
    updated_by: trimText(input.updated_by, 120) || "system"
  });
  for (const row of DEFAULT_OFFICES) {
    if (!byOffice.has(row.office_id)) {
      byOffice.set(row.office_id, {
        ...row,
        updated_at_utc: now,
        updated_by: "system"
      });
    }
  }
  const rows = sortOfficeRows(Array.from(byOffice.values()));

  return {
    version: "1.0",
    updated_at_utc: now,
    rows
  };
}

export function findOfficeForIdentity(state: OfficeHierarchyState, identity: string): string {
  const target = trimText(identity, 80).toLowerCase();
  if (!target) return "";
  for (const row of state.rows) {
    if (String(row.leader_id || "").trim().toLowerCase() === target) return row.office_id;
    if ((row.subordinate_ids || []).some((item) => String(item || "").trim().toLowerCase() === target)) return row.office_id;
  }
  return "";
}

export function isOfficeLeader(state: OfficeHierarchyState, identity: string): boolean {
  const target = trimText(identity, 80).toLowerCase();
  if (!target) return false;
  return state.rows.some((row) => String(row.leader_id || "").trim().toLowerCase() === target);
}

export function moveOfficeIdentity(
  state: OfficeHierarchyState,
  input: { identity: string; target_office_id: string; updated_by: string; allow_leader_move?: boolean }
): { ok: true; next: OfficeHierarchyState; from_office_id: string; to_office_id: string } | { ok: false; error_code: string; message: string } {
  const identity = trimText(input.identity, 80).toLowerCase();
  const targetOfficeId = normalizeOfficeId(input.target_office_id);
  if (!identity) {
    return { ok: false, error_code: "IDENTITY_REQUIRED", message: "Identidade do agente é obrigatória." };
  }

  const existing = state.rows.find((row) => String(row.office_id || "").toUpperCase() === targetOfficeId.toUpperCase());
  const targetNode = existing || {
    office_id: targetOfficeId,
    leader_id: "staff",
    subordinate_ids: [],
    updated_at_utc: nowUtc(),
    updated_by: "system"
  };

  const fromOfficeId = findOfficeForIdentity(state, identity);
  const isLeader = isOfficeLeader(state, identity);
  if (isLeader && !input.allow_leader_move) {
    return {
      ok: false,
      error_code: "LEADER_MOVE_FORBIDDEN",
      message: "Não é permitido mover líder de escritório por drag-and-drop."
    };
  }

  const now = nowUtc();
  const byOffice = new Map<string, OfficeNode>(state.rows.map((row) => [String(row.office_id || "").toUpperCase(), row]));
  byOffice.set(String(targetNode.office_id || "").toUpperCase(), targetNode);

  for (const [officeKey, row] of byOffice.entries()) {
    const cleanedSubs = sanitizeIdentityList(row.subordinate_ids).filter((item) => item !== identity);
    byOffice.set(officeKey, {
      ...row,
      subordinate_ids: cleanedSubs,
      updated_at_utc: now,
      updated_by: trimText(input.updated_by, 120) || "system"
    });
  }

  const targetKey = String(targetOfficeId || "").toUpperCase();
  const targetUpdated = byOffice.get(targetKey);
  if (!targetUpdated) {
    return { ok: false, error_code: "TARGET_OFFICE_NOT_FOUND", message: "Escritório de destino não encontrado." };
  }
  const nextSubs = sanitizeIdentityList([...targetUpdated.subordinate_ids, identity]).filter((item) => item !== targetUpdated.leader_id);
  byOffice.set(targetKey, {
    ...targetUpdated,
    subordinate_ids: nextSubs,
    updated_at_utc: now,
    updated_by: trimText(input.updated_by, 120) || "system"
  });

  for (const row of DEFAULT_OFFICES) {
    const officeKey = String(row.office_id || "").toUpperCase();
    if (!byOffice.has(officeKey)) {
      byOffice.set(officeKey, {
        ...row,
        updated_at_utc: now,
        updated_by: "system"
      });
    }
  }
  const rows = sortOfficeRows(Array.from(byOffice.values()));
  return {
    ok: true,
    next: {
      version: "1.0",
      updated_at_utc: now,
      rows
    },
    from_office_id: fromOfficeId,
    to_office_id: targetOfficeId
  };
}
