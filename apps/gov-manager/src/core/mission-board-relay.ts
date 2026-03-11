export interface ManagedMission {
  mission_id: string;
  objective: string;
  assignee: "STAFF" | "CPP" | "CPP-IA";
  priority: "P0" | "P1" | "P2" | "P3";
  status: string;
  notes: string;
  updated_at_utc: string;
  updated_by: string;
}

export interface MissionBoardState {
  version: "1.0";
  updated_at_utc: string;
  packages: Array<Record<string, unknown>>;
  missions: ManagedMission[];
}

function nowUtc(): string {
  return new Date().toISOString();
}

function trimText(value: unknown, max: number): string {
  return String(value || "").trim().slice(0, max);
}

function normalizeMissionId(value: unknown): string {
  return trimText(value, 120).toUpperCase();
}

function normalizePriority(value: unknown): ManagedMission["priority"] {
  const clean = trimText(value, 8).toUpperCase();
  if (clean === "P0" || clean === "P1" || clean === "P2" || clean === "P3") return clean;
  return "P2";
}

function normalizeAssignee(value: unknown): ManagedMission["assignee"] {
  const clean = trimText(value, 16).toUpperCase();
  if (clean === "CPP" || clean === "CPP-IA" || clean === "STAFF") return clean;
  return "STAFF";
}

function appendUniqueNote(current: string, block: string): string {
  const base = trimText(current, 3600);
  const extra = trimText(block, 900);
  if (!extra) return trimText(base, 4000);
  if (base.includes(extra)) return trimText(base, 4000);
  return trimText([base, extra].filter(Boolean).join("\n\n---\n"), 4000);
}

export function defaultMissionBoardState(): MissionBoardState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    packages: [],
    missions: []
  };
}

export function sanitizeMissionBoardState(input: unknown): MissionBoardState {
  if (!input || typeof input !== "object") return defaultMissionBoardState();
  const obj = input as Record<string, unknown>;
  const packages = Array.isArray(obj.packages) ? obj.packages.filter((item) => item && typeof item === "object") : [];
  const missionsRaw = Array.isArray(obj.missions) ? obj.missions : [];
  const missions = missionsRaw.reduce<ManagedMission[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const row = item as Record<string, unknown>;
    const missionId = normalizeMissionId(row.mission_id);
    if (!missionId) return acc;
    acc.push({
      mission_id: missionId,
      objective: trimText(row.objective, 240),
      assignee: normalizeAssignee(row.assignee),
      priority: normalizePriority(row.priority),
      status: trimText(row.status, 40) || "in_progress",
      notes: trimText(row.notes, 4000),
      updated_at_utc: trimText(row.updated_at_utc, 64) || nowUtc(),
      updated_by: trimText(row.updated_by, 120) || "staff@gov-manager"
    });
    return acc;
  }, []);

  return {
    version: "1.0",
    updated_at_utc: trimText(obj.updated_at_utc, 64) || nowUtc(),
    packages,
    missions: missions.sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc))).slice(0, 600)
  };
}

export function syncMissionBoardRelayStatus(
  state: MissionBoardState,
  input: {
    missionId: string;
    objective: string;
    assignee: string;
    priority: string;
    status: string;
    actor: string;
    now: string;
    completionNote?: string;
  }
): MissionBoardState {
  const missionId = normalizeMissionId(input.missionId);
  if (!missionId) return state;
  const current = state.missions.find((item) => normalizeMissionId(item.mission_id) === missionId);
  const nextMission: ManagedMission = {
    mission_id: missionId,
    objective: trimText(current?.objective || input.objective, 240),
    assignee: normalizeAssignee(current?.assignee || input.assignee),
    priority: normalizePriority(current?.priority || input.priority),
    status: trimText(input.status || current?.status, 40) || "in_progress",
    notes: input.status === "done" ? appendUniqueNote(current?.notes || "", input.completionNote || "") : trimText(current?.notes, 4000),
    updated_at_utc: input.now,
    updated_by: trimText(input.actor, 120) || "worker-relay"
  };
  const filtered = state.missions.filter((item) => normalizeMissionId(item.mission_id) !== missionId);
  return {
    ...state,
    updated_at_utc: input.now,
    missions: [nextMission, ...filtered].sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc))).slice(0, 600)
  };
}
