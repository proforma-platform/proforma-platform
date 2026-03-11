export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "ack" | "resolved";

export interface AlertRow {
  alert_id: string;
  type: string;
  severity: AlertSeverity;
  mission_id: string;
  queue_id: string;
  message: string;
  status: AlertStatus;
  source: string;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface AlertState {
  version: "1.0";
  updated_at_utc: string;
  rows: AlertRow[];
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

function sanitizeSeverity(value: unknown): AlertSeverity {
  const normalized = clampText(value, 16).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") return normalized;
  return "medium";
}

function sanitizeStatus(value: unknown): AlertStatus {
  const normalized = clampText(value, 16).toLowerCase();
  if (normalized === "open" || normalized === "ack" || normalized === "resolved") return normalized;
  return "open";
}

export function defaultAlertState(): AlertState {
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: []
  };
}

export function sanitizeAlertState(input: unknown): AlertState {
  if (!input || typeof input !== "object") return defaultAlertState();
  const obj = input as Record<string, unknown>;
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
  const rows = rowsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const alertId = clampText(row.alert_id, 120);
      if (!alertId) return null;
      return {
        alert_id: alertId,
        type: clampText(row.type, 80) || "generic",
        severity: sanitizeSeverity(row.severity),
        mission_id: clampText(row.mission_id, 120),
        queue_id: clampText(row.queue_id, 120),
        message: clampText(row.message, 300),
        status: sanitizeStatus(row.status),
        source: clampText(row.source, 120) || "gov-manager",
        created_at_utc: toIso(row.created_at_utc),
        updated_at_utc: toIso(row.updated_at_utc || row.created_at_utc)
      } satisfies AlertRow;
    })
    .filter((row): row is AlertRow => Boolean(row))
    .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
    .slice(0, 5000);

  return {
    version: "1.0",
    updated_at_utc: toIso(obj.updated_at_utc),
    rows
  };
}

export function createAlertId(prefix = "ALT"): string {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

export function upsertAlerts(state: AlertState, rows: AlertRow[]): AlertState {
  const map = new Map(state.rows.map((row) => [row.alert_id, row] as const));
  for (const row of rows) map.set(row.alert_id, row);
  return {
    version: "1.0",
    updated_at_utc: nowUtc(),
    rows: Array.from(map.values())
      .sort((a, b) => String(b.updated_at_utc).localeCompare(String(a.updated_at_utc)))
      .slice(0, 5000)
  };
}

export function summarizeAlerts(rows: AlertRow[]): {
  total: number;
  open: number;
  ack: number;
  resolved: number;
  critical: number;
} {
  let open = 0;
  let ack = 0;
  let resolved = 0;
  let critical = 0;
  for (const row of rows) {
    if (row.status === "open") open += 1;
    else if (row.status === "ack") ack += 1;
    else resolved += 1;
    if (row.severity === "critical") critical += 1;
  }
  return {
    total: rows.length,
    open,
    ack,
    resolved,
    critical
  };
}
