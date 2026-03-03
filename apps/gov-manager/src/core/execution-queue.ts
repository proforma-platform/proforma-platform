export type QueuePriority = "P0" | "P1" | "P2" | "P3";
export type QueueAssignee = "STAFF" | "CPP" | "CPP-IA";
export type QueueStatus = "open" | "in_progress" | "done" | "paused_waiting_owner";

export interface QueueItem {
  queue_id: string;
  mission_id: string;
  title: string;
  description: string;
  kind: string;
  priority: QueuePriority;
  assignee: QueueAssignee;
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
const STATUS_SET = new Set<QueueStatus>(["open", "in_progress", "done", "paused_waiting_owner"]);

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
      return {
        queue_id: queueId,
        mission_id: missionId,
        title,
        description: clampText(src.description, 800),
        kind: clampText(src.kind, 60) || "general",
        priority: normPriority(src.priority),
        assignee: normAssignee(src.assignee),
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
  const by_status: Record<QueueStatus, number> = { open: 0, in_progress: 0, done: 0, paused_waiting_owner: 0 };
  for (const row of rows) {
    by_assignee[row.assignee] += 1;
    by_priority[row.priority] += 1;
    by_status[row.status] += 1;
  }
  return { total: rows.length, by_assignee, by_priority, by_status };
}
