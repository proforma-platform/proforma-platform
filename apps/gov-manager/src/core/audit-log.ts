export interface AuditEventRow {
  event_id: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  before_state: string;
  after_state: string;
  correlation_id: string;
  source: string;
  created_at_utc: string;
}

export interface AuditLogState {
  version: "1.0";
  updated_at_utc: string;
  rows: AuditEventRow[];
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

export function defaultAuditLogState(): AuditLogState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: []
  };
}

export function sanitizeAuditLogState(input: unknown): AuditLogState {
  if (!input || typeof input !== "object") return defaultAuditLogState();
  const obj = input as Record<string, unknown>;
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
  const rows = rowsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const eventId = clampText(row.event_id, 120);
      if (!eventId) return null;
      return {
        event_id: eventId,
        actor: clampText(row.actor, 120),
        role: clampText(row.role, 24),
        action: clampText(row.action, 120),
        target: clampText(row.target, 180),
        before_state: clampText(row.before_state, 2000),
        after_state: clampText(row.after_state, 2000),
        correlation_id: clampText(row.correlation_id, 160),
        source: clampText(row.source, 120) || "gov-manager",
        created_at_utc: toIso(row.created_at_utc)
      } satisfies AuditEventRow;
    })
    .filter((row): row is AuditEventRow => Boolean(row))
    .sort((a, b) => String(b.created_at_utc).localeCompare(String(a.created_at_utc)))
    .slice(0, 10000);

  return {
    version: "1.0",
    updated_at_utc: toIso(obj.updated_at_utc),
    rows
  };
}

export function createAuditEventId(prefix = "AUD"): string {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export function appendAuditRows(state: AuditLogState, rows: AuditEventRow[]): AuditLogState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: [...rows, ...state.rows]
      .sort((a, b) => String(b.created_at_utc).localeCompare(String(a.created_at_utc)))
      .slice(0, 10000)
  };
}
